"""
Operational Review Budget Simulator for Supply Chain Delay Intelligence (Phase 2 — Experiment E8).

Implements operational review budget allocation and evaluation under realistic control-tower
capacity constraints K in {0.05, 0.10, 0.20} (5%, 10%, 20%).

Evaluates 4 prioritization policies:
1. VALUE_ONLY: Sort descending by shipment commodity value V_i.
2. RISK_ONLY: Sort descending by predicted probability of delay p_hat_i.
3. STANDARD: Standard classification thresholding / scoring under capacity constraints.
4. COST_SENSITIVE: Sort descending by Expected Net Benefit / Expected Loss Reduction:
   E[Delta Cost_i] = p_hat_i * Net_Benefit(i) - (1 - p_hat_i) * FP_Cost(i).

Computes:
- Budget utilization, review count, and coverage (%)
- Delay capture rate (Recall on late shipments) and positive count
- Realized business cost ($), expected business cost ($), do-nothing cost ($)
- Net savings ($) vs Do-Nothing, Value-Only, Risk-Only, and Standard policies
- Delay-days captured, commodity value captured ($), and cost per reviewed shipment ($)
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

from delay_intelligence.cost_sensitive.cost_engine import (
    CostBreakdown,
    CostEngine,
    CostScenario,
    CostScenarioModel,
    FORBIDDEN_COLUMNS,
    LeakageViolationError,
)

logger = logging.getLogger(__name__)


class OperationalPolicyType(str, Enum):
    """Enumeration of operational review budget prioritization policies."""
    VALUE_ONLY = "VALUE_ONLY"
    RISK_ONLY = "RISK_ONLY"
    STANDARD = "STANDARD"
    COST_SENSITIVE = "COST_SENSITIVE"


class BudgetMetrics(BaseModel):
    """Container holding computed operational metrics under a specific review budget."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    budget_k: float = Field(..., description="Review capacity fraction (e.g. 0.05, 0.10, 0.20)")
    policy: str = Field(..., description="Operational policy name")
    cohort_size: int = Field(..., description="Total shipment cohort size N")
    budget_capacity_count: int = Field(..., description="Max shipments permitted to review floor(K * N)")
    reviewed_count: int = Field(..., description="Actual number of shipments reviewed")
    budget_utilization_pct: float = Field(..., description="Utilization of allowed capacity (reviewed / capacity * 100)")
    review_coverage_pct: float = Field(..., description="Cohort review coverage (reviewed / N * 100)")
    positives_in_cohort: int = Field(..., description="Total delayed shipments in cohort")
    positives_captured: int = Field(..., description="Delayed shipments successfully reviewed (TP)")
    false_alarms: int = Field(..., description="On-time shipments reviewed (FP)")
    delay_capture_rate: float = Field(..., description="Delay capture rate / Recall under budget (TP / Positives)")
    precision_under_budget: float = Field(..., description="Precision under review budget (TP / Reviewed)")
    realized_business_cost: float = Field(..., description="Total realized business cost in USD")
    expected_business_cost: float = Field(..., description="Total expected business cost in USD")
    do_nothing_cost: float = Field(..., description="Baseline business cost with zero reviews in USD")
    net_savings_vs_do_nothing: float = Field(..., description="Dollar savings vs Do-Nothing in USD")
    cost_reduction_pct: float = Field(..., description="Cost reduction vs Do-Nothing (%)")
    net_savings_vs_value_only: Optional[float] = Field(default=None, description="Dollar savings vs Value-Only policy")
    net_savings_vs_risk_only: Optional[float] = Field(default=None, description="Dollar savings vs Risk-Only policy")
    net_savings_vs_standard: Optional[float] = Field(default=None, description="Dollar savings vs Standard policy")
    delay_days_captured: float = Field(..., description="Total delay days prevented / mitigated")
    commodity_value_reviewed_usd: float = Field(..., description="Total commodity value of all reviewed shipments")
    commodity_value_delayed_captured_usd: float = Field(..., description="Commodity value of reviewed delayed shipments")
    total_delayed_commodity_value_usd: float = Field(..., description="Total commodity value of all delayed shipments")
    commodity_value_capture_rate: float = Field(..., description="Fraction of delayed commodity value reviewed")
    cost_per_reviewed_shipment: float = Field(..., description="Average cost incurred per reviewed shipment")

    def to_dict(self) -> Dict[str, Any]:
        """Converts model to a clean dictionary."""
        return self.model_dump()


