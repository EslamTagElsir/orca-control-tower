"""
Cost Parameter Sensitivity and Policy Robustness Analysis (Phase 2 — Experiment E8).

Performs systematic cost parameter perturbation analysis (+/-20%, +/-50%) across operational
cost assumptions to evaluate policy stability and resilience against economic uncertainty.

Evaluates perturbations across:
- c_daily_base: Base daily operational delay penalty ($/day)
- rho_value: Value-scaled daily holding/perishability rate (%/day)
- c_fixed_stockout: Fixed emergency stockout response administrative fee ($)
- c_triage_base: Baseline analyst triage labor cost ($)
- c_expedite_base: Base carrier expediting fee ($)
- days_saved_efficacy: Expected delay reduction from proactive mitigation (days)
- beta_audit: Value-logarithm audit scaling factor ($/log($))
- gamma_expedite: Value-proportional freight insurance/handling surcharge (%)

Classifies candidate policies into three formal robustness categories:
- ROBUST: Maintains cost advantage across >= 85% of perturbation points (win_rate >= 0.85).
- SENSITIVE: Advantage holds only near baseline assumptions (0.50 <= win_rate < 0.85).
- UNSUPPORTED: Fragile or inferior under perturbation (win_rate < 0.50).
"""

from __future__ import annotations

from enum import Enum
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np
import pandas as pd
from pydantic import BaseModel, ConfigDict, Field

from delay_intelligence.cost_sensitive.budgeting import OperationalBudgetSimulator, OperationalPolicyType
from delay_intelligence.cost_sensitive.cost_engine import (
    CostBreakdown,
    CostEngine,
    CostScenario,
    CostScenarioModel,
    FORBIDDEN_COLUMNS,
    LeakageViolationError,
)

logger = logging.getLogger(__name__)


class RobustnessClassification(str, Enum):
    """Formal classification of policy robustness under economic perturbation."""
    ROBUST = "ROBUST"
    SENSITIVE = "SENSITIVE"
    UNSUPPORTED = "UNSUPPORTED"


class PerturbationGridResult(BaseModel):
    """Container holding results of a single perturbation evaluation point."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    parameter_name: str = Field(..., description="Perturbed parameter name or 'joint_scenario'")
    multiplier: float = Field(..., description="Perturbation multiplier factor (e.g. 0.5, 0.8, 1.0, 1.2, 1.5)")
    delta_pct: float = Field(..., description="Percentage change from baseline (+/-20%, +/-50%)")
    perturbed_scenario_name: str = Field(..., description="Name of the scenario tested")
    strategy_or_policy: str = Field(..., description="Evaluated strategy or policy name")
    realized_cost: float = Field(..., description="Realized business cost under perturbed parameters ($)")
    do_nothing_cost: float = Field(..., description="Do-Nothing baseline cost ($)")
    net_savings: float = Field(..., description="Dollar savings vs Do-Nothing ($)")
    cost_reduction_pct: float = Field(..., description="Percentage cost reduction vs Do-Nothing (%)")
    reference_realized_cost: Optional[float] = Field(default=None, description="Realized cost of reference baseline ($)")
    cost_advantage_vs_reference: Optional[float] = Field(default=None, description="Dollar advantage over reference baseline ($)")
    is_win_vs_reference: Optional[bool] = Field(default=None, description="True if candidate beats reference baseline")


class PolicyRobustnessReport(BaseModel):
    """Summary of policy robustness classification and win-rate statistics."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    policy_name: str = Field(..., description="Policy or strategy evaluated")
    reference_baseline: str = Field(..., description="Reference comparison baseline")
    classification: RobustnessClassification = Field(..., description="ROBUST, SENSITIVE, or UNSUPPORTED")
    total_perturbations: int = Field(..., description="Total perturbation test points evaluated")
    wins_count: int = Field(..., description="Number of perturbation points where candidate beats reference")
    win_rate: float = Field(..., description="Fraction of perturbation points won (wins / total)")
    mean_cost_reduction_pct: float = Field(..., description="Average cost reduction % across all perturbations")
    min_cost_reduction_pct: float = Field(..., description="Minimum cost reduction % observed")
    max_cost_reduction_pct: float = Field(..., description="Maximum cost reduction % observed")
    mean_net_savings_usd: float = Field(..., description="Average net savings vs Do-Nothing across perturbations")
    mean_advantage_vs_reference_usd: float = Field(..., description="Average dollar advantage over reference baseline")


