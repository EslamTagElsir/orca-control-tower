"""
Final 365-Day Holdout Evaluation Engine (Phase 2 — Experiment E8 Milestone 5).

Executes single-pass, strictly frozen out-of-sample evaluation on the 365-day final holdout set
(T_pred > 2014-08-24, exactly 1,013 shipments) using the cryptographically frozen policy
specification from artifacts/results/e8_frozen_policy.json.

STRICT GOVERNANCE RULES:
1. Zero holdout leakage: Model parameters and thresholds are fitted strictly on development data (T_pred <= 2014-08-24).
2. Frozen policy immutability: NO RETUNING, NO HYPERPARAMETER MODIFICATION, NO ADAPTATION based on holdout feedback.
3. Complete multi-scenario evaluation across Low, Base, and High cost regimes.
4. Operational review budget evaluation across VALUE_ONLY, RISK_ONLY, STANDARD, and COST_SENSITIVE at K in {0.05, 0.10, 0.20}.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np
import pandas as pd
import yaml

from delay_intelligence.cost_sensitive.backtester import (
    calculate_e8_metrics,
    compute_expected_calibration_error,
)
from delay_intelligence.cost_sensitive.budgeting import (
    BudgetMetrics,
    OperationalBudgetSimulator,
    OperationalPolicyType,
)
from delay_intelligence.cost_sensitive.cost_engine import (
    CostBreakdown,
    CostEngine,
    CostScenario,
    CostScenarioModel,
    FORBIDDEN_COLUMNS,
    LeakageViolationError,
)
from delay_intelligence.cost_sensitive.models import (
    BaseE8Strategy,
    CostThresholdCatBoostStrategy,
    CostWeightedCatBoostStrategy,
    StandardCatBoostStrategy,
    load_default_feature_schema,
    preprocess_features,
    sanitize_cost_inputs,
)
from delay_intelligence.cost_sensitive.policy_freeze import (
    ChampionStrategySpec,
    FrozenCostPolicy,
    FrozenFeatureContract,
    HoldoutLeakageError,
    MAX_ALLOWED_DEV_DATE_UTC,
    OperationalBudgetRuleSpec,
    compute_file_sha256,
    verify_temporal_holdout_isolation,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("e8_holdout_evaluator")


class FinalHoldoutEvaluator:
    """
    Executes single-pass final 365-day holdout evaluation for Experiment E8.
    """

    HOLDOUT_CUTOFF_DATE = "2014-08-24"
    EXPECTED_HOLDOUT_ROWS = 1013

    def __init__(
        self,
        frozen_policy_path: Union[str, Path] = "artifacts/results/e8_frozen_policy.json",
        features_path: Union[str, Path] = "artifacts/data/scms_modeling_features.parquet",
        cost_config_path: Union[str, Path] = "configs/cost_scenarios.yaml",
        output_dir: Union[str, Path] = "artifacts/results",
    ):
        """
        Initializes the Final Holdout Evaluator.

        Args:
            frozen_policy_path: Path to e8_frozen_policy.json.
            features_path: Path to scms_modeling_features.parquet.
            cost_config_path: Path to cost_scenarios.yaml.
            output_dir: Directory where holdout artifacts are stored.
        """
        self.frozen_policy_path = Path(frozen_policy_path)
        self.features_path = Path(features_path)
        self.cost_config_path = Path(cost_config_path)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Load frozen policy
        if not self.frozen_policy_path.exists():
            raise FileNotFoundError(f"Frozen policy file not found: {self.frozen_policy_path}")

        self.frozen_policy = FrozenCostPolicy.load_from_json(self.frozen_policy_path)
        self.cost_engine = CostScenarioModel(config_path=self.cost_config_path)
        self.feature_cols, self.num_cols, self.cat_cols = load_default_feature_schema()

        self.scenarios = ["low", "base", "high"]

    def load_and_split_data(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Loads the modeling dataset and strictly splits into development and holdout partitions.

        Returns:
            Tuple of (df_dev, df_holdout).
        """
        if not self.features_path.exists():
            raise FileNotFoundError(f"Features dataset not found: {self.features_path}")

        df = pd.read_parquet(self.features_path)
        df["T_pred"] = pd.to_datetime(df["T_pred"])
        df = df.sort_values("T_pred").reset_index(drop=True)

        cutoff = pd.to_datetime(self.HOLDOUT_CUTOFF_DATE)
        df_dev = df[df["T_pred"] <= cutoff].copy().reset_index(drop=True)
        df_holdout = df[df["T_pred"] > cutoff].copy().reset_index(drop=True)

        # Verify holdout isolation on development split
        verify_temporal_holdout_isolation(
            df_dev, date_col="T_pred", max_allowed_date=self.HOLDOUT_CUTOFF_DATE
        )

        if len(df_holdout) != self.EXPECTED_HOLDOUT_ROWS:
            logger.warning(
                f"Holdout row count ({len(df_holdout)}) differs from expected ({self.EXPECTED_HOLDOUT_ROWS})"
            )

        logger.info(
            f"Dataset partitioned: Development set = {len(df_dev)} rows (max date {df_dev['T_pred'].max()}), "
            f"Holdout set = {len(df_holdout)} rows (min date {df_holdout['T_pred'].min()} to max {df_holdout['T_pred'].max()})."
        )
        return df_dev, df_holdout

    def split_dev_inner_train_val(
        self,
        df_dev: pd.DataFrame,
        inner_val_ratio: float = 0.20,
        inner_gap_days: int = 30,
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Splits development data into chronological inner-train (80%) and inner-val (20%)
        separated by a 30-day embargo gap.
        """
        df_sorted = df_dev.sort_values("T_pred").reset_index(drop=True)
        t_start = df_sorted["T_pred"].min()
        t_end = df_sorted["T_pred"].max()
        duration_days = max(1, (t_end - t_start).days)

        val_days = int(duration_days * inner_val_ratio)
        val_start = t_end - pd.Timedelta(days=val_days)
        train_end = val_start - pd.Timedelta(days=inner_gap_days)

        inner_train = df_sorted[(df_sorted["T_pred"] >= t_start) & (df_sorted["T_pred"] < train_end)].copy()
        inner_val = df_sorted[df_sorted["T_pred"] >= val_start].copy()

        # Fallback safeguard
        if len(inner_train) < 100 or len(inner_val) < 50:
            split_idx = int(len(df_sorted) * (1.0 - inner_val_ratio))
            inner_train = df_sorted.iloc[:split_idx].copy()
            inner_val = df_sorted.iloc[split_idx:].copy()

        return inner_train, inner_val

    def fit_development_models(
        self,
        df_dev: pd.DataFrame,
    ) -> Tuple[StandardCatBoostStrategy, Dict[str, CostWeightedCatBoostStrategy]]:
        """
        Fits the core development models:
        1. Standard CatBoost model (with Isotonic Calibration on inner-val) -> shared across E8-A and E8-C strategies.
        2. Cost-weighted CatBoost models (E8-B) for each cost scenario.

        Returns:
            Tuple of (fitted_standard_strategy, dict_of_fitted_weighted_strategies).
        """
        inner_train, inner_val = self.split_dev_inner_train_val(df_dev)

        y_tr = inner_train["Delay_Flag"].to_numpy(dtype=int)
        y_v = inner_val["Delay_Flag"].to_numpy(dtype=int)
        X_tr = inner_train[self.feature_cols]
        X_v = inner_val[self.feature_cols]

        champion_spec = self.frozen_policy.champion
        hp = champion_spec.model_hyperparameters

        logger.info("Fitting Standard CatBoost Classifier on Development training set (5,554 samples)...")
        t0 = time.time()
        base_standard_strat = StandardCatBoostStrategy(
            threshold_mode="fixed",
            fixed_threshold=champion_spec.governed_standard_threshold,
            cost_engine=self.cost_engine,
            scenario_name="base",
            model_params=hp,
            cat_cols=self.cat_cols,
            num_cols=self.num_cols,
            feature_cols=self.feature_cols,
            calibrate=True,
        )
        base_standard_strat.fit(
            X_train=X_tr,
            y_train=y_tr,
            df_raw_train=inner_train,
            X_val=X_v,
            y_val=y_v,
            df_raw_val=inner_val,
        )
        logger.info(f"Standard CatBoost Classifier fitted and calibrated in {time.time() - t0:.2f}s.")

        # Fit Cost-Weighted CatBoost (E8-B) for each scenario
        weighted_strategies: Dict[str, CostWeightedCatBoostStrategy] = {}
        for sc in self.scenarios:
            logger.info(f"Fitting Cost-Weighted CatBoost (E8-B) for scenario '{sc}'...")
            t_sc = time.time()
            strat_b = CostWeightedCatBoostStrategy(
                threshold_mode="cost_optimal",
                fixed_threshold=0.50,
                epsilon=10.0,
                normalize=True,
                cost_engine=self.cost_engine,
                scenario_name=sc,
                model_params=hp,
                cat_cols=self.cat_cols,
                num_cols=self.num_cols,
                feature_cols=self.feature_cols,
                calibrate=False,
            )
            strat_b.fit(
                X_train=X_tr,
                y_train=y_tr,
                df_raw_train=inner_train,
                X_val=X_v,
                y_val=y_v,
                df_raw_val=inner_val,
            )
            weighted_strategies[sc] = strat_b
            logger.info(f"Cost-Weighted CatBoost for scenario '{sc}' fitted in {time.time() - t_sc:.2f}s.")

        return base_standard_strat, weighted_strategies

    def evaluate_holdout(
        self,
        save_artifacts: bool = True,
    ) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """
        Executes single-pass evaluation across all models, baselines, operational review budgets,
        and cost scenarios on the final 365-day holdout dataset.

        Returns:
            Tuple of (holdout_results_dataframe, holdout_metrics_summary_dict).
        """
        t_start_total = time.time()
        logger.info("Executing Final 365-Day Holdout Evaluation (Single Pass)...")

        df_dev, df_holdout = self.load_and_split_data()

        clean_holdout = sanitize_cost_inputs(df_holdout)
        y_holdout = df_holdout["Delay_Flag"].to_numpy(dtype=int)
        X_holdout = df_holdout[self.feature_cols]
        holdout_delay_days = (
            df_holdout["Delay_Days"].to_numpy(dtype=float)
            if "Delay_Days" in df_holdout.columns
            else None
        )
        holdout_usd_values = self.cost_engine.extract_monetary_values(clean_holdout)

        n_holdout = len(df_holdout)

        # Fit development models (once)
        base_standard_strat, weighted_strategies = self.fit_development_models(df_dev)

        # Compute calibrated probabilities on holdout (once)
        standard_cal_probs = base_standard_strat.predict_proba(X_holdout)

        champion_spec = self.frozen_policy.champion
        tau_f1_frozen = float(champion_spec.governed_f1_threshold)
        gamma_champion_frozen = float(champion_spec.gamma_tuned_multiplier)

        all_record_rows: List[Dict[str, Any]] = []
        unconstrained_metrics: Dict[str, Dict[str, Any]] = {}
        budget_metrics_summary: Dict[str, Dict[str, Any]] = {}

        # Loop over scenarios (Low, Base, High)
        for sc_name in self.scenarios:
            logger.info(f"Evaluating holdout under cost scenario: '{sc_name}'...")
            sc_obj = self.cost_engine.get_scenario(sc_name)
            self.cost_engine.set_scenario(sc_name)

            # Compute instance-dependent cost components on holdout
            holdout_costs_df = self.cost_engine.compute_costs(
                clean_holdout,
                scenario_name=sc_name,
                strict_leakage_check=True,
                return_dataframe=True,
            )

            unconstrained_metrics[sc_name] = {}
            budget_metrics_summary[sc_name] = {}

            # -------------------------------------------------------------
            # A. Evaluate Unconstrained Strategies & Baselines
            # -------------------------------------------------------------
            # Baselines: Do-Nothing & Always-Intervene
            do_nothing_decisions = np.zeros(n_holdout, dtype=int)
            always_decisions = np.ones(n_holdout, dtype=int)
            dummy_probs = np.full(n_holdout, float(np.mean(y_holdout)))

            m_do_nothing = calculate_e8_metrics(
                y_true=y_holdout,
                y_pred=do_nothing_decisions,
                y_prob=dummy_probs,
                thresholds=np.ones(n_holdout),
                costs_df=holdout_costs_df,
                delay_days=holdout_delay_days,
                days_saved_efficacy=sc_obj.days_saved_efficacy,
                values=holdout_usd_values,
            )
            m_do_nothing["strategy"] = "Do-Nothing"
            m_do_nothing["scenario"] = sc_name
            unconstrained_metrics[sc_name]["Do-Nothing"] = m_do_nothing

            m_always = calculate_e8_metrics(
                y_true=y_holdout,
                y_pred=always_decisions,
                y_prob=dummy_probs,
                thresholds=np.zeros(n_holdout),
                costs_df=holdout_costs_df,
                delay_days=holdout_delay_days,
                days_saved_efficacy=sc_obj.days_saved_efficacy,
                values=holdout_usd_values,
            )
            m_always["strategy"] = "Always-Intervene"
            m_always["scenario"] = sc_name
            unconstrained_metrics[sc_name]["Always-Intervene"] = m_always

            # Evaluated strategies for this scenario:
            # 1. E8-A_tau0.5: standard model + tau=0.50
            thresh_a05 = np.full(n_holdout, 0.50)
            dec_a05 = (standard_cal_probs >= thresh_a05).astype(int)
            m_a05 = calculate_e8_metrics(
                y_true=y_holdout,
                y_pred=dec_a05,
                y_prob=standard_cal_probs,
                thresholds=thresh_a05,
                costs_df=holdout_costs_df,
                delay_days=holdout_delay_days,
                days_saved_efficacy=sc_obj.days_saved_efficacy,
                values=holdout_usd_values,
            )
            m_a05["strategy"] = "E8-A_tau0.5"
            m_a05["scenario"] = sc_name
            unconstrained_metrics[sc_name]["E8-A_tau0.5"] = m_a05

            # 2. E8-A_f1: standard model + tau=tau_f1_frozen
            thresh_af1 = np.full(n_holdout, tau_f1_frozen)
            dec_af1 = (standard_cal_probs >= thresh_af1).astype(int)
            m_af1 = calculate_e8_metrics(
                y_true=y_holdout,
                y_pred=dec_af1,
                y_prob=standard_cal_probs,
                thresholds=thresh_af1,
                costs_df=holdout_costs_df,
                delay_days=holdout_delay_days,
                days_saved_efficacy=sc_obj.days_saved_efficacy,
                values=holdout_usd_values,
            )
            m_af1["strategy"] = "E8-A_f1"
            m_af1["scenario"] = sc_name
            unconstrained_metrics[sc_name]["E8-A_f1"] = m_af1

            # 3. E8-B_cost_weighted: scenario-specific weighted model
            strat_b = weighted_strategies[sc_name]
            probs_b = strat_b.predict_proba(X_holdout)
            thresh_b = strat_b.predict_thresholds(X_holdout, df_raw=clean_holdout)
            dec_b = (probs_b >= thresh_b).astype(int)
            m_b = calculate_e8_metrics(
                y_true=y_holdout,
                y_pred=dec_b,
                y_prob=probs_b,
                thresholds=thresh_b,
                costs_df=holdout_costs_df,
                delay_days=holdout_delay_days,
                days_saved_efficacy=sc_obj.days_saved_efficacy,
                values=holdout_usd_values,
            )
            m_b["strategy"] = "E8-B_cost_weighted"
            m_b["scenario"] = sc_name
            unconstrained_metrics[sc_name]["E8-B_cost_weighted"] = m_b

            # 4. E8-C_bayes_threshold: standard calibrated model + exact Bayes threshold (gamma=1.0)
            tau_star_bayes = holdout_costs_df["tau_star"].to_numpy(dtype=float)
            dec_c_bayes = (standard_cal_probs >= tau_star_bayes).astype(int)
            m_c_bayes = calculate_e8_metrics(
                y_true=y_holdout,
                y_pred=dec_c_bayes,
                y_prob=standard_cal_probs,
                thresholds=tau_star_bayes,
                costs_df=holdout_costs_df,
                delay_days=holdout_delay_days,
                days_saved_efficacy=sc_obj.days_saved_efficacy,
                values=holdout_usd_values,
            )
            m_c_bayes["strategy"] = "E8-C_bayes_threshold"
            m_c_bayes["scenario"] = sc_name
            unconstrained_metrics[sc_name]["E8-C_bayes_threshold"] = m_c_bayes

            # 5. E8-C_tuned_gamma: standard calibrated model + tuned Bayes threshold (gamma*=1.20) [CHAMPION]
            tau_star_champion = np.clip(gamma_champion_frozen * tau_star_bayes, 0.0, 1.0)
            dec_c_champ = (standard_cal_probs >= tau_star_champion).astype(int)
            m_c_champ = calculate_e8_metrics(
                y_true=y_holdout,
                y_pred=dec_c_champ,
                y_prob=standard_cal_probs,
                thresholds=tau_star_champion,
                costs_df=holdout_costs_df,
                delay_days=holdout_delay_days,
                days_saved_efficacy=sc_obj.days_saved_efficacy,
                values=holdout_usd_values,
            )
            m_c_champ["strategy"] = "E8-C_tuned_gamma"
            m_c_champ["scenario"] = sc_name
            m_c_champ["gamma"] = gamma_champion_frozen
            unconstrained_metrics[sc_name]["E8-C_tuned_gamma"] = m_c_champ

            strategy_predictions = {
                "E8-A_tau0.5": {"probs": standard_cal_probs, "thresholds": thresh_a05, "decisions": dec_a05},
                "E8-A_f1": {"probs": standard_cal_probs, "thresholds": thresh_af1, "decisions": dec_af1},
                "E8-B_cost_weighted": {"probs": probs_b, "thresholds": thresh_b, "decisions": dec_b},
                "E8-C_bayes_threshold": {"probs": standard_cal_probs, "thresholds": tau_star_bayes, "decisions": dec_c_bayes},
                "E8-C_tuned_gamma": {"probs": standard_cal_probs, "thresholds": tau_star_champion, "decisions": dec_c_champ},
            }

            # -------------------------------------------------------------
            # B. Evaluate Operational Review Budget Policies (5%, 10%, 20%)
            # -------------------------------------------------------------
            budget_sim = OperationalBudgetSimulator(
                cost_engine=self.cost_engine,
                scenario_name=sc_name,
            )

            budget_capacities = [0.05, 0.10, 0.20]
            budget_policies = [
                OperationalPolicyType.VALUE_ONLY,
                OperationalPolicyType.RISK_ONLY,
                OperationalPolicyType.STANDARD,
                OperationalPolicyType.COST_SENSITIVE,
            ]

            budget_decisions_map: Dict[str, Dict[float, np.ndarray]] = {}

            for k in budget_capacities:
                k_key = f"K_{int(k * 100):02d}pct"
                budget_metrics_summary[sc_name][k_key] = {}

                for pol in budget_policies:
                    pol_metrics = budget_sim.evaluate_cohort_under_budget(
                        y_true=y_holdout,
                        probs=standard_cal_probs,
                        costs_df=holdout_costs_df,
                        values=holdout_usd_values,
                        delay_days=holdout_delay_days,
                        budget_k=k,
                        policy=pol,
                        threshold_std=champion_spec.governed_standard_threshold,
                        days_saved_efficacy=sc_obj.days_saved_efficacy,
                    )
                    budget_metrics_summary[sc_name][k_key][pol.value] = pol_metrics.to_dict()

                    # Store decisions for parquet
                    dec, _ = budget_sim.compute_policy_decisions(
                        policy=pol,
                        probs=standard_cal_probs,
                        costs_df=holdout_costs_df,
                        values=holdout_usd_values,
                        budget_k=k,
                        threshold_std=champion_spec.governed_standard_threshold,
                    )
                    if pol.value not in budget_decisions_map:
                        budget_decisions_map[pol.value] = {}
                    budget_decisions_map[pol.value][k] = dec

            # Compute pairwise savings relative to baselines for budgeting
            for k in budget_capacities:
                k_key = f"K_{int(k * 100):02d}pct"
                cost_val = budget_metrics_summary[sc_name][k_key]["VALUE_ONLY"]["realized_business_cost"]
                cost_risk = budget_metrics_summary[sc_name][k_key]["RISK_ONLY"]["realized_business_cost"]
                cost_std = budget_metrics_summary[sc_name][k_key]["STANDARD"]["realized_business_cost"]

                for pol_name in [p.value for p in budget_policies]:
                    m_dict = budget_metrics_summary[sc_name][k_key][pol_name]
                    m_dict["net_savings_vs_value_only"] = float(cost_val - m_dict["realized_business_cost"])
                    m_dict["net_savings_vs_risk_only"] = float(cost_risk - m_dict["realized_business_cost"])
                    m_dict["net_savings_vs_standard"] = float(cost_std - m_dict["realized_business_cost"])

            # -------------------------------------------------------------
            # C. Collect Record-Level Holdout Parquet Rows
            # -------------------------------------------------------------
            scores_value = budget_sim.compute_priority_scores(
                OperationalPolicyType.VALUE_ONLY, standard_cal_probs, holdout_costs_df, holdout_usd_values
            )
            scores_risk = budget_sim.compute_priority_scores(
                OperationalPolicyType.RISK_ONLY, standard_cal_probs, holdout_costs_df, holdout_usd_values
            )
            scores_std = budget_sim.compute_priority_scores(
                OperationalPolicyType.STANDARD, standard_cal_probs, holdout_costs_df, holdout_usd_values
            )
            scores_cs = budget_sim.compute_priority_scores(
                OperationalPolicyType.COST_SENSITIVE, standard_cal_probs, holdout_costs_df, holdout_usd_values
            )

            # Vectorized creation of record rows for speed
            fn_costs_arr = holdout_costs_df["fn_cost"].to_numpy(dtype=float)
            fp_costs_arr = holdout_costs_df["fp_cost"].to_numpy(dtype=float)
            interv_costs_arr = holdout_costs_df["intervention_cost"].to_numpy(dtype=float)
            resid_costs_arr = holdout_costs_df["residual_delay_cost"].to_numpy(dtype=float)
            net_benefit_arr = holdout_costs_df["net_benefit"].to_numpy(dtype=float)
            none_costs_arr = np.where(y_holdout == 1, fn_costs_arr, 0.0)

            for i in range(n_holdout):
                row_raw = df_holdout.iloc[i]
                y_i = int(y_holdout[i])
                dd_i = float(holdout_delay_days[i]) if holdout_delay_days is not None else 0.0
                val_i = float(holdout_usd_values[i])

                record_entry = {
                    "ID": row_raw.get("ID", i),
                    "T_pred": str(row_raw["T_pred"]),
                    "scenario": sc_name,
                    "y_true": y_i,
                    "delay_days": dd_i,
                    "line_item_value_usd": val_i,
                    "Country": str(row_raw.get("Country", "missing")),
                    "Shipment_Mode": str(row_raw.get("Shipment Mode", "missing")),
                    "Product_Group": str(row_raw.get("Product Group", "missing")),
                    "fn_cost": float(fn_costs_arr[i]),
                    "fp_cost": float(fp_costs_arr[i]),
                    "intervention_cost": float(interv_costs_arr[i]),
                    "residual_delay_cost": float(resid_costs_arr[i]),
                    "net_benefit": float(net_benefit_arr[i]),
                    "tau_star_bayes": float(tau_star_bayes[i]),
                    "tau_star_champion": float(tau_star_champion[i]),
                    "do_nothing_cost": float(none_costs_arr[i]),
                    "priority_score_value": float(scores_value[i]),
                    "priority_score_risk": float(scores_risk[i]),
                    "priority_score_standard": float(scores_std[i]),
                    "priority_score_cost_sensitive": float(scores_cs[i]),
                    "budget_decision_cs_k05": int(budget_decisions_map["COST_SENSITIVE"][0.05][i]),
                    "budget_decision_cs_k10": int(budget_decisions_map["COST_SENSITIVE"][0.10][i]),
                    "budget_decision_cs_k20": int(budget_decisions_map["COST_SENSITIVE"][0.20][i]),
                    "budget_decision_val_k10": int(budget_decisions_map["VALUE_ONLY"][0.10][i]),
                    "budget_decision_risk_k10": int(budget_decisions_map["RISK_ONLY"][0.10][i]),
                    "budget_decision_std_k10": int(budget_decisions_map["STANDARD"][0.10][i]),
                }

                # Add model-specific predictions
                for strat_key, preds_dict in strategy_predictions.items():
                    p_i = float(preds_dict["probs"][i])
                    t_i = float(preds_dict["thresholds"][i])
                    d_i = int(preds_dict["decisions"][i])
                    int_i = float(interv_costs_arr[i])
                    res_i = float(resid_costs_arr[i])
                    fp_i = float(fp_costs_arr[i])
                    fn_i = float(fn_costs_arr[i])
                    real_cost_i = (int_i + res_i if y_i == 1 else fp_i) if d_i == 1 else (fn_i if y_i == 1 else 0.0)

                    record_entry[f"{strat_key}_prob"] = p_i
                    record_entry[f"{strat_key}_threshold"] = t_i
                    record_entry[f"{strat_key}_decision"] = d_i
                    record_entry[f"{strat_key}_realized_cost"] = float(real_cost_i)

                all_record_rows.append(record_entry)

        holdout_results_df = pd.DataFrame(all_record_rows)
        total_eval_time = time.time() - t_start_total

        # Build comprehensive structured metrics summary
        champion_summary: Dict[str, Any] = {}
        for sc in self.scenarios:
            champ_m = unconstrained_metrics[sc]["E8-C_tuned_gamma"]
            std_m = unconstrained_metrics[sc]["E8-A_tau0.5"]
            none_m = unconstrained_metrics[sc]["Do-Nothing"]

            champion_summary[sc] = {
                "realized_cost_champion": champ_m["realized_cost"],
                "realized_cost_standard_tau05": std_m["realized_cost"],
                "do_nothing_cost": none_m["realized_cost"],
                "net_savings_vs_do_nothing": champ_m["net_savings"],
                "cost_reduction_pct_vs_do_nothing": champ_m["cost_reduction_pct"],
                "net_savings_vs_standard_tau05": float(std_m["realized_cost"] - champ_m["realized_cost"]),
                "cost_reduction_pct_vs_standard_tau05": float(
                    ((std_m["realized_cost"] - champ_m["realized_cost"]) / std_m["realized_cost"] * 100.0)
                    if std_m["realized_cost"] > 0 else 0.0
                ),
                "delay_capture_rate": champ_m["recall"],
                "precision": champ_m["precision"],
                "f1": champ_m["f1"],
                "pr_auc": champ_m["pr_auc"],
                "roc_auc": champ_m["roc_auc"],
                "delay_days_captured": champ_m["delay_days_captured"],
                "total_reviews": champ_m["reviews_count"],
                "review_coverage_pct": champ_m["review_coverage"] * 100.0,
            }

        metrics_payload = {
            "metadata": {
                "policy_version": self.frozen_policy.metadata.get("policy_version", "1.0.0-frozen-dev"),
                "experiment": "Phase 2 — E8 Cost-Sensitive Learning",
                "milestone": "M5 Final 365-Day Holdout Evaluation",
                "evaluation_timestamp_utc": datetime.now(timezone.utc).isoformat(),
                "holdout_start_date_utc": self.HOLDOUT_CUTOFF_DATE,
                "holdout_date_range": f"{df_holdout['T_pred'].min().date()} to {df_holdout['T_pred'].max().date()}",
                "holdout_sample_count": n_holdout,
                "holdout_positives_count": int(np.sum(y_holdout)),
                "holdout_delay_rate": float(np.mean(y_holdout)),
                "champion_strategy": self.frozen_policy.champion.strategy_name,
                "champion_gamma": self.frozen_policy.champion.gamma_tuned_multiplier,
                "total_evaluation_time_sec": float(total_eval_time),
                "evaluation_status": "STRICT_SINGLE_PASS_COMPLETE",
            },
            "unconstrained_evaluation": unconstrained_metrics,
            "operational_budget_evaluation": budget_metrics_summary,
            "champion_performance_summary": champion_summary,
        }

        # Save artifacts
        if save_artifacts:
            parquet_path = self.output_dir / "e8_final_holdout_results.parquet"
            json_path = self.output_dir / "e8_final_holdout_metrics.json"

            holdout_results_df.to_parquet(parquet_path, index=False)
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(metrics_payload, f, indent=2)

            logger.info(f"Successfully saved final holdout results to {parquet_path} ({len(holdout_results_df)} rows)")
            logger.info(f"Successfully saved final holdout metrics summary to {json_path}")

        return holdout_results_df, metrics_payload


def run_e8_holdout_evaluation(
    frozen_policy_path: str = "artifacts/results/e8_frozen_policy.json",
    features_path: str = "artifacts/data/scms_modeling_features.parquet",
    cost_config_path: str = "configs/cost_scenarios.yaml",
    output_dir: str = "artifacts/results",
) -> Dict[str, Any]:
    """Convenience runner function for final holdout evaluation."""
    evaluator = FinalHoldoutEvaluator(
        frozen_policy_path=frozen_policy_path,
        features_path=features_path,
        cost_config_path=cost_config_path,
        output_dir=output_dir,
    )
    _, summary = evaluator.evaluate_holdout(save_artifacts=True)
    return summary


if __name__ == "__main__":
    run_e8_holdout_evaluation()
