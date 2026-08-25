"""Prediction Contract Validator and Schema Enforcement Engine.

This module implements the machine-enforced verification layer for the Stage 2
Prediction Contract in the Supply Chain Delay Intelligence System.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple, Union
import numpy as np
import pandas as pd

from delay_intelligence.core.config import find_config_dir, load_config
from delay_intelligence.core.exceptions import DataValidationError, LeakageViolationError
from delay_intelligence.core.logging import get_logger
from delay_intelligence.data.schema import (
    COL_COUNTRY,
    COL_DELAY_DAYS,
    COL_DELAY_FLAG,
    COL_DELIVERED_TO_CLIENT_DATE,
    COL_DELIVERY_RECORDED_DATE,
    COL_FULFILL_VIA,
    COL_ID,
    COL_IS_TEMPORAL_ANOMALY,
    COL_PO_SENT_DATE,
    COL_PQ_FIRST_SENT_DATE,
    COL_PRODUCT_GROUP,
    COL_SCHEDULED_DELIVERY_DATE,
    SCMS_ALLOWED_DOMAINS,
)

logger = get_logger("validation.contract")

# Required top-level keys in prediction_contract.yaml
REQUIRED_CONTRACT_SECTIONS: Set[str] = {
    "contract_version",
    "dataset",
    "prediction_unit",
    "prediction_timestamp",
    "milestone_timestamps",
    "forecast_horizon",
    "targets",
    "eligibility_rules",
    "allowed_features",
    "forbidden_features",
    "temporal_constraints",
    "anomaly_policy",
}


@dataclass
class ContractValidationReport:
    """Detailed result container for prediction contract validation checks."""

    is_valid: bool
    total_checks: int
    passed_checks: List[str] = field(default_factory=list)
    failed_checks: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert report to structured dictionary."""
        return {
            "is_valid": self.is_valid,
            "total_checks": self.total_checks,
            "passed_count": len(self.passed_checks),
            "failed_count": len(self.failed_checks),
            "warning_count": len(self.warnings),
            "passed_checks": self.passed_checks,
            "failed_checks": self.failed_checks,
            "warnings": self.warnings,
            "metrics": self.metrics,
        }

    def summary(self) -> str:
        """Generate human-readable summary of validation status."""
        status = "PASSED" if self.is_valid else "FAILED"
        return (
            f"ContractValidationReport [{status}] - Total: {self.total_checks}, "
            f"Passed: {len(self.passed_checks)}, Failed: {len(self.failed_checks)}, "
            f"Warnings: {len(self.warnings)}"
        )


