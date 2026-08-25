"""
Cost Scenario Engine for USAID SCMS Supply Chain Delay Intelligence (Phase 2 — Experiment E8).

Provides:
- CostScenario: Pydantic configuration schema for cost parameters.
- LeakageViolationError: Custom exception for forbidden feature usage.
- CostBreakdown: Data container holding vectorized instance-dependent cost metrics.
- CostScenarioModel / CostEngine: Primary engine for loading scenario configs, validating zero leakage,
  and computing instance-dependent FN_Cost, FP_Cost, Intervention_Cost, Residual_Delay_Cost,
  Net_Benefit, and Bayes-optimal decision thresholds (tau*).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Union

import numpy as np
import pandas as pd
import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator


# -----------------------------------------------------------------------------
# Canonical Forbidden Features (Post-Outcome, Post-Dispatch, and Target Leakage)
# -----------------------------------------------------------------------------
FORBIDDEN_COLUMNS: List[str] = [
    "Delivered to Client Date",
    "Delivery Recorded Date",
    "Delay_Flag",
    "Delay_Days",
    "Freight Cost (USD)",
    "Weight (Kilograms)",
    "ASN/DN #",
    "is_temporal_anomaly",
]


class LeakageViolationError(ValueError):
    """Raised when forbidden, post-outcome, or target-derived columns are passed to cost computation."""
    pass


class CostScenario(BaseModel):
    """
    Pydantic schema representing economic, clinical, and logistics assumptions for a cost scenario.
    """
    name: str = Field(..., description="Descriptive scenario name (e.g. Low, Base, High)")
    description: str = Field(default="", description="Detailed scenario rationale")
    c_daily_base: float = Field(..., gt=0, description="Base daily operational delay penalty (USD/day)")
    rho_value: float = Field(..., ge=0, description="Value-scaled daily holding/perishability rate (% of V_i/day)")
    c_fixed_stockout: float = Field(..., ge=0, description="Fixed emergency stockout response administrative cost (USD)")
    c_triage_base: float = Field(..., gt=0, description="Baseline analyst triage cost per false alarm (USD)")
    beta_audit: float = Field(..., ge=0, description="Value-logarithm audit overhead scaling factor (USD/log(USD))")
    c_direct_inquiry: float = Field(..., ge=0, description="Direct Drop external vendor inquiry friction (USD)")
    c_rdc_inquiry: float = Field(..., ge=0, description="RDC internal warehouse inventory check friction (USD)")
    c_expedite_base: float = Field(..., gt=0, description="Base carrier expediting fee (USD/intervention)")
    gamma_expedite: float = Field(..., ge=0, description="Value-proportional cargo insurance/handling surcharge (% of V_i)")
    delay_days_assumed: float = Field(..., gt=0, description="Benchmark unmitigated delay duration (days)")
    days_saved_efficacy: float = Field(..., gt=0, description="Expected delay reduction from proactive intervention (days)")
    delta_first_line: float = Field(default=0.30, ge=0, description="Criticality boost for WHO First-Line regimen")
    delta_pediatric: float = Field(default=0.20, ge=0, description="Criticality boost for Pediatric formulations")
    delta_arv: float = Field(default=0.15, ge=0, description="Criticality boost for ARV drug class")
    mode_multipliers: Dict[str, float] = Field(
        default_factory=lambda: {
            "Air": 1.00,
            "Air Charter": 0.90,
            "Truck": 1.10,
            "Ocean": 1.25,
            "Default": 1.00,
        },
        description="Logistics mode friction multipliers lambda_mode",
    )

    @field_validator("days_saved_efficacy")
    @classmethod
    def validate_efficacy(cls, v: float, info) -> float:
        delay_days = info.data.get("delay_days_assumed")
        if delay_days is not None and v > delay_days:
            raise ValueError(f"days_saved_efficacy ({v}) cannot exceed delay_days_assumed ({delay_days})")
        return v


class CostBreakdown(BaseModel):
    """
    Container holding computed instance-dependent cost metrics for a batch or single instance.
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)

    fn_cost: List[float] = Field(..., description="False Negative cost (unmitigated delay penalty)")
    fp_cost: List[float] = Field(..., description="False Positive cost (wasted alert & triage overhead)")
    intervention_cost: List[float] = Field(..., description="Proactive mitigation & expediting fee")
    residual_delay_cost: List[float] = Field(..., description="Residual clinical delay penalty post-intervention")
    net_benefit: List[float] = Field(..., description="Net economic benefit of intervention on delayed item")
    tau_star: List[float] = Field(..., description="Instance-dependent Bayes optimal decision threshold with intervention")
    tau_star_simple: List[float] = Field(..., description="Classical 2x2 Bayes risk threshold FP / (FN + FP)")
    asymmetry_ratio: List[float] = Field(..., description="Cost asymmetry ratio FN / FP")

    def to_dataframe(self, index: Optional[Any] = None) -> pd.DataFrame:
        """Converts the cost breakdown into a pandas DataFrame."""
        data = {
            "fn_cost": self.fn_cost,
            "fp_cost": self.fp_cost,
            "intervention_cost": self.intervention_cost,
            "residual_delay_cost": self.residual_delay_cost,
            "net_benefit": self.net_benefit,
            "tau_star": self.tau_star,
            "tau_star_simple": self.tau_star_simple,
            "asymmetry_ratio": self.asymmetry_ratio,
        }
        return pd.DataFrame(data, index=index)