class OperationalBudgetSimulator:
    """
    Simulates and evaluates supply chain control-tower review budget constraints
    across operational prioritization policies.
    """

    DEFAULT_BUDGETS: List[float] = [0.05, 0.10, 0.20]

    def __init__(
        self,
        cost_engine: Optional[CostScenarioModel] = None,
        scenario_name: str = "base",
        custom_scenario: Optional[CostScenario] = None,
        config_path: Union[str, Path] = "configs/cost_scenarios.yaml",
    ):
        """
        Initializes the budget simulator.

        Args:
            cost_engine: Optional initialized CostScenarioModel.
            scenario_name: Name of active cost scenario ('low', 'base', 'high').
            custom_scenario: Optional explicit CostScenario instance.
            config_path: Path to cost scenarios config if initializing engine internally.
        """
        if custom_scenario is not None:
            self.cost_engine = cost_engine or CostScenarioModel(custom_scenario=custom_scenario)
            self.scenario_name = custom_scenario.name.lower()
        elif cost_engine is not None:
            self.scenario_name = scenario_name.lower()
            self.cost_engine = cost_engine
            self.cost_engine.set_scenario(self.scenario_name)
        else:
            self.scenario_name = scenario_name.lower()
            self.cost_engine = CostScenarioModel(config_path=config_path, scenario_name=self.scenario_name)


    @staticmethod
    def compute_priority_scores(
        policy: Union[str, OperationalPolicyType],
        probs: np.ndarray,
        costs_df: pd.DataFrame,
        values: np.ndarray,
        threshold_std: float = 0.50,
    ) -> np.ndarray:
        """
        Computes instance prioritization scores according to the specified policy.
        Higher score = higher priority for manual review / operational intervention.

        Args:
            policy: Prioritization policy rule.
            probs: 1D array of predicted delay probabilities p_hat_i in [0, 1].
            costs_df: DataFrame containing instance cost components.
            values: 1D array of shipment commodity values V_i in USD.
            threshold_std: Governing threshold for STANDARD policy.

        Returns:
            1D numpy array of priority scores.
        """
        p = np.asarray(probs, dtype=float)
        v = np.asarray(values, dtype=float)
        pol_str = str(policy.value if isinstance(policy, OperationalPolicyType) else policy).upper()

        if pol_str in ["VALUE_ONLY", "VALUE"]:
            return v

        if pol_str in ["RISK_ONLY", "RISK", "PROBABILITY"]:
            return p

        if pol_str in ["STANDARD", "STANDARD_THRESHOLD"]:
            # Priority proportional to distance above threshold; sub-threshold items get negative score
            return p - threshold_std

        if pol_str in ["COST_SENSITIVE", "COST_BENEFIT", "EXPECTED_NET_BENEFIT"]:
            net_benefit = costs_df["net_benefit"].to_numpy(dtype=float)
            fp_cost = costs_df["fp_cost"].to_numpy(dtype=float)
            # E[Delta Cost_i] = p_i * Net_Benefit(i) - (1 - p_i) * FP_Cost(i)
            expected_net_benefit = p * net_benefit - (1.0 - p) * fp_cost
            return expected_net_benefit

        raise ValueError(f"Unsupported operational policy: '{policy}'. Supported: {[p.value for p in OperationalPolicyType]}")

    @classmethod
    def compute_policy_decisions(
        cls,
        policy: Union[str, OperationalPolicyType],
        probs: np.ndarray,
        costs_df: pd.DataFrame,
        values: np.ndarray,
        budget_k: float,
        threshold_std: float = 0.50,
        strictly_positive_benefit: bool = True,
    ) -> Tuple[np.ndarray, int]:
        """
        Determines binary review decisions d_i in {0, 1} under capacity constraint K.

        Args:
            policy: Prioritization policy rule.
            probs: 1D array of predicted probabilities.
            costs_df: DataFrame of instance costs.
            values: 1D array of commodity values.
            budget_k: Review capacity fraction K in (0, 1].
            threshold_std: Governed threshold for STANDARD policy.
            strictly_positive_benefit: For COST_SENSITIVE, if True, only review items
                                       with expected net benefit > 0 (up to capacity).

        Returns:
            Tuple of (binary decision array of shape (N,), allowed_capacity_count M).
        """
        n = len(probs)
        if n == 0:
            return np.array([], dtype=int), 0

        # Capacity count M = floor(K * N), clamped >= 1 if K > 0 and N > 0
        max_capacity = max(1, int(np.floor(budget_k * n)))
        max_capacity = min(n, max_capacity)

        scores = cls.compute_priority_scores(
            policy=policy,
            probs=probs,
            costs_df=costs_df,
            values=values,
            threshold_std=threshold_std,
        )

        decisions = np.zeros(n, dtype=int)
        pol_str = str(policy.value if isinstance(policy, OperationalPolicyType) else policy).upper()

        if pol_str in ["VALUE_ONLY", "RISK_ONLY"]:
            # Review top M highest scores
            # argsort sorts ascending; take last max_capacity
            top_indices = np.argsort(scores)[-max_capacity:]
            decisions[top_indices] = 1

        elif pol_str == "STANDARD":
            # Filter to items above standard threshold (p >= threshold_std)
            flagged_indices = np.where(probs >= threshold_std)[0]
            if len(flagged_indices) <= max_capacity:
                decisions[flagged_indices] = 1
            else:
                # Exceeds budget capacity -> select top M items with highest probability among flagged
                sorted_within_flagged = flagged_indices[np.argsort(probs[flagged_indices])[-max_capacity:]]
                decisions[sorted_within_flagged] = 1

        elif pol_str == "COST_SENSITIVE":
            if strictly_positive_benefit:
                # Candidate items must have expected net benefit > 0
                positive_mask = scores > 0.0
                positive_indices = np.where(positive_mask)[0]
                if len(positive_indices) <= max_capacity:
                    decisions[positive_indices] = 1
                else:
                    # Select top M items with highest expected net benefit
                    top_within_positive = positive_indices[np.argsort(scores[positive_indices])[-max_capacity:]]
                    decisions[top_within_positive] = 1
            else:
                top_indices = np.argsort(scores)[-max_capacity:]
                decisions[top_indices] = 1

        return decisions, max_capacity

    def evaluate_cohort_under_budget(
        self,
        y_true: Union[np.ndarray, Sequence[int]],
        probs: Union[np.ndarray, Sequence[float]],
        costs_df: pd.DataFrame,
        values: Union[np.ndarray, Sequence[float]],
        delay_days: Optional[Union[np.ndarray, Sequence[float]]] = None,
        budget_k: float = 0.10,
        policy: Union[str, OperationalPolicyType] = OperationalPolicyType.COST_SENSITIVE,
        threshold_std: float = 0.50,
        days_saved_efficacy: Optional[float] = None,
    ) -> BudgetMetrics:
        """
        Evaluates a single prioritization policy on a cohort under review budget K.

        Args:
            y_true: Binary ground-truth delay labels (0 or 1).
            probs: Predicted delay probabilities.
            costs_df: DataFrame containing instance cost components.
            values: Shipment commodity values in USD.
            delay_days: Actual delay duration in days (optional).
            budget_k: Budget review fraction K.
            policy: Prioritization policy.
            threshold_std: Governed standard threshold.
            days_saved_efficacy: Delay days saved from intervention (defaults to scenario assumption).

        Returns:
            BudgetMetrics instance with detailed economic and operational metrics.
        """
        y = np.asarray(y_true, dtype=int)
        p = np.asarray(probs, dtype=float)
        v = np.asarray(values, dtype=float)
        n = len(y)

        if n == 0:
            raise ValueError("Cannot evaluate empty cohort")

        scenario = self.cost_engine.get_scenario(self.scenario_name)
        efficacy = days_saved_efficacy if days_saved_efficacy is not None else scenario.days_saved_efficacy

        pol_name = str(policy.value if isinstance(policy, OperationalPolicyType) else policy).upper()

        # Compute decisions
        decisions, max_capacity = self.compute_policy_decisions(
            policy=pol_name,
            probs=p,
            costs_df=costs_df,
            values=v,
            budget_k=budget_k,
            threshold_std=threshold_std,
            strictly_positive_benefit=True,
        )

        reviewed_count = int(np.sum(decisions))
        budget_utilization = float((reviewed_count / max_capacity * 100.0) if max_capacity > 0 else 0.0)
        review_coverage = float((reviewed_count / n * 100.0) if n > 0 else 0.0)

        # Operational Positives & Confusion
        positives_in_cohort = int(np.sum(y))
        tp = int(np.sum((decisions == 1) & (y == 1)))
        fp = int(np.sum((decisions == 1) & (y == 0)))
        delay_capture_rate = float((tp / positives_in_cohort) if positives_in_cohort > 0 else 0.0)
        precision_under_budget = float((tp / reviewed_count) if reviewed_count > 0 else 0.0)

        # Realized and Do-Nothing Costs
        realized_cost = float(CostScenarioModel.compute_expected_cost(y, decisions, costs_df))
        do_nothing_cost = float(CostScenarioModel.compute_expected_cost(y, np.zeros_like(y), costs_df))
        net_savings_vs_do_nothing = float(do_nothing_cost - realized_cost)
        cost_reduction_pct = float((net_savings_vs_do_nothing / do_nothing_cost * 100.0) if do_nothing_cost > 0 else 0.0)

        # Expected Business Cost
        # E[Cost_i | d_i=1] = p_i * (Intervention_Cost_i + Residual_Delay_Cost_i) + (1 - p_i) * FP_Cost_i
        # E[Cost_i | d_i=0] = p_i * FN_Cost_i
        fn_costs = costs_df["fn_cost"].to_numpy(dtype=float)
        fp_costs = costs_df["fp_cost"].to_numpy(dtype=float)
        interv_costs = costs_df["intervention_cost"].to_numpy(dtype=float)
        resid_costs = costs_df["residual_delay_cost"].to_numpy(dtype=float)

        expected_action_costs = p * (interv_costs + resid_costs) + (1.0 - p) * fp_costs
        expected_no_action_costs = p * fn_costs
        expected_cost_vector = np.where(decisions == 1, expected_action_costs, expected_no_action_costs)
        expected_business_cost = float(np.sum(expected_cost_vector))

        # Delay Days Captured
        if delay_days is not None:
            dd = np.asarray(delay_days, dtype=float)
            delay_days_captured = float(np.sum(np.where((decisions == 1) & (y == 1), np.minimum(dd, efficacy), 0.0)))
        else:
            delay_days_captured = float(tp * efficacy)

        # Commodity Value Captured
        commodity_value_reviewed = float(np.sum(v[decisions == 1]))
        commodity_value_delayed_captured = float(np.sum(v[(decisions == 1) & (y == 1)]))
        total_delayed_commodity_value = float(np.sum(v[y == 1]))
        val_capture_rate = float(
            (commodity_value_delayed_captured / total_delayed_commodity_value)
            if total_delayed_commodity_value > 0 else 0.0
        )

        # Spend per Reviewed Shipment
        if reviewed_count > 0:
            review_spend_vector = np.where(y == 1, interv_costs + resid_costs, fp_costs)
            total_review_spend = float(np.sum(review_spend_vector[decisions == 1]))
            cost_per_reviewed = float(total_review_spend / reviewed_count)
        else:
            cost_per_reviewed = 0.0

        return BudgetMetrics(
            budget_k=budget_k,
            policy=pol_name,
            cohort_size=n,
            budget_capacity_count=max_capacity,
            reviewed_count=reviewed_count,
            budget_utilization_pct=budget_utilization,
            review_coverage_pct=review_coverage,
            positives_in_cohort=positives_in_cohort,
            positives_captured=tp,
            false_alarms=fp,
            delay_capture_rate=delay_capture_rate,
            precision_under_budget=precision_under_budget,
            realized_business_cost=realized_cost,
            expected_business_cost=expected_business_cost,
            do_nothing_cost=do_nothing_cost,
            net_savings_vs_do_nothing=net_savings_vs_do_nothing,
            cost_reduction_pct=cost_reduction_pct,
            net_savings_vs_value_only=None,
            net_savings_vs_risk_only=None,
            net_savings_vs_standard=None,
            delay_days_captured=delay_days_captured,
            commodity_value_reviewed_usd=commodity_value_reviewed,
            commodity_value_delayed_captured_usd=commodity_value_delayed_captured,
            total_delayed_commodity_value_usd=total_delayed_commodity_value,
            commodity_value_capture_rate=val_capture_rate,
            cost_per_reviewed_shipment=cost_per_reviewed,
        )

    def simulate_all_policies_for_budget(
        self,
        y_true: Union[np.ndarray, Sequence[int]],
        probs: Union[np.ndarray, Sequence[float]],
        costs_df: pd.DataFrame,
        values: Union[np.ndarray, Sequence[float]],
        delay_days: Optional[Union[np.ndarray, Sequence[float]]] = None,
        budget_k: float = 0.10,
        threshold_std: float = 0.50,
        days_saved_efficacy: Optional[float] = None,
    ) -> Dict[str, BudgetMetrics]:
        """
        Simulates all 4 operational policies for a given budget K and calculates pairwise savings.

        Args:
            y_true: Ground truth binary delay labels.
            probs: Predicted delay probabilities.
            costs_df: DataFrame containing instance costs.
            values: Shipment monetary values.
            delay_days: Actual delay days.
            budget_k: Review capacity fraction K.
            threshold_std: Standard threshold.
            days_saved_efficacy: Efficacy in days.

        Returns:
            Dictionary mapping policy name to BudgetMetrics.
        """
        results: Dict[str, BudgetMetrics] = {}

        policies = [
            OperationalPolicyType.VALUE_ONLY,
            OperationalPolicyType.RISK_ONLY,
            OperationalPolicyType.STANDARD,
            OperationalPolicyType.COST_SENSITIVE,
        ]

        for pol in policies:
            metrics = self.evaluate_cohort_under_budget(
                y_true=y_true,
                probs=probs,
                costs_df=costs_df,
                values=values,
                delay_days=delay_days,
                budget_k=budget_k,
                policy=pol,
                threshold_std=threshold_std,
                days_saved_efficacy=days_saved_efficacy,
            )
            results[pol.value] = metrics

        # Compute relative savings vs baselines
        cost_val = results[OperationalPolicyType.VALUE_ONLY.value].realized_business_cost
        cost_risk = results[OperationalPolicyType.RISK_ONLY.value].realized_business_cost
        cost_std = results[OperationalPolicyType.STANDARD.value].realized_business_cost

        for pol_key, m in results.items():
            m.net_savings_vs_value_only = float(cost_val - m.realized_business_cost)
            m.net_savings_vs_risk_only = float(cost_risk - m.realized_business_cost)
            m.net_savings_vs_standard = float(cost_std - m.realized_business_cost)

        return results

    def simulate_from_backtest_dataframe(
        self,
        df_backtest: pd.DataFrame,
        budget_levels: Sequence[float] = (0.05, 0.10, 0.20),
        scenarios: Optional[Sequence[str]] = None,
        strategies: Optional[Sequence[str]] = None,
    ) -> Dict[str, Any]:
        """
        Runs comprehensive operational review budget simulations across all folds, scenarios,
        and modeling strategies available in the development backtest results.

        Args:
            df_backtest: DataFrame loaded from e8_dev_backtest_results.parquet.
            budget_levels: List of budget review fractions K.
            scenarios: List of scenarios to evaluate (defaults to all found).
            strategies: List of strategies to evaluate (defaults to all found).

        Returns:
            Structured dictionary of per-fold and aggregated budget simulation metrics.
        """
        all_scenarios = list(df_backtest["scenario"].unique()) if scenarios is None else list(scenarios)
        all_strategies = list(df_backtest["strategy"].unique()) if strategies is None else list(strategies)
        all_folds = sorted(df_backtest["fold_id"].unique())

        detailed_records: List[Dict[str, Any]] = []

        for sc_name in all_scenarios:
            self.set_scenario(sc_name)
            for strat_name in all_strategies:
                for fold_id in all_folds:
                    sub = df_backtest[
                        (df_backtest["scenario"] == sc_name)
                        & (df_backtest["strategy"] == strat_name)
                        & (df_backtest["fold_id"] == fold_id)
                    ]
                    if len(sub) == 0:
                        continue

                    # Extract inputs
                    y_true = sub["y_true"].to_numpy(dtype=int)
                    probs = sub["prob_pred"].to_numpy(dtype=float)
                    values = sub["line_item_value_usd"].to_numpy(dtype=float)
                    delay_days = sub["delay_days"].to_numpy(dtype=float) if "delay_days" in sub.columns else None
                    thresh_std = float(sub["threshold"].iloc[0]) if "threshold" in sub.columns else 0.50

                    costs_df = pd.DataFrame({
                        "fn_cost": sub["fn_cost"].to_numpy(dtype=float),
                        "fp_cost": sub["fp_cost"].to_numpy(dtype=float),
                        "intervention_cost": sub["intervention_cost"].to_numpy(dtype=float),
                        "residual_delay_cost": sub["residual_delay_cost"].to_numpy(dtype=float),
                        "net_benefit": sub["net_benefit"].to_numpy(dtype=float),
                    })

                    for k in budget_levels:
                        policy_results = self.simulate_all_policies_for_budget(
                            y_true=y_true,
                            probs=probs,
                            costs_df=costs_df,
                            values=values,
                            delay_days=delay_days,
                            budget_k=k,
                            threshold_std=thresh_std,
                        )

                        for pol_name, bm in policy_results.items():
                            rec = bm.to_dict()
                            rec["scenario"] = sc_name
                            rec["strategy"] = strat_name
                            rec["fold_id"] = int(fold_id)
                            detailed_records.append(rec)

        df_detailed = pd.DataFrame(detailed_records)

        # Aggregate across folds
        aggregated_summary: Dict[str, Any] = {}
        for (sc_name, strat_name, k_val, pol_name), grp in df_detailed.groupby(
            ["scenario", "strategy", "budget_k", "policy"]
        ):
            k_key = f"k_{int(k_val * 100):02d}pct"
            if sc_name not in aggregated_summary:
                aggregated_summary[sc_name] = {}
            if strat_name not in aggregated_summary[sc_name]:
                aggregated_summary[sc_name][strat_name] = {}
            if k_key not in aggregated_summary[sc_name][strat_name]:
                aggregated_summary[sc_name][strat_name][k_key] = {}

            total_realized = float(grp["realized_business_cost"].sum())
            total_do_nothing = float(grp["do_nothing_cost"].sum())
            total_net_savings = float(grp["net_savings_vs_do_nothing"].sum())
            total_reviewed = int(grp["reviewed_count"].sum())
            total_cohort = int(grp["cohort_size"].sum())
            total_positives = int(grp["positives_in_cohort"].sum())
            total_captured = int(grp["positives_captured"].sum())
            total_delay_days = float(grp["delay_days_captured"].sum())
            total_val_delayed_captured = float(grp["commodity_value_delayed_captured_usd"].sum())
            total_val_delayed = float(grp["total_delayed_commodity_value_usd"].sum())

            pooled_cost_red_pct = float(
                (total_net_savings / total_do_nothing * 100.0) if total_do_nothing > 0 else 0.0
            )
            pooled_delay_capture_rate = float(
                (total_captured / total_positives) if total_positives > 0 else 0.0
            )
            pooled_val_capture_rate = float(
                (total_val_delayed_captured / total_val_delayed) if total_val_delayed > 0 else 0.0
            )

            aggregated_summary[sc_name][strat_name][k_key][pol_name] = {
                "budget_k": float(k_val),
                "policy": pol_name,
                "folds_evaluated": len(grp),
                "total_cohort_size": total_cohort,
                "total_reviewed_shipments": total_reviewed,
                "mean_budget_utilization_pct": float(grp["budget_utilization_pct"].mean()),
                "mean_review_coverage_pct": float(grp["review_coverage_pct"].mean()),
                "total_positives_in_cohort": total_positives,
                "total_positives_captured": total_captured,
                "pooled_delay_capture_rate": pooled_delay_capture_rate,
                "mean_delay_capture_rate": float(grp["delay_capture_rate"].mean()),
                "mean_precision_under_budget": float(grp["precision_under_budget"].mean()),
                "mean_realized_cost": float(grp["realized_business_cost"].mean()),
                "std_realized_cost": float(grp["realized_business_cost"].std(ddof=1) if len(grp) > 1 else 0.0),
                "total_realized_cost": total_realized,
                "total_do_nothing_cost": total_do_nothing,
                "total_net_savings": total_net_savings,
                "mean_net_savings": float(grp["net_savings_vs_do_nothing"].mean()),
                "pooled_cost_reduction_pct": pooled_cost_red_pct,
                "macro_mean_cost_reduction_pct": float(grp["cost_reduction_pct"].mean()),
                "total_net_savings_vs_value_only": float(grp["net_savings_vs_value_only"].sum()),
                "mean_net_savings_vs_value_only": float(grp["net_savings_vs_value_only"].mean()),
                "total_net_savings_vs_risk_only": float(grp["net_savings_vs_risk_only"].sum()),
                "mean_net_savings_vs_risk_only": float(grp["net_savings_vs_risk_only"].mean()),
                "total_net_savings_vs_standard": float(grp["net_savings_vs_standard"].sum()),
                "mean_net_savings_vs_standard": float(grp["net_savings_vs_standard"].mean()),
                "total_delay_days_captured": total_delay_days,
                "total_commodity_value_delayed_captured_usd": total_val_delayed_captured,
                "pooled_commodity_value_capture_rate": pooled_val_capture_rate,
                "mean_cost_per_reviewed_shipment": float(grp["cost_per_reviewed_shipment"].mean()),
            }

        return {
            "detailed_records": detailed_records,
            "aggregated_summary": aggregated_summary,
        }

    def set_scenario(self, scenario_name: str) -> None:
        """Switches the active cost scenario."""
        self.scenario_name = scenario_name.lower()
        self.cost_engine.set_scenario(self.scenario_name)