class PredictionContractValidator:
    """Validator enforcing the formal Prediction Contract (Requirement R3/R5)."""

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        """Initialize PredictionContractValidator with contract configuration.

        Args:
            config: Optional dictionary containing parsed prediction_contract.yaml.
                    If None, loads automatically from configs/prediction_contract.yaml.
        """
        if config is None:
            try:
                self.contract = load_config("prediction_contract")
            except Exception as exc:
                logger.warning(f"Could not load prediction_contract config: {exc}")
                self.contract = {}
        else:
            self.contract = config

        self._flattened_forbidden: Optional[Set[str]] = None
        self._flattened_allowed: Optional[Set[str]] = None

    def validate_contract_structure(self) -> Tuple[bool, List[str]]:
        """Verify that the contract dictionary contains all required sections.

        Returns:
            Tuple of (is_valid, list_of_missing_sections).
        """
        missing = [sec for sec in REQUIRED_CONTRACT_SECTIONS if sec not in self.contract]
        return len(missing) == 0, missing

    def get_allowed_features(self) -> Set[str]:
        """Return the complete set of allowed features specified in the contract."""
        if self._flattened_allowed is not None:
            return self._flattened_allowed

        allowed_dict = self.contract.get("allowed_features", {})
        flattened: Set[str] = set()
        for _, feat_list in allowed_dict.items():
            if isinstance(feat_list, list):
                for item in feat_list:
                    if isinstance(item, str):
                        flattened.add(item)
                    elif isinstance(item, dict) and "name" in item:
                        flattened.add(item["name"])

        self._flattened_allowed = flattened
        return self._flattened_allowed

    def get_forbidden_features(self) -> Set[str]:
        """Return the complete set of forbidden features specified in the contract."""
        if self._flattened_forbidden is not None:
            return self._flattened_forbidden

        forbidden_dict = self.contract.get("forbidden_features", {})
        flattened: Set[str] = set()
        for _, feat_list in forbidden_dict.items():
            if isinstance(feat_list, list):
                for item in feat_list:
                    if isinstance(item, str):
                        flattened.add(item)
                    elif isinstance(item, dict) and "name" in item:
                        flattened.add(item["name"])

        self._flattened_forbidden = flattened
        return self._flattened_forbidden

    def check_feature_leakage(self, candidate_features: List[str]) -> Tuple[List[str], List[str]]:
        """Audit a candidate list of features against the contract allow/block lists.

        Args:
            candidate_features: List of column names proposed for model input.

        Returns:
            Tuple of (allowed_features, forbidden_features_found).
        """
        forbidden_set = self.get_forbidden_features()
        forbidden_found = [col for col in candidate_features if col in forbidden_set]
        allowed_found = [col for col in candidate_features if col not in forbidden_set]
        return allowed_found, forbidden_found

    @staticmethod
    def _parse_datetime(series: Optional[pd.Series]) -> pd.Series:
        """Helper to safely parse datetime series avoiding redundant parsing if already datetime."""
        if series is None:
            return pd.Series(dtype="datetime64[ns]")
        if pd.api.types.is_datetime64_any_dtype(series):
            return series
        return pd.to_datetime(series, errors="coerce", format="mixed")

    def compute_prediction_timestamp(
        self, df: pd.DataFrame, use_fallback: bool = True
    ) -> pd.Series:
        """Compute the Dual-Channel Operational Milestone Anchor ($T_{\\text{pred}}$).

        Mathematical formulation:
        T_pred(i) =
          - PO Sent to Vendor Date, if Fulfill Via == 'Direct Drop' and PO Sent Date is valid
          - PQ First Sent to Client Date, if Fulfill Via == 'From RDC' and PQ Sent Date is valid
          - PQ First Sent to Client Date, if Fulfill Via == 'Direct Drop' and PO Sent Date is null but PQ is valid (if use_fallback=True)
          - NaT, otherwise

        Args:
            df: SCMS DataFrame with date and fulfillment columns.
            use_fallback: Whether to use PQ date fallback for Direct Drop when PO date is missing.

        Returns:
            pd.Series of datetime64[ns] containing computed prediction anchors.
        """
        if df.empty:
            return pd.Series(dtype="datetime64[ns]", index=df.index)

        # Ensure datetime parsing
        po_sent = (
            self._parse_datetime(df[COL_PO_SENT_DATE])
            if COL_PO_SENT_DATE in df.columns
            else pd.Series(pd.NaT, index=df.index, dtype="datetime64[ns]")
        )
        pq_sent = (
            self._parse_datetime(df[COL_PQ_FIRST_SENT_DATE])
            if COL_PQ_FIRST_SENT_DATE in df.columns
            else pd.Series(pd.NaT, index=df.index, dtype="datetime64[ns]")
        )
        fulfill_via = (
            df[COL_FULFILL_VIA]
            if COL_FULFILL_VIA in df.columns
            else pd.Series("", index=df.index)
        )

        t_pred = pd.Series(pd.NaT, index=df.index, dtype="datetime64[ns]")

        # 1. Direct Drop with valid PO Sent Date
        mask_dd_po = (fulfill_via == "Direct Drop") & po_sent.notna()
        t_pred.loc[mask_dd_po] = po_sent.loc[mask_dd_po]

        # 2. From RDC with valid PQ Sent Date
        mask_rdc_pq = (fulfill_via == "From RDC") & pq_sent.notna()
        t_pred.loc[mask_rdc_pq] = pq_sent.loc[mask_rdc_pq]

        # 3. Direct Drop fallback (missing PO Sent Date, valid PQ Sent Date)
        if use_fallback:
            mask_dd_fallback = (fulfill_via == "Direct Drop") & po_sent.isna() & pq_sent.notna()
            t_pred.loc[mask_dd_fallback] = pq_sent.loc[mask_dd_fallback]

        return t_pred

    def compute_targets(self, df: pd.DataFrame) -> Tuple[pd.Series, pd.Series]:
        """Compute the binary classification target and continuous regression target.

        Formulas:
        - Delay_Days = (Delivered to Client Date - Scheduled Delivery Date).dt.days
        - is_delayed = (Delay_Days > 0).astype(int)

        Args:
            df: DataFrame containing Scheduled and Delivered date columns.

        Returns:
            Tuple of (is_delayed: pd.Series[int], delay_days: pd.Series[int]).
        """
        if df.empty:
            return (
                pd.Series(dtype="int64", index=df.index),
                pd.Series(dtype="int64", index=df.index),
            )

        sched = (
            self._parse_datetime(df[COL_SCHEDULED_DELIVERY_DATE])
            if COL_SCHEDULED_DELIVERY_DATE in df.columns
            else pd.Series(pd.NaT, index=df.index, dtype="datetime64[ns]")
        )
        deliv = (
            self._parse_datetime(df[COL_DELIVERED_TO_CLIENT_DATE])
            if COL_DELIVERED_TO_CLIENT_DATE in df.columns
            else pd.Series(pd.NaT, index=df.index, dtype="datetime64[ns]")
        )

        delay_days = (deliv - sched).dt.days
        is_delayed = (delay_days > 0).astype("Int64")

        # Where either date was NaT, targets are NA
        mask_na = sched.isna() | deliv.isna()
        delay_days = delay_days.mask(mask_na)
        is_delayed = is_delayed.mask(mask_na)

        return is_delayed, delay_days

    def compute_forecast_horizon(
        self, df: pd.DataFrame, t_pred: Optional[pd.Series] = None
    ) -> pd.Series:
        """Compute planned forecast horizon (Scheduled Delivery Date - T_pred) in days.

        Args:
            df: DataFrame with Scheduled Delivery Date.
            t_pred: Optional precomputed prediction anchor series.

        Returns:
            pd.Series of integer forecast horizon days.
        """
        if df.empty:
            return pd.Series(dtype="float64", index=df.index)

        if t_pred is None:
            t_pred = self.compute_prediction_timestamp(df)

        sched = pd.to_datetime(df[COL_SCHEDULED_DELIVERY_DATE], errors="coerce")
        horizon = (sched - t_pred).dt.days
        return horizon

    def evaluate_base_eligibility(self, df: pd.DataFrame) -> pd.Series:
        """Evaluate base population eligibility rules (100% preservation check).

        Criteria C1 to C5:
        - C1: ID is not null and ID > 0
        - C2: Scheduled Delivery Date is valid date in [2006, 2016]
        - C3: Delivered to Client Date is valid date in [2006, 2016]
        - C4: Fulfill Via in {'From RDC', 'Direct Drop'}
        - C5: Product Group in {'ARV', 'HRDT', 'ANTM', 'ACT', 'MRDT'}

        Args:
            df: Standardized SCMS DataFrame.

        Returns:
            Boolean Series where True indicates base population eligibility.
        """
        if df.empty:
            return pd.Series(dtype=bool, index=df.index)

        c1 = df[COL_ID].notna() & (df[COL_ID] > 0) if COL_ID in df.columns else pd.Series(False, index=df.index)
        
        sched = pd.to_datetime(df[COL_SCHEDULED_DELIVERY_DATE], errors="coerce") if COL_SCHEDULED_DELIVERY_DATE in df.columns else pd.Series(pd.NaT, index=df.index)
        c2 = sched.notna() & (sched >= pd.Timestamp("2006-01-01")) & (sched <= pd.Timestamp("2016-01-01"))

        deliv = pd.to_datetime(df[COL_DELIVERED_TO_CLIENT_DATE], errors="coerce") if COL_DELIVERED_TO_CLIENT_DATE in df.columns else pd.Series(pd.NaT, index=df.index)
        c3 = deliv.notna() & (deliv >= pd.Timestamp("2006-01-01")) & (deliv <= pd.Timestamp("2016-01-01"))

        valid_fulfill = SCMS_ALLOWED_DOMAINS.get(COL_FULFILL_VIA, {"From RDC", "Direct Drop"})
        c4 = df[COL_FULFILL_VIA].isin(valid_fulfill) if COL_FULFILL_VIA in df.columns else pd.Series(False, index=df.index)

        valid_product = SCMS_ALLOWED_DOMAINS.get(COL_PRODUCT_GROUP, {"ARV", "HRDT", "ANTM", "ACT", "MRDT"})
        c5 = df[COL_PRODUCT_GROUP].isin(valid_product) if COL_PRODUCT_GROUP in df.columns else pd.Series(False, index=df.index)

        return c1 & c2 & c3 & c4 & c5

    def evaluate_prediction_cohort_eligibility(
        self, df: pd.DataFrame, t_pred: Optional[pd.Series] = None
    ) -> pd.Series:
        """Evaluate prediction cohort eligibility rules for lead-time inference models.

        Criteria:
        - Base eligibility satisfies C1..C5
        - Prediction anchor T_pred is present (not NaT)
        - T_pred <= Delivered to Client Date (Temporal Precedence)
        - is_temporal_anomaly == 0 (Historical ERP Integrity)

        Args:
            df: DataFrame to evaluate.
            t_pred: Optional precomputed prediction anchor series.

        Returns:
            Boolean Series where True indicates prediction cohort eligibility.
        """
        if df.empty:
            return pd.Series(dtype=bool, index=df.index)

        base_eligible = self.evaluate_base_eligibility(df)

        if t_pred is None:
            t_pred = self.compute_prediction_timestamp(df)

        deliv = pd.to_datetime(df[COL_DELIVERED_TO_CLIENT_DATE], errors="coerce") if COL_DELIVERED_TO_CLIENT_DATE in df.columns else pd.Series(pd.NaT, index=df.index)

        anchor_present = t_pred.notna()
        temporal_precedence = (t_pred <= deliv).fillna(False)

        if COL_IS_TEMPORAL_ANOMALY in df.columns:
            anomaly_clean = (df[COL_IS_TEMPORAL_ANOMALY] == 0).fillna(True)
        else:
            anomaly_clean = pd.Series(True, index=df.index)

        return base_eligible & anchor_present & temporal_precedence & anomaly_clean

    def validate_dataframe(self, df: pd.DataFrame) -> ContractValidationReport:
        """Run full prediction contract validation assertions against a DataFrame.

        Args:
            df: Standardized or raw SCMS DataFrame.

        Returns:
            ContractValidationReport containing full audit results.
        """
        passed: List[str] = []
        failed: List[str] = []
        warnings: List[str] = []
        metrics: Dict[str, Any] = {
            "total_rows": len(df),
            "total_columns": len(df.columns),
        }

        if df.empty:
            failed.append("DataFrame is empty (0 rows)")
            return ContractValidationReport(
                is_valid=False,
                total_checks=1,
                passed_checks=[],
                failed_checks=failed,
                warnings=warnings,
                metrics=metrics,
            )

        # ---------------------------------------------------------------------
        # 1. Contract Structure Check
        # ---------------------------------------------------------------------
        struct_valid, missing_sections = self.validate_contract_structure()
        if struct_valid:
            passed.append("Contract YAML contains all 12 required sections")
        else:
            failed.append(f"Contract YAML missing sections: {missing_sections}")

        # ---------------------------------------------------------------------
        # 2. Base Population Eligibility & RDC Retention Check
        # ---------------------------------------------------------------------
        base_eligible = self.evaluate_base_eligibility(df)
        base_count = int(base_eligible.sum())
        metrics["base_eligible_count"] = base_count
        metrics["base_eligible_pct"] = base_count / len(df) if len(df) > 0 else 0.0

        if base_count == len(df):
            passed.append(f"Base population eligibility is 100% ({base_count}/{len(df)} records)")
        else:
            warnings.append(f"Base population eligibility is {base_count}/{len(df)} ({metrics['base_eligible_pct']:.2%})")

        # RDC retention check
        if COL_FULFILL_VIA in df.columns:
            rdc_mask = df[COL_FULFILL_VIA] == "From RDC"
            rdc_total = int(rdc_mask.sum())
            rdc_eligible = int((rdc_mask & base_eligible).sum())
            metrics["rdc_total"] = rdc_total
            metrics["rdc_eligible"] = rdc_eligible

            if rdc_total > 0 and rdc_eligible == rdc_total:
                passed.append(f"All {rdc_total} From RDC records are 100% eligible in base population")
            elif rdc_total > 0:
                failed.append(f"RDC eligibility loss: {rdc_eligible}/{rdc_total} eligible")

        # ---------------------------------------------------------------------
        # 3. Dual-Channel Prediction Anchor Generation & Ordering Check
        # ---------------------------------------------------------------------
        t_pred = self.compute_prediction_timestamp(df)
        anchored_count = int(t_pred.notna().sum())
        metrics["anchored_count"] = anchored_count
        metrics["anchored_pct"] = anchored_count / len(df) if len(df) > 0 else 0.0

        if anchored_count > 0:
            passed.append(f"Dual-channel prediction anchor computed ({anchored_count}/{len(df)} records anchored, {metrics['anchored_pct']:.2%})")
        else:
            failed.append("Prediction anchor generation failed (0 records anchored)")

        # Check outcome ordering for anchored records
        deliv = pd.to_datetime(df[COL_DELIVERED_TO_CLIENT_DATE], errors="coerce") if COL_DELIVERED_TO_CLIENT_DATE in df.columns else pd.Series(pd.NaT, index=df.index)
        anchored_mask = t_pred.notna() & deliv.notna()

        if anchored_mask.any():
            pre_deliv_count = int((t_pred[anchored_mask] < deliv[anchored_mask]).sum())
            same_day_count = int((t_pred[anchored_mask] == deliv[anchored_mask]).sum())
            post_deliv_count = int((t_pred[anchored_mask] > deliv[anchored_mask]).sum())
            metrics["pre_deliv_count"] = pre_deliv_count
            metrics["same_day_count"] = same_day_count
            metrics["post_deliv_anomalies"] = post_deliv_count

            if post_deliv_count == 0:
                passed.append("100% of anchored records satisfy T_pred <= Delivered to Client Date")
            else:
                warnings.append(
                    f"Found {post_deliv_count} historical inverted records where T_pred > Delivered (governed by anomaly policy)"
                )

        # ---------------------------------------------------------------------
        # 4. Target Generation & Consistency Check
        # ---------------------------------------------------------------------
        is_delayed, delay_days = self.compute_targets(df)
        if is_delayed.notna().any():
            unique_classes = set(is_delayed.dropna().unique())
            if unique_classes.issubset({0, 1}):
                passed.append("Classification target is_delayed is strictly binary in {0, 1}")
                metrics["delayed_count"] = int((is_delayed == 1).sum())
                metrics["delay_rate"] = float((is_delayed == 1).mean())
            else:
                failed.append(f"Classification target contains non-binary values: {unique_classes}")

            # Verify target linkage: is_delayed == (delay_days > 0)
            valid_targets_mask = is_delayed.notna() & delay_days.notna()
            target_link_consistent = (
                is_delayed[valid_targets_mask] == (delay_days[valid_targets_mask] > 0).astype(int)
            ).all()

            if target_link_consistent:
                passed.append("Target linkage invariant holds: is_delayed == (Delay_Days > 0)")
            else:
                failed.append("Target linkage invariant violated: mismatch between is_delayed and Delay_Days")

            # Check early delivery mapping: Delay_Days <= 0 must map to class 0
            early_on_time_mask = delay_days <= 0
            if (is_delayed[early_on_time_mask] == 0).all():
                passed.append("Early and on-time deliveries (Delay_Days <= 0) correctly map to Class 0")
            else:
                failed.append("Early or on-time deliveries incorrectly mapped to Class 1")

        # ---------------------------------------------------------------------
        # 5. Forbidden Feature Rejection Check
        # ---------------------------------------------------------------------
        forbidden_set = self.get_forbidden_features()
        metrics["forbidden_rules_count"] = len(forbidden_set)
        if len(forbidden_set) >= 6:
            passed.append(f"Forbidden feature blocklist defined with {len(forbidden_set)} rules")
        else:
            warnings.append(f"Forbidden feature blocklist has fewer rules than expected ({len(forbidden_set)})")

        is_valid = len(failed) == 0
        total_checks = len(passed) + len(failed)

        return ContractValidationReport(
            is_valid=is_valid,
            total_checks=total_checks,
            passed_checks=passed,
            failed_checks=failed,
            warnings=warnings,
            metrics=metrics,
        )