class CostScenarioModel:
    """
    Engine for loading scenario configurations, enforcing zero-leakage constraints,
    and computing instance-dependent cost metrics across supply chain shipments.
    """

    def __init__(
        self,
        config_path: Union[str, Path] = "configs/cost_scenarios.yaml",
        scenario_name: str = "base",
        custom_scenario: Optional[CostScenario] = None,
    ):
        """
        Initializes the CostScenarioModel.

        Args:
            config_path: Path to the YAML scenario configuration file.
            scenario_name: Name of the active scenario ('low', 'base', 'high', or custom).
            custom_scenario: Optional explicit CostScenario instance overriding config_path.
        """
        self.config_path = Path(config_path)
        self.scenarios: Dict[str, CostScenario] = {}
        self.forbidden_columns: List[str] = list(FORBIDDEN_COLUMNS)

        if custom_scenario is not None:
            name_key = custom_scenario.name.lower()
            self.scenarios[name_key] = custom_scenario
            self.active_scenario_name = name_key
        else:
            self._load_config()
            self.set_scenario(scenario_name)

    def _load_config(self) -> None:
        """Loads and parses scenario definitions from the YAML configuration file."""
        if not self.config_path.exists():
            raise FileNotFoundError(f"Cost scenario configuration file not found at: {self.config_path}")

        with open(self.config_path, "r", encoding="utf-8") as f:
            raw_cfg = yaml.safe_load(f)

        if "forbidden_columns" in raw_cfg and isinstance(raw_cfg["forbidden_columns"], list):
            self.forbidden_columns = raw_cfg["forbidden_columns"]

        raw_scenarios = raw_cfg.get("scenarios", {})
        if not raw_scenarios:
            raise ValueError(f"No scenarios defined in config file: {self.config_path}")

        for key, sc_data in raw_scenarios.items():
            self.scenarios[key.lower()] = CostScenario(**sc_data)

    def list_scenarios(self) -> List[str]:
        """Returns the list of available scenario identifiers."""
        return list(self.scenarios.keys())

    def get_scenario(self, scenario_name: Optional[str] = None) -> CostScenario:
        """
        Retrieves the specified or active CostScenario.

        Args:
            scenario_name: Optional scenario key. Defaults to active scenario.

        Returns:
            CostScenario instance.
        """
        name = (scenario_name or self.active_scenario_name).lower()
        if name not in self.scenarios:
            raise KeyError(
                f"Scenario '{scenario_name}' not found. Available scenarios: {self.list_scenarios()}"
            )
        return self.scenarios[name]

    def set_scenario(self, scenario_name: str) -> None:
        """
        Sets the active scenario.

        Args:
            scenario_name: Name of scenario to activate ('low', 'base', 'high').
        """
        name = scenario_name.lower()
        if name not in self.scenarios:
            raise KeyError(
                f"Scenario '{scenario_name}' not found. Available scenarios: {self.list_scenarios()}"
            )
        self.active_scenario_name = name

    def validate_features(
        self,
        df: Union[pd.DataFrame, Dict[str, Any], pd.Series],
        strict_leakage_check: bool = True,
    ) -> None:
        """
        Verifies that no forbidden, post-outcome, or target-derived columns are present in the inputs.

        Args:
            df: DataFrame, Series, or Dictionary of feature records.
            strict_leakage_check: If True, raises LeakageViolationError when forbidden columns are detected.

        Raises:
            LeakageViolationError: If any forbidden column is found and strict_leakage_check is True.
        """
        if not strict_leakage_check:
            return

        cols: List[str] = []
        if isinstance(df, pd.DataFrame):
            cols = [str(c) for c in df.columns]
        elif isinstance(df, pd.Series):
            cols = [str(c) for c in df.index]
        elif isinstance(df, dict):
            cols = [str(k) for k in df.keys()]

        violating_cols = [c for c in cols if c in self.forbidden_columns]
        if violating_cols:
            raise LeakageViolationError(
                f"Forbidden / target-leakage column(s) detected in cost computation inputs: {violating_cols}. "
                f"Prediction-time cost calculations must strictly exclude post-outcome dates, actual delay targets, "
                f"and post-dispatch consignment actuals."
            )

    def extract_monetary_values(
        self,
        df: Union[pd.DataFrame, Dict[str, Any], pd.Series, np.ndarray, Sequence[float]],
        value_col: str = "Line Item Value",
        is_log_transformed: Optional[bool] = None,
    ) -> np.ndarray:
        """
        Extracts and converts line item monetary values into un-logged non-negative USD amounts (V_i).

        Args:
            df: Input data containing monetary values.
            value_col: Column name containing line item values.
            is_log_transformed: If True, applies exp(val) - 1. If False, treats values as raw USD.
                                If None, auto-detects based on value magnitude (max <= 25.0).

        Returns:
            1D numpy array of un-logged non-negative USD values.
        """
        if isinstance(df, pd.DataFrame):
            if value_col in df.columns:
                raw_vals = df[value_col].to_numpy(dtype=float, copy=True)
            else:
                # Fallback if value_col is missing: default to 0
                raw_vals = np.zeros(len(df), dtype=float)
        elif isinstance(df, pd.Series):
            if value_col in df.index:
                raw_vals = np.array([float(df[value_col])], dtype=float)
            else:
                raw_vals = df.to_numpy(dtype=float, copy=True)
        elif isinstance(df, dict):
            val = df.get(value_col, 0.0)
            raw_vals = np.array([float(val)], dtype=float)
        elif isinstance(df, (np.ndarray, list, tuple)):
            raw_vals = np.asarray(df, dtype=float)
        else:
            raw_vals = np.array([float(df)], dtype=float)

        raw_vals = np.nan_to_num(raw_vals, nan=0.0)
        raw_vals = np.maximum(0.0, raw_vals)

        # Auto-detect log-transformation if not specified
        if is_log_transformed is None:
            # If all non-zero values are <= 25.0 and mean <= 15.0, assume log1p transformed
            # (log1p of $10,000,000 is ~16.12)
            if len(raw_vals) > 0 and np.max(raw_vals) <= 25.0 and np.mean(raw_vals) <= 15.0 and np.max(raw_vals) > 0:
                is_log = True
            else:
                is_log = False
        else:
            is_log = is_log_transformed

        if is_log:
            unlogged = np.expm1(raw_vals)
            unlogged = np.maximum(0.0, unlogged)
            return unlogged
        else:
            return raw_vals

    def compute_criticality_multiplier(
        self,
        df: Union[pd.DataFrame, Dict[str, Any], pd.Series],
        scenario: Optional[CostScenario] = None,
    ) -> np.ndarray:
        """
        Computes the clinical criticality multiplier kappa_i for each instance:
        kappa_i = 1.0 + delta_first_line * I(first_line) + delta_pediatric * I(pediatric) + delta_arv * I(arv)

        Args:
            df: Input feature dataset.
            scenario: CostScenario instance (defaults to active).

        Returns:
            1D numpy array of criticality multipliers kappa >= 1.0.
        """
        sc = scenario or self.get_scenario()
        n = len(df) if isinstance(df, pd.DataFrame) else 1
        kappa = np.ones(n, dtype=float)

        if isinstance(df, pd.DataFrame):
            # First Line Designation
            if "First Line Designation" in df.columns:
                is_fl = df["First Line Designation"].astype(str).str.strip().str.lower().isin(["yes", "1", "true", "y"])
                kappa += sc.delta_first_line * is_fl.to_numpy(dtype=float)
            elif "First Line Designation_Yes" in df.columns:
                kappa += sc.delta_first_line * (df["First Line Designation_Yes"].to_numpy(dtype=float) > 0.5)

            # Pediatric
            if "Sub Classification" in df.columns:
                is_ped = df["Sub Classification"].astype(str).str.strip().str.lower().str.contains("pediatric", na=False)
                kappa += sc.delta_pediatric * is_ped.to_numpy(dtype=float)
            elif "Sub Classification_Pediatric" in df.columns:
                kappa += sc.delta_pediatric * (df["Sub Classification_Pediatric"].to_numpy(dtype=float) > 0.5)

            # ARV
            if "Product Group" in df.columns:
                is_arv = df["Product Group"].astype(str).str.strip().str.upper() == "ARV"
                kappa += sc.delta_arv * is_arv.to_numpy(dtype=float)
            elif "Product Group_ARV" in df.columns:
                kappa += sc.delta_arv * (df["Product Group_ARV"].to_numpy(dtype=float) > 0.5)

        elif isinstance(df, (pd.Series, dict)):
            fl_val = str(df.get("First Line Designation", df.get("First Line Designation_Yes", ""))).strip().lower()
            if fl_val in ["yes", "1", "true", "y", "1.0"]:
                kappa[0] += sc.delta_first_line

            sub_val = str(df.get("Sub Classification", df.get("Sub Classification_Pediatric", ""))).strip().lower()
            if "pediatric" in sub_val or sub_val in ["1", "true", "1.0"]:
                kappa[0] += sc.delta_pediatric

            pg_val = str(df.get("Product Group", df.get("Product Group_ARV", ""))).strip().upper()
            if pg_val == "ARV" or pg_val in ["1", "TRUE", "1.0"]:
                kappa[0] += sc.delta_arv

        return kappa

    def compute_mode_multiplier(
        self,
        df: Union[pd.DataFrame, Dict[str, Any], pd.Series],
        scenario: Optional[CostScenario] = None,
    ) -> np.ndarray:
        """
        Computes the logistics transport friction multiplier lambda_mode(i).

        Args:
            df: Input feature dataset.
            scenario: CostScenario instance (defaults to active).

        Returns:
            1D numpy array of mode multipliers lambda_mode > 0.
        """
        sc = scenario or self.get_scenario()
        n = len(df) if isinstance(df, pd.DataFrame) else 1
        mults = sc.mode_multipliers
        default_mult = mults.get("Default", 1.0)
        mode_arr = np.full(n, default_mult, dtype=float)

        if isinstance(df, pd.DataFrame):
            if "Shipment Mode" in df.columns:
                modes = df["Shipment Mode"].astype(str).str.strip()
                for mode_name, multiplier in mults.items():
                    if mode_name != "Default":
                        mask = (modes.str.lower() == mode_name.lower()).to_numpy()
                        mode_arr[mask] = multiplier
            else:
                # Check one-hot indicators if string column is absent
                for mode_name, multiplier in mults.items():
                    if mode_name != "Default":
                        col_cand = f"Shipment Mode_{mode_name}"
                        if col_cand in df.columns:
                            mask = (df[col_cand].to_numpy(dtype=float) > 0.5)
                            mode_arr[mask] = multiplier

        elif isinstance(df, (pd.Series, dict)):
            mode_val = str(df.get("Shipment Mode", "")).strip()
            if mode_val:
                for mode_name, multiplier in mults.items():
                    if mode_val.lower() == mode_name.lower():
                        mode_arr[0] = multiplier
                        break
            else:
                for mode_name, multiplier in mults.items():
                    if mode_name != "Default":
                        col_cand = f"Shipment Mode_{mode_name}"
                        if str(df.get(col_cand, "")).strip() in ["1", "1.0", "True", "true"]:
                            mode_arr[0] = multiplier
                            break

        return mode_arr

    def compute_sourcing_inquiry_cost(
        self,
        df: Union[pd.DataFrame, Dict[str, Any], pd.Series],
        scenario: Optional[CostScenario] = None,
    ) -> np.ndarray:
        """
        Computes the sourcing inquiry audit friction cost:
        - RDC warehouse inquiry: c_rdc_inquiry
        - Direct Drop vendor inquiry: c_direct_inquiry

        Args:
            df: Input feature dataset.
            scenario: CostScenario instance (defaults to active).

        Returns:
            1D numpy array of sourcing inquiry costs.
        """
        sc = scenario or self.get_scenario()
        n = len(df) if isinstance(df, pd.DataFrame) else 1
        inquiry_arr = np.full(n, sc.c_direct_inquiry, dtype=float)

        if isinstance(df, pd.DataFrame):
            if "Fulfill Via" in df.columns:
                is_rdc = df["Fulfill Via"].astype(str).str.strip().str.lower().isin(["from rdc", "rdc"])
                inquiry_arr[is_rdc.to_numpy()] = sc.c_rdc_inquiry
            elif "is_rdc_fulfillment" in df.columns:
                is_rdc = (df["is_rdc_fulfillment"].to_numpy(dtype=float) > 0.5)
                inquiry_arr[is_rdc] = sc.c_rdc_inquiry
            elif "Fulfill Via_From RDC" in df.columns:
                is_rdc = (df["Fulfill Via_From RDC"].to_numpy(dtype=float) > 0.5)
                inquiry_arr[is_rdc] = sc.c_rdc_inquiry
        elif isinstance(df, (pd.Series, dict)):
            fulfill_val = str(df.get("Fulfill Via", "")).strip().lower()
            is_rdc_val = str(df.get("is_rdc_fulfillment", df.get("Fulfill Via_From RDC", ""))).strip().lower()
            if fulfill_val in ["from rdc", "rdc"] or is_rdc_val in ["1", "1.0", "true"]:
                inquiry_arr[0] = sc.c_rdc_inquiry

        return inquiry_arr

    def compute_costs(
        self,
        df: Union[pd.DataFrame, Dict[str, Any], pd.Series],
        scenario_name: Optional[str] = None,
        strict_leakage_check: bool = True,
        value_col: str = "Line Item Value",
        is_log_transformed: Optional[bool] = None,
        return_dataframe: bool = True,
    ) -> Union[pd.DataFrame, CostBreakdown, Dict[str, float]]:
        """
        Computes all instance-dependent cost components and Bayes-optimal decision thresholds
        using strictly prediction-time observable attributes.

        Formulas:
        1. FN_Cost(i) = kappa_i * lambda_mode(i) * [C_fixed_stockout + (c_daily_base + rho_value * V_i) * delay_days]
        2. FP_Cost(i) = C_triage_base + beta_audit * ln(1 + V_i) + C_sourcing_inquiry(i)
        3. Intervention_Cost(i) = C_expedite_base + gamma_expedite * V_i
        4. Residual_Delay_Cost(i) = kappa_i * lambda_mode(i) * (c_daily_base + rho_value * V_i) * max(0, delay_days - days_saved)
        5. Net_Benefit(i) = FN_Cost(i) - [Intervention_Cost(i) + Residual_Delay_Cost(i)]
        6. tau*(i) = FP_Cost(i) / (Net_Benefit(i) + FP_Cost(i))
        7. tau*_simple(i) = FP_Cost(i) / (FN_Cost(i) + FP_Cost(i))

        Args:
            df: Input DataFrame, Series, or dictionary of shipment records.
            scenario_name: Optional scenario key ('low', 'base', 'high').
            strict_leakage_check: Whether to strictly raise LeakageViolationError on forbidden columns.
            value_col: Column name containing monetary values.
            is_log_transformed: Explicit flag indicating whether value_col is log(1 + USD).
            return_dataframe: If True and input is DataFrame, returns pd.DataFrame; else CostBreakdown/Dict.

        Returns:
            pd.DataFrame (if return_dataframe and input is DataFrame) or CostBreakdown or Dict.
        """
        # Step 1: Strict Leakage Audit Guard
        self.validate_features(df, strict_leakage_check=strict_leakage_check)

        # Step 2: Retrieve Scenario Parameters
        scenario = self.get_scenario(scenario_name)

        # Step 3: Extract Un-logged Value V_i
        val = self.extract_monetary_values(df, value_col=value_col, is_log_transformed=is_log_transformed)

        # Step 4: Compute Domain Multipliers
        kappa = self.compute_criticality_multiplier(df, scenario=scenario)
        lambda_mode = self.compute_mode_multiplier(df, scenario=scenario)
        c_inquiry = self.compute_sourcing_inquiry_cost(df, scenario=scenario)

        # Step 5: Compute Instance Costs Vectorized
        # Daily delay cost component: (c_daily_base + rho_value * V_i)
        daily_holding_penalty = scenario.c_daily_base + scenario.rho_value * val

        # False Negative Cost
        fn_cost = kappa * lambda_mode * (scenario.c_fixed_stockout + daily_holding_penalty * scenario.delay_days_assumed)

        # False Positive Cost
        # beta_audit * ln(1 + V_i)
        audit_overhead = scenario.beta_audit * np.log1p(val)
        fp_cost = scenario.c_triage_base + audit_overhead + c_inquiry

        # Intervention Cost
        intervention_cost = scenario.c_expedite_base + scenario.gamma_expedite * val

        # Residual Delay Cost
        residual_days = max(0.0, scenario.delay_days_assumed - scenario.days_saved_efficacy)
        residual_delay_cost = kappa * lambda_mode * daily_holding_penalty * residual_days

        # Net Benefit of Intervention on Delayed Consignment
        net_benefit = fn_cost - (intervention_cost + residual_delay_cost)

        # Bayes Optimal Thresholds
        # tau*(i) = FP_Cost / (Net_Benefit + FP_Cost)
        # Numerically stable: denominator clamped > 1e-9
        denom_intervention = np.maximum(1e-9, net_benefit + fp_cost)
        tau_star = np.clip(fp_cost / denom_intervention, 0.0, 1.0)

        # Classical Bayes Risk Threshold: FP / (FN + FP)
        denom_simple = np.maximum(1e-9, fn_cost + fp_cost)
        tau_star_simple = np.clip(fp_cost / denom_simple, 0.0, 1.0)

        # Cost Asymmetry Ratio: FN / FP
        asymmetry_ratio = fn_cost / np.maximum(1e-9, fp_cost)

        # Format output
        idx = df.index if isinstance(df, pd.DataFrame) else None

        breakdown = CostBreakdown(
            fn_cost=fn_cost.tolist(),
            fp_cost=fp_cost.tolist(),
            intervention_cost=intervention_cost.tolist(),
            residual_delay_cost=residual_delay_cost.tolist(),
            net_benefit=net_benefit.tolist(),
            tau_star=tau_star.tolist(),
            tau_star_simple=tau_star_simple.tolist(),
            asymmetry_ratio=asymmetry_ratio.tolist(),
        )

        if isinstance(df, (dict, pd.Series)) and not isinstance(df, pd.DataFrame):
            if return_dataframe:
                return breakdown.to_dataframe(index=idx)
            return {
                "fn_cost": float(fn_cost[0]),
                "fp_cost": float(fp_cost[0]),
                "intervention_cost": float(intervention_cost[0]),
                "residual_delay_cost": float(residual_delay_cost[0]),
                "net_benefit": float(net_benefit[0]),
                "tau_star": float(tau_star[0]),
                "tau_star_simple": float(tau_star_simple[0]),
                "asymmetry_ratio": float(asymmetry_ratio[0]),
            }

        if return_dataframe:
            return breakdown.to_dataframe(index=idx)
        return breakdown

    def compute_sample_weights(
        self,
        df: pd.DataFrame,
        y_true: Union[np.ndarray, pd.Series, Sequence[int]],
        scenario_name: Optional[str] = None,
        normalize: bool = True,
        value_col: str = "Line Item Value",
        is_log_transformed: Optional[bool] = None,
    ) -> np.ndarray:
        """
        Computes instance-dependent sample weights for cost-sensitive training (E8-B):
        w_i = FN_Cost(i) if y_i == 1 else FP_Cost(i)

        Args:
            df: Input feature dataset (without target columns).
            y_true: Binary ground-truth labels (0 = on-time/early, 1 = delayed).
            scenario_name: Optional scenario key.
            normalize: If True, scales weights so mean(w) = 1.0.
            value_col: Column name for line item value.
            is_log_transformed: Explicit un-log flag.

        Returns:
            1D numpy array of sample weights.
        """
        costs_df = self.compute_costs(
            df,
            scenario_name=scenario_name,
            strict_leakage_check=True,
            value_col=value_col,
            is_log_transformed=is_log_transformed,
            return_dataframe=True,
        )

        y = np.asarray(y_true, dtype=int)
        if len(y) != len(df):
            raise ValueError(f"Length mismatch between df ({len(df)}) and y_true ({len(y)})")

        fn_vals = costs_df["fn_cost"].to_numpy(dtype=float)
        fp_vals = costs_df["fp_cost"].to_numpy(dtype=float)

        weights = np.where(y == 1, fn_vals, fp_vals)
        if normalize and np.mean(weights) > 0:
            weights = weights / np.mean(weights)

        return weights

    @staticmethod
    def compute_expected_cost(
        y_true: Union[np.ndarray, pd.Series, Sequence[int]],
        y_pred_action: Union[np.ndarray, pd.Series, Sequence[int]],
        costs: Union[pd.DataFrame, CostBreakdown, Dict[str, Any]],
    ) -> float:
        """
        Computes total realized business cost for a decision policy:
        - True Negative (d=0, y=0): Cost = 0
        - False Negative (d=0, y=1): Cost = FN_Cost(i)
        - False Positive (d=1, y=0): Cost = FP_Cost(i)
        - True Positive (d=1, y=1): Cost = Intervention_Cost(i) + Residual_Delay_Cost(i)

        Args:
            y_true: Ground truth binary labels (0 or 1).
            y_pred_action: Binary action decisions (1 = intervene, 0 = no action).
            costs: DataFrame or breakdown containing cost columns.

        Returns:
            Total business cost in USD.
        """
        y = np.asarray(y_true, dtype=int)
        d = np.asarray(y_pred_action, dtype=int)

        if isinstance(costs, pd.DataFrame):
            fn_cost = costs["fn_cost"].to_numpy(dtype=float)
            fp_cost = costs["fp_cost"].to_numpy(dtype=float)
            interv_cost = costs["intervention_cost"].to_numpy(dtype=float)
            resid_cost = costs["residual_delay_cost"].to_numpy(dtype=float)
        elif isinstance(costs, CostBreakdown):
            fn_cost = np.asarray(costs.fn_cost, dtype=float)
            fp_cost = np.asarray(costs.fp_cost, dtype=float)
            interv_cost = np.asarray(costs.intervention_cost, dtype=float)
            resid_cost = np.asarray(costs.residual_delay_cost, dtype=float)
        elif isinstance(costs, dict):
            fn_cost = np.asarray(costs["fn_cost"], dtype=float)
            fp_cost = np.asarray(costs["fp_cost"], dtype=float)
            interv_cost = np.asarray(costs["intervention_cost"], dtype=float)
            resid_cost = np.asarray(costs["residual_delay_cost"], dtype=float)
        else:
            raise TypeError(f"Unsupported costs type: {type(costs)}")

        instance_costs = np.where(
            d == 1,
            np.where(y == 1, interv_cost + resid_cost, fp_cost),
            np.where(y == 1, fn_cost, 0.0),
        )
        return float(np.sum(instance_costs))

    @staticmethod
    def compute_expected_net_savings(
        y_true: Union[np.ndarray, pd.Series, Sequence[int]],
        y_pred_action: Union[np.ndarray, pd.Series, Sequence[int]],
        costs: Union[pd.DataFrame, CostBreakdown, Dict[str, Any]],
    ) -> float:
        """
        Computes net economic savings achieved by decision policy d vs the "Do Nothing" (d=0) baseline.
        Savings = Cost(Do Nothing) - Cost(d).

        Args:
            y_true: Ground truth binary labels.
            y_pred_action: Binary action decisions.
            costs: DataFrame or breakdown containing cost columns.

        Returns:
            Net economic savings in USD (positive indicates cost reduction).
        """
        y = np.asarray(y_true, dtype=int)
        d_none = np.zeros_like(y)
        cost_none = CostScenarioModel.compute_expected_cost(y, d_none, costs)
        cost_policy = CostScenarioModel.compute_expected_cost(y, y_pred_action, costs)
        return float(cost_none - cost_policy)

    def compute_expected_net_benefit_ranking(
        self,
        df: pd.DataFrame,
        p_hat: Union[np.ndarray, pd.Series, Sequence[float]],
        scenario_name: Optional[str] = None,
        strict_leakage_check: bool = True,
        value_col: str = "Line Item Value",
        is_log_transformed: Optional[bool] = None,
    ) -> np.ndarray:
        """
        Computes expected net benefit / loss reduction for ranking under operational budgets:
        E[Delta Cost_i] = p_i * Net_Benefit(i) - (1 - p_i) * FP_Cost(i)

        Args:
            df: Input feature dataset.
            p_hat: Predicted delay probability vector p_i in [0, 1].
            scenario_name: Optional scenario key.
            strict_leakage_check: Leakage enforcement flag.
            value_col: Value column name.
            is_log_transformed: Un-log flag.

        Returns:
            1D numpy array of expected net benefit per instance.
        """
        costs_df = self.compute_costs(
            df,
            scenario_name=scenario_name,
            strict_leakage_check=strict_leakage_check,
            value_col=value_col,
            is_log_transformed=is_log_transformed,
            return_dataframe=True,
        )
        p = np.asarray(p_hat, dtype=float)
        net_ben = costs_df["net_benefit"].to_numpy(dtype=float)
        fp = costs_df["fp_cost"].to_numpy(dtype=float)

        expected_gain = p * net_ben - (1.0 - p) * fp
        return expected_gain


# Export alias for interchangeable naming convention
CostEngine = CostScenarioModel