def run_e8_dev_budget_simulation(
    backtest_parquet_path: Union[str, Path] = "artifacts/results/e8_dev_backtest_results.parquet",
    output_json_path: Union[str, Path] = "artifacts/results/e8_dev_budget_results.json",
    config_path: Union[str, Path] = "configs/cost_scenarios.yaml",
) -> Dict[str, Any]:
    """
    Executes operational budget simulations for review capacities K in {0.05, 0.10, 0.20}
    across development backtest results and saves the output JSON artifact.

    Args:
        backtest_parquet_path: Path to development backtest parquet file.
        output_json_path: Destination path for budget simulation results JSON.
        config_path: Path to cost scenario YAML.

    Returns:
        Dictionary of budget simulation results.
    """
    p_in = Path(backtest_parquet_path)
    if not p_in.exists():
        raise FileNotFoundError(f"Backtest parquet file not found at {p_in}")

    df_backtest = pd.read_parquet(p_in)
    logger.info(f"Loaded {len(df_backtest)} backtest predictions from {p_in}")

    simulator = OperationalBudgetSimulator(config_path=config_path)
    sim_results = simulator.simulate_from_backtest_dataframe(
        df_backtest=df_backtest,
        budget_levels=[0.05, 0.10, 0.20],
    )

    # Add metadata
    output_payload = {
        "metadata": {
            "generated_at_utc": pd.Timestamp.now(tz="UTC").isoformat(),
            "experiment": "Phase 2 — E8 Cost-Sensitive Learning",
            "milestone": "M3 Operational Budgeting Simulation",
            "source_backtest_parquet": str(p_in),
            "budget_capacities": [0.05, 0.10, 0.20],
            "evaluated_policies": [p.value for p in OperationalPolicyType],
            "total_records_evaluated": len(df_backtest),
        },
        "aggregated_summary": sim_results["aggregated_summary"],
        "detailed_fold_records": sim_results["detailed_records"],
    }

    p_out = Path(output_json_path)
    p_out.parent.mkdir(parents=True, exist_ok=True)
    with open(p_out, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, indent=2)

    logger.info(f"Saved operational budget simulation results to {p_out}")
    return output_payload