class CostSensitivityAnalyzer:
    """
    Engine for executing parameter sensitivity sweeps, joint stress tests,
    and policy robustness classification over development backtest results.
    """

    DEFAULT_MULTIPLIERS: List[float] = [0.50, 0.80, 1.00, 1.20, 1.50]
    KEY_PARAMETERS: List[str] = [
        "c_daily_base",
        "rho_value",
        "c_fixed_stockout",
        "c_triage_base",
        "c_expedite_base",
        "days_saved_efficacy",
        "beta_audit",
        "gamma_expedite",
    ]

    def __init__(
        self,
        config_path: Union[str, Path] = "configs/cost_scenarios.yaml",
        base_scenario_name: str = "base",
    ):
        """
        Initializes the sensitivity analyzer.

        Args:
            config_path: Path to YAML cost scenarios.
            base_scenario_name: Scenario to serve as the unperturbed baseline.
        """
        self.config_path = Path(config_path)
        self.base_scenario_name = base_scenario_name.lower()
        self.cost_engine = CostScenarioModel(config_path=self.config_path, scenario_name=self.base_scenario_name)

    def create_perturbed_scenario(
        self,
        perturbations: Dict[str, float],
        base_scenario_name: Optional[str] = None,
        custom_name: str = "perturbed",
    ) -> CostScenario:
        """
        Creates a new CostScenario with specific parameter multipliers or absolute values applied.

        Args:
            perturbations: Dictionary mapping parameter names to multiplier factors (e.g. {'c_daily_base': 1.20}).
            base_scenario_name: Name of baseline scenario.
            custom_name: Name for the perturbed scenario.

        Returns:
            New CostScenario instance.
        """
        base_sc = self.cost_engine.get_scenario(base_scenario_name or self.base_scenario_name)
        sc_dict = base_sc.model_dump()
        sc_dict["name"] = custom_name
        sc_dict["description"] = f"Perturbed from {base_sc.name} with {perturbations}"

        for param, mult in perturbations.items():
            if param in sc_dict:
                orig_val = sc_dict[param]
                if isinstance(orig_val, (int, float)):
                    new_val = float(orig_val * mult)
                    # Enforce valid bounds
                    if param == "days_saved_efficacy":
                        max_days = sc_dict.get("delay_days_assumed", 12.0)
                        new_val = min(new_val, max_days * 0.99)
                        new_val = max(0.5, new_val)
                    elif param in ["c_daily_base", "c_triage_base", "c_expedite_base", "delay_days_assumed"]:
                        new_val = max(1.0, new_val)
                    elif param in ["rho_value", "c_fixed_stockout", "beta_audit", "gamma_expedite"]:
                        new_val = max(0.0, new_val)
                    sc_dict[param] = new_val

        return CostScenario(**sc_dict)

    def evaluate_cohort_under_perturbed_scenario(
        self,
        df_cohort: pd.DataFrame,
        perturbed_scenario: CostScenario,
        base_scenario_name: Optional[str] = None,
    ) -> pd.DataFrame:
        """
        Recomputes instance-dependent costs and decision thresholds under a perturbed scenario
        preserving all historical instance-level criticality and transport friction multipliers.

        Args:
            df_cohort: Backtest subset DataFrame containing validation instances.
            perturbed_scenario: Perturbed CostScenario instance.
            base_scenario_name: Baseline scenario name.

        Returns:
            DataFrame with updated instance costs (fn_cost, fp_cost, intervention_cost, residual_delay_cost, net_benefit, tau_star).
        """
        base_sc = self.cost_engine.get_scenario(base_scenario_name or self.base_scenario_name)

        v = df_cohort["line_item_value_usd"].to_numpy(dtype=float)
        n = len(v)

        # Baseline holding penalty rate
        h_base = base_sc.c_daily_base + base_sc.rho_value * v

        # If baseline fn_cost exists in df_cohort, extract exact instance multiplier (kappa_i * lambda_mode(i))
        if "fn_cost" in df_cohort.columns:
            fn_base = df_cohort["fn_cost"].to_numpy(dtype=float)
            denom_base = base_sc.c_fixed_stockout + h_base * base_sc.delay_days_assumed
            denom_base = np.maximum(1e-9, denom_base)
            kappa_lambda = np.maximum(0.5, fn_base / denom_base)
        else:
            kappa_lambda = np.ones(n, dtype=float)

        # If baseline fp_cost exists, extract exact sourcing inquiry friction
        if "fp_cost" in df_cohort.columns:
            fp_base = df_cohort["fp_cost"].to_numpy(dtype=float)
            c_inquiry_base = fp_base - base_sc.c_triage_base - base_sc.beta_audit * np.log1p(v)
            c_inquiry_base = np.maximum(0.0, c_inquiry_base)
        else:
            c_inquiry_base = np.full(n, base_sc.c_direct_inquiry, dtype=float)

        # Compute perturbed instance components
        sc = perturbed_scenario
        h_pert = sc.c_daily_base + sc.rho_value * v
        r_days_pert = max(0.0, sc.delay_days_assumed - sc.days_saved_efficacy)

        fn_cost = kappa_lambda * (sc.c_fixed_stockout + h_pert * sc.delay_days_assumed)
        fp_cost = sc.c_triage_base + sc.beta_audit * np.log1p(v) + c_inquiry_base
        intervention_cost = sc.c_expedite_base + sc.gamma_expedite * v
        residual_delay_cost = kappa_lambda * (h_pert * r_days_pert)
        net_benefit = fn_cost - (intervention_cost + residual_delay_cost)

        denom_tau = np.maximum(1e-9, net_benefit + fp_cost)
        tau_star = np.clip(fp_cost / denom_tau, 0.0, 1.0)
        tau_star_simple = np.clip(fp_cost / np.maximum(1e-9, fn_cost + fp_cost), 0.0, 1.0)
        asymmetry_ratio = fn_cost / np.maximum(1e-9, fp_cost)

        return pd.DataFrame({
            "fn_cost": fn_cost,
            "fp_cost": fp_cost,
            "intervention_cost": intervention_cost,
            "residual_delay_cost": residual_delay_cost,
            "net_benefit": net_benefit,
            "tau_star": tau_star,
            "tau_star_simple": tau_star_simple,
            "asymmetry_ratio": asymmetry_ratio,
        }, index=df_cohort.index)


    def run_one_at_a_time_sensitivity(
        self,
        df_backtest: pd.DataFrame,
        scenario_name: str = "base",
        parameters: Optional[Sequence[str]] = None,
        multipliers: Optional[Sequence[float]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Executes 1D parameter sweeps varying each cost parameter across the perturbation grid
        while holding other parameters at their baseline values.

        Args:
            df_backtest: Development backtest DataFrame.
            scenario_name: Baseline scenario name.
            parameters: List of parameter names to perturb (defaults to KEY_PARAMETERS).
            multipliers: List of multipliers (defaults to DEFAULT_MULTIPLIERS).

        Returns:
            List of dictionary records for each parameter, multiplier, fold, and strategy.
        """
        params = list(parameters or self.KEY_PARAMETERS)
        mults = list(multipliers or self.DEFAULT_MULTIPLIERS)
        strategies = list(df_backtest["strategy"].unique())
        folds = sorted(df_backtest["fold_id"].unique())

        results: List[Dict[str, Any]] = []

        for param in params:
            for mult in mults:
                delta_pct = (mult - 1.0) * 100.0
                sc_name = f"{param}_{mult:.2f}"
                perturbed_sc = self.create_perturbed_scenario(
                    perturbations={param: mult},
                    base_scenario_name=scenario_name,
                    custom_name=sc_name,
                )

                for fold_id in folds:
                    # Filter backtest cohort for fold
                    sub_fold = df_backtest[
                        (df_backtest["scenario"] == scenario_name)
                        & (df_backtest["fold_id"] == fold_id)
                    ]
                    if len(sub_fold) == 0:
                        continue

                    # Get one representative sub for cost recomputation
                    rep_strat = strategies[0]
                    sub_rep = sub_fold[sub_fold["strategy"] == rep_strat]
                    if len(sub_rep) == 0:
                        continue

                    # Recompute perturbed costs on this fold cohort
                    perturbed_costs_df = self.evaluate_cohort_under_perturbed_scenario(
                        df_cohort=sub_rep,
                        perturbed_scenario=perturbed_sc,
                    )
                    y_true = sub_rep["y_true"].to_numpy(dtype=int)
                    values = sub_rep["line_item_value_usd"].to_numpy(dtype=float)
                    delay_days = sub_rep["delay_days"].to_numpy(dtype=float) if "delay_days" in sub_rep.columns else None

                    do_nothing_cost = float(CostScenarioModel.compute_expected_cost(
                        y_true, np.zeros_like(y_true), perturbed_costs_df
                    ))

                    # Evaluate each modeling strategy on this fold under perturbed costs
                    for strat in strategies:
                        strat_sub = sub_fold[sub_fold["strategy"] == strat]
                        if len(strat_sub) == 0:
                            continue

                        probs = strat_sub["prob_pred"].to_numpy(dtype=float)
                        thresh = float(strat_sub["threshold"].iloc[0]) if "threshold" in strat_sub.columns else 0.50

                        # Decision rule:
                        # For E8-C strategies, evaluate using the instance Bayes optimal threshold under the perturbed cost model
                        if "E8-C" in strat:
                            # Recompute tau* under perturbed costs
                            tau_star = perturbed_costs_df["tau_star"].to_numpy(dtype=float)
                            if "tuned_gamma" in strat:
                                # Apply tuned gamma if present
                                net_b = perturbed_costs_df["net_benefit"].to_numpy(dtype=float)
                                fp_c = perturbed_costs_df["fp_cost"].to_numpy(dtype=float)
                                # Tuned gamma on dev is ~1.20
                                tau_star = np.clip(fp_c / np.maximum(1e-9, 1.20 * net_b + fp_c), 0.0, 1.0)
                            decisions = (probs >= tau_star).astype(int)
                        elif strat == "E8-A_tau0.5":
                            decisions = (probs >= 0.50).astype(int)
                        elif strat == "E8-A_f1":
                            decisions = (probs >= thresh).astype(int)
                        else:  # E8-B
                            decisions = (probs >= thresh).astype(int)

                        realized_cost = float(CostScenarioModel.compute_expected_cost(
                            y_true, decisions, perturbed_costs_df
                        ))
                        net_savings = float(do_nothing_cost - realized_cost)
                        cost_red_pct = float(
                            (net_savings / do_nothing_cost * 100.0) if do_nothing_cost > 0 else 0.0
                        )

                        results.append({
                            "perturbation_type": "one_at_a_time",
                            "parameter_name": param,
                            "multiplier": float(mult),
                            "delta_pct": float(delta_pct),
                            "fold_id": int(fold_id),
                            "strategy": strat,
                            "realized_cost": realized_cost,
                            "do_nothing_cost": do_nothing_cost,
                            "net_savings": net_savings,
                            "cost_reduction_pct": cost_red_pct,
                            "reviews_count": int(np.sum(decisions)),
                            "positives_captured": int(np.sum((decisions == 1) & (y_true == 1))),
                        })

                    # Also evaluate Operational Budget Policies (COST_SENSITIVE, VALUE_ONLY, RISK_ONLY) under budget K=0.10
                    for k_val in [0.05, 0.10, 0.20]:
                        budget_sim = OperationalBudgetSimulator(custom_scenario=perturbed_sc)
                        # We evaluate policies with rep probs (standard/calibrated probs)
                        for pol_enum in [OperationalPolicyType.COST_SENSITIVE, OperationalPolicyType.VALUE_ONLY, OperationalPolicyType.RISK_ONLY, OperationalPolicyType.STANDARD]:
                            pol_decisions, _ = OperationalBudgetSimulator.compute_policy_decisions(
                                policy=pol_enum,
                                probs=probs,
                                costs_df=perturbed_costs_df,
                                values=values,
                                budget_k=k_val,
                                threshold_std=0.50,
                                strictly_positive_benefit=True,
                            )
                            pol_realized = float(CostScenarioModel.compute_expected_cost(
                                y_true, pol_decisions, perturbed_costs_df
                            ))
                            pol_net_save = float(do_nothing_cost - pol_realized)
                            pol_cost_red = float(
                                (pol_net_save / do_nothing_cost * 100.0) if do_nothing_cost > 0 else 0.0
                            )

                            results.append({
                                "perturbation_type": "one_at_a_time",
                                "parameter_name": param,
                                "multiplier": float(mult),
                                "delta_pct": float(delta_pct),
                                "fold_id": int(fold_id),
                                "strategy": f"BUDGET_{pol_enum.value}_k{int(k_val * 100):02d}",
                                "realized_cost": pol_realized,
                                "do_nothing_cost": do_nothing_cost,
                                "net_savings": pol_net_save,
                                "cost_reduction_pct": pol_cost_red,
                                "reviews_count": int(np.sum(pol_decisions)),
                                "positives_captured": int(np.sum((pol_decisions == 1) & (y_true == 1))),
                            })

        return results

    def run_stress_scenarios(
        self,
        df_backtest: pd.DataFrame,
        scenario_name: str = "base",
    ) -> List[Dict[str, Any]]:
        """
        Evaluates multi-parameter stress scenarios:
        1. all_penalties_plus_50pct
        2. all_penalties_minus_50pct
        3. all_frictions_plus_50pct
        4. all_frictions_minus_50pct
        5. high_penalty_low_friction (Extreme asymmetric sensitivity)
        6. low_penalty_high_friction (Extreme friction resistance)
        7. low_efficacy_half (Efficacy reduced by 50%)

        Args:
            df_backtest: Development backtest DataFrame.
            scenario_name: Baseline scenario name.

        Returns:
            List of stress test result records.
        """
        stress_defs = {
            "all_penalties_plus_50pct": {
                "c_daily_base": 1.50,
                "rho_value": 1.50,
                "c_fixed_stockout": 1.50,
            },
            "all_penalties_minus_50pct": {
                "c_daily_base": 0.50,
                "rho_value": 0.50,
                "c_fixed_stockout": 0.50,
            },
            "all_frictions_plus_50pct": {
                "c_triage_base": 1.50,
                "c_expedite_base": 1.50,
                "beta_audit": 1.50,
                "gamma_expedite": 1.50,
            },
            "all_frictions_minus_50pct": {
                "c_triage_base": 0.50,
                "c_expedite_base": 0.50,
                "beta_audit": 0.50,
                "gamma_expedite": 0.50,
            },
            "high_penalty_low_friction": {
                "c_daily_base": 1.50,
                "rho_value": 1.50,
                "c_fixed_stockout": 1.50,
                "c_triage_base": 0.50,
                "c_expedite_base": 0.50,
            },
            "low_penalty_high_friction": {
                "c_daily_base": 0.50,
                "rho_value": 0.50,
                "c_fixed_stockout": 0.50,
                "c_triage_base": 1.50,
                "c_expedite_base": 1.50,
            },
            "low_efficacy_half": {
                "days_saved_efficacy": 0.50,
            },
        }

        strategies = list(df_backtest["strategy"].unique())
        folds = sorted(df_backtest["fold_id"].unique())
        results: List[Dict[str, Any]] = []

        for stress_name, perts in stress_defs.items():
            perturbed_sc = self.create_perturbed_scenario(
                perturbations=perts,
                base_scenario_name=scenario_name,
                custom_name=stress_name,
            )

            for fold_id in folds:
                sub_fold = df_backtest[
                    (df_backtest["scenario"] == scenario_name)
                    & (df_backtest["fold_id"] == fold_id)
                ]
                if len(sub_fold) == 0:
                    continue

                rep_strat = strategies[0]
                sub_rep = sub_fold[sub_fold["strategy"] == rep_strat]
                if len(sub_rep) == 0:
                    continue

                perturbed_costs_df = self.evaluate_cohort_under_perturbed_scenario(
                    df_cohort=sub_rep,
                    perturbed_scenario=perturbed_sc,
                )
                y_true = sub_rep["y_true"].to_numpy(dtype=int)
                values = sub_rep["line_item_value_usd"].to_numpy(dtype=float)
                do_nothing_cost = float(CostScenarioModel.compute_expected_cost(
                    y_true, np.zeros_like(y_true), perturbed_costs_df
                ))

                for strat in strategies:
                    strat_sub = sub_fold[sub_fold["strategy"] == strat]
                    if len(strat_sub) == 0:
                        continue

                    probs = strat_sub["prob_pred"].to_numpy(dtype=float)
                    thresh = float(strat_sub["threshold"].iloc[0]) if "threshold" in strat_sub.columns else 0.50

                    if "E8-C" in strat:
                        tau_star = perturbed_costs_df["tau_star"].to_numpy(dtype=float)
                        if "tuned_gamma" in strat:
                            net_b = perturbed_costs_df["net_benefit"].to_numpy(dtype=float)
                            fp_c = perturbed_costs_df["fp_cost"].to_numpy(dtype=float)
                            tau_star = np.clip(fp_c / np.maximum(1e-9, 1.20 * net_b + fp_c), 0.0, 1.0)
                        decisions = (probs >= tau_star).astype(int)
                    elif strat == "E8-A_tau0.5":
                        decisions = (probs >= 0.50).astype(int)
                    else:
                        decisions = (probs >= thresh).astype(int)

                    realized_cost = float(CostScenarioModel.compute_expected_cost(
                        y_true, decisions, perturbed_costs_df
                    ))
                    net_savings = float(do_nothing_cost - realized_cost)
                    cost_red_pct = float(
                        (net_savings / do_nothing_cost * 100.0) if do_nothing_cost > 0 else 0.0
                    )

                    results.append({
                        "perturbation_type": "joint_stress",
                        "parameter_name": stress_name,
                        "multiplier": 1.0,
                        "delta_pct": 0.0,
                        "fold_id": int(fold_id),
                        "strategy": strat,
                        "realized_cost": realized_cost,
                        "do_nothing_cost": do_nothing_cost,
                        "net_savings": net_savings,
                        "cost_reduction_pct": cost_red_pct,
                        "reviews_count": int(np.sum(decisions)),
                        "positives_captured": int(np.sum((decisions == 1) & (y_true == 1))),
                    })

                # Budget Policies under Stress
                for k_val in [0.05, 0.10, 0.20]:
                    for pol_enum in [OperationalPolicyType.COST_SENSITIVE, OperationalPolicyType.VALUE_ONLY, OperationalPolicyType.RISK_ONLY, OperationalPolicyType.STANDARD]:
                        pol_decisions, _ = OperationalBudgetSimulator.compute_policy_decisions(
                            policy=pol_enum,
                            probs=probs,
                            costs_df=perturbed_costs_df,
                            values=values,
                            budget_k=k_val,
                            threshold_std=0.50,
                            strictly_positive_benefit=True,
                        )
                        pol_realized = float(CostScenarioModel.compute_expected_cost(
                            y_true, pol_decisions, perturbed_costs_df
                        ))
                        pol_net_save = float(do_nothing_cost - pol_realized)
                        pol_cost_red = float(
                            (pol_net_save / do_nothing_cost * 100.0) if do_nothing_cost > 0 else 0.0
                        )

                        results.append({
                            "perturbation_type": "joint_stress",
                            "parameter_name": stress_name,
                            "multiplier": 1.0,
                            "delta_pct": 0.0,
                            "fold_id": int(fold_id),
                            "strategy": f"BUDGET_{pol_enum.value}_k{int(k_val * 100):02d}",
                            "realized_cost": pol_realized,
                            "do_nothing_cost": do_nothing_cost,
                            "net_savings": pol_net_save,
                            "cost_reduction_pct": pol_cost_red,
                            "reviews_count": int(np.sum(pol_decisions)),
                            "positives_captured": int(np.sum((pol_decisions == 1) & (y_true == 1))),
                        })

        return results

    @classmethod
    def classify_robustness(
        cls,
        results_df: pd.DataFrame,
        candidate_strategy: str,
        reference_baseline: str = "E8-A_f1",
    ) -> PolicyRobustnessReport:
        """
        Evaluates and classifies the robustness of a candidate strategy vs a reference baseline.

        Classification rules:
        - ROBUST: Win rate >= 0.85 (beats baseline in >= 85% of evaluated perturbation points)
        - SENSITIVE: 0.50 <= Win rate < 0.85
        - UNSUPPORTED: Win rate < 0.50

        Args:
            results_df: DataFrame containing all perturbation records.
            candidate_strategy: Strategy/policy name to test.
            reference_baseline: Baseline to compare against.

        Returns:
            PolicyRobustnessReport with classification and metric bounds.
        """
        # Group by perturbation point (parameter_name, multiplier, perturbation_type) aggregated across folds
        cand_df = results_df[results_df["strategy"] == candidate_strategy]
        ref_df = results_df[results_df["strategy"] == reference_baseline]

        if len(cand_df) == 0:
            raise ValueError(f"Candidate strategy '{candidate_strategy}' not found in results")
        if len(ref_df) == 0:
            raise ValueError(f"Reference baseline '{reference_baseline}' not found in results")

        # Aggregate total realized cost across folds for each perturbation setting
        cand_agg = cand_df.groupby(["perturbation_type", "parameter_name", "multiplier", "delta_pct"])[
            ["realized_cost", "do_nothing_cost", "net_savings"]
        ].sum().reset_index()

        ref_agg = ref_df.groupby(["perturbation_type", "parameter_name", "multiplier", "delta_pct"])[
            ["realized_cost", "do_nothing_cost", "net_savings"]
        ].sum().reset_index()

        merged = pd.merge(
            cand_agg,
            ref_agg,
            on=["perturbation_type", "parameter_name", "multiplier", "delta_pct"],
            suffixes=("_cand", "_ref"),
        )

        merged["advantage_usd"] = merged["realized_cost_ref"] - merged["realized_cost_cand"]
        merged["cost_red_pct_cand"] = (
            merged["net_savings_cand"] / np.maximum(1.0, merged["do_nothing_cost_cand"]) * 100.0
        )
        merged["is_win"] = merged["advantage_usd"] >= 0.0

        total_pts = len(merged)
        wins = int(merged["is_win"].sum())
        win_rate = float((wins / total_pts) if total_pts > 0 else 0.0)

        if win_rate >= 0.85:
            classification = RobustnessClassification.ROBUST
        elif win_rate >= 0.50:
            classification = RobustnessClassification.SENSITIVE
        else:
            classification = RobustnessClassification.UNSUPPORTED

        return PolicyRobustnessReport(
            policy_name=candidate_strategy,
            reference_baseline=reference_baseline,
            classification=classification,
            total_perturbations=total_pts,
            wins_count=wins,
            win_rate=win_rate,
            mean_cost_reduction_pct=float(merged["cost_red_pct_cand"].mean()),
            min_cost_reduction_pct=float(merged["cost_red_pct_cand"].min()),
            max_cost_reduction_pct=float(merged["cost_red_pct_cand"].max()),
            mean_net_savings_usd=float(merged["net_savings_cand"].mean()),
            mean_advantage_vs_reference_usd=float(merged["advantage_usd"].mean()),
        )

    def run_full_sensitivity_suite(
        self,
        df_backtest: pd.DataFrame,
        scenario_name: str = "base",
        output_json_path: Optional[Union[str, Path]] = None,
    ) -> Dict[str, Any]:
        """
        Executes full sensitivity evaluation suite:
        - 1D parameter perturbations (+/-20%, +/-50%)
        - Multi-parameter stress tests
        - Robustness classification across strategies and budget policies
        - Exports structured results JSON.

        Args:
            df_backtest: Development backtest DataFrame.
            scenario_name: Baseline scenario name.
            output_json_path: Destination path for output JSON.

        Returns:
            Dictionary of full sensitivity results and robustness reports.
        """
        logger.info(f"Starting cost parameter sensitivity suite (Baseline Scenario: {scenario_name})...")

        # 1. Run 1D parameter sweeps
        one_at_a_time_records = self.run_one_at_a_time_sensitivity(
            df_backtest=df_backtest,
            scenario_name=scenario_name,
        )

        # 2. Run multi-parameter stress tests
        stress_records = self.run_stress_scenarios(
            df_backtest=df_backtest,
            scenario_name=scenario_name,
        )

        all_records = one_at_a_time_records + stress_records
        results_df = pd.DataFrame(all_records)

        # 3. Classify Robustness for Modeling Strategies
        strategy_robustness: Dict[str, Any] = {}
        strategy_robustness_vs_f1: Dict[str, Any] = {}

        for cand in ["E8-C_tuned_gamma", "E8-C_bayes_threshold", "E8-B_cost_weighted"]:
            if cand in results_df["strategy"].values:
                # Primary baseline: Standard CatBoost E8-A_tau0.5 (frozen unweighted model)
                report_std = self.classify_robustness(
                    results_df=results_df,
                    candidate_strategy=cand,
                    reference_baseline="E8-A_tau0.5",
                )
                strategy_robustness[cand] = report_std.model_dump()

                # Secondary baseline: E8-A_f1 (F1-tuned threshold)
                report_f1 = self.classify_robustness(
                    results_df=results_df,
                    candidate_strategy=cand,
                    reference_baseline="E8-A_f1",
                )
                strategy_robustness_vs_f1[cand] = report_f1.model_dump()


        # 4. Classify Robustness for Operational Budget Policies
        budget_robustness: Dict[str, Any] = {}
        for k_val in [0.05, 0.10, 0.20]:
            k_key = f"k_{int(k_val * 100):02d}pct"
            budget_robustness[k_key] = {}
            cand_pol = f"BUDGET_COST_SENSITIVE_k{int(k_val * 100):02d}"

            for ref_pol in [
                f"BUDGET_VALUE_ONLY_k{int(k_val * 100):02d}",
                f"BUDGET_RISK_ONLY_k{int(k_val * 100):02d}",
                f"BUDGET_STANDARD_k{int(k_val * 100):02d}",
            ]:
                if cand_pol in results_df["strategy"].values and ref_pol in results_df["strategy"].values:
                    report = self.classify_robustness(
                        results_df=results_df,
                        candidate_strategy=cand_pol,
                        reference_baseline=ref_pol,
                    )
                    budget_robustness[k_key][ref_pol] = report.model_dump()

        # 5. Build Aggregated Parameter Sensitivity Curves
        param_curves: Dict[str, Any] = {}
        for (param, mult), grp in results_df[results_df["perturbation_type"] == "one_at_a_time"].groupby(
            ["parameter_name", "multiplier"]
        ):
            if param not in param_curves:
                param_curves[param] = []

            strat_summary = {}
            for strat, s_grp in grp.groupby("strategy"):
                strat_summary[strat] = {
                    "mean_realized_cost": float(s_grp["realized_cost"].mean()),
                    "mean_net_savings": float(s_grp["net_savings"].mean()),
                    "mean_cost_reduction_pct": float(s_grp["cost_reduction_pct"].mean()),
                }

            param_curves[param].append({
                "multiplier": float(mult),
                "delta_pct": float((mult - 1.0) * 100.0),
                "strategies": strat_summary,
            })

        output_payload = {
            "metadata": {
                "generated_at_utc": pd.Timestamp.now(tz="UTC").isoformat(),
                "experiment": "Phase 2 — E8 Cost-Sensitive Learning",
                "milestone": "M3 Cost Sensitivity & Policy Robustness Analysis",
                "baseline_scenario": scenario_name,
                "parameters_perturbed": self.KEY_PARAMETERS,
                "multipliers": self.DEFAULT_MULTIPLIERS,
                "total_perturbation_points": len(all_records),
            },
            "strategy_robustness_reports": strategy_robustness,
            "strategy_robustness_vs_f1_reports": strategy_robustness_vs_f1,
            "budget_robustness_reports": budget_robustness,
            "parameter_sensitivity_curves": param_curves,
            "detailed_perturbation_records": all_records,
        }

        if output_json_path:
            p_out = Path(output_json_path)
            p_out.parent.mkdir(parents=True, exist_ok=True)
            with open(p_out, "w", encoding="utf-8") as f:
                json.dump(output_payload, f, indent=2)
            logger.info(f"Saved sensitivity analysis results to {p_out}")

        return output_payload


def run_e8_dev_sensitivity_analysis(
    backtest_parquet_path: Union[str, Path] = "artifacts/results/e8_dev_backtest_results.parquet",
    output_json_path: Union[str, Path] = "artifacts/results/e8_dev_sensitivity_results.json",
    config_path: Union[str, Path] = "configs/cost_scenarios.yaml",
    scenario_name: str = "base",
) -> Dict[str, Any]:
    """
    Executes cost sensitivity analysis across development backtest results and saves the JSON artifact.

    Args:
        backtest_parquet_path: Path to development backtest parquet file.
        output_json_path: Destination path for sensitivity results JSON.
        config_path: Path to cost scenarios config.
        scenario_name: Baseline scenario name ('base').

    Returns:
        Dictionary of sensitivity analysis results.
    """
    p_in = Path(backtest_parquet_path)
    if not p_in.exists():
        raise FileNotFoundError(f"Backtest parquet file not found at {p_in}")

    df_backtest = pd.read_parquet(p_in)
    logger.info(f"Loaded {len(df_backtest)} backtest records from {p_in}")

    analyzer = CostSensitivityAnalyzer(config_path=config_path, base_scenario_name=scenario_name)
    return analyzer.run_full_sensitivity_suite(
        df_backtest=df_backtest,
        scenario_name=scenario_name,
        output_json_path=output_json_path,
    )
