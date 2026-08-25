"""Automated SCMS Schema and Data Quality Validator."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import pandas as pd

from delay_intelligence.core.config import load_config
from delay_intelligence.core.logging import get_logger
from delay_intelligence.data.schema import (
    COL_DELAY_DAYS,
    COL_DELAY_FLAG,
    COL_DELIVERED_TO_CLIENT_DATE,
    COL_DELIVERY_RECORDED_DATE,
    COL_DOSAGE,
    COL_FREIGHT_COST_USD,
    COL_ID,
    COL_LINE_ITEM_INSURANCE_USD,
    COL_LINE_ITEM_QUANTITY,
    COL_LINE_ITEM_VALUE,
    COL_PACK_PRICE,
    COL_PO_SENT_DATE,
    COL_SCHEDULED_DELIVERY_DATE,
    COL_SHIPMENT_MODE,
    COL_UNIT_OF_MEASURE,
    COL_UNIT_PRICE,
    COL_WEIGHT_KG,
    SCMS_ALLOWED_DOMAINS,
    SCMS_CRITICAL_COLUMNS,
    SCMS_EXPECTED_COL_COUNT,
    SCMS_EXPECTED_ROW_COUNT,
    SCMS_RAW_COLUMNS,
)

logger = get_logger("validation.scms")


@dataclass
class ValidationReport:
    """Detailed result container for SCMS data quality and schema validation checks."""

    is_valid: bool
    total_checks: int
    passed_checks: List[str] = field(default_factory=list)
    failed_checks: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert validation report to a structured dictionary."""
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
        """Generate human-readable summary string of validation status."""
        status = "PASSED" if self.is_valid else "FAILED"
        return (
            f"ValidationReport [{status}] - Total: {self.total_checks}, "
            f"Passed: {len(self.passed_checks)}, Failed: {len(self.failed_checks)}, "
            f"Warnings: {len(self.warnings)}"
        )


class SCMSValidator:
    """Automated validator implementing quality gates for SCMS DataFrames (Requirement R3)."""

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        """Initialize SCMSValidator with configuration thresholds.

        Args:
            config: Optional configuration dictionary. If None, loads from validation.yaml.
        """
        if config is None:
            try:
                val_cfg = load_config("validation")
                self.config = val_cfg.get("scms_validation", {})
                self.thresholds = val_cfg.get("thresholds", {})
            except Exception:
                self.config = {}
                self.thresholds = {}
        else:
            self.config = config
            self.thresholds = {}

        self.expected_row_count = self.config.get(
            "expected_row_count", SCMS_EXPECTED_ROW_COUNT
        )
        self.expected_column_count = self.config.get(
            "expected_column_count", SCMS_EXPECTED_COL_COUNT
        )
        self.critical_columns = self.config.get(
            "critical_columns", SCMS_CRITICAL_COLUMNS
        )
        self.max_null_crit = self.thresholds.get(
            "max_null_percentage_critical", 0.05
        )
        self.max_null_std = self.thresholds.get(
            "max_null_percentage_standard", 0.40
        )

    def validate(self, df: pd.DataFrame) -> ValidationReport:
        """Run all validation assertions against an ingested SCMS DataFrame.

        Args:
            df: Standardized or raw SCMS DataFrame.

        Returns:
            ValidationReport with detailed pass/fail status, warnings, and metrics.
        """
        passed: List[str] = []
        failed: List[str] = []
        warnings: List[str] = []
        metrics: Dict[str, Any] = {
            "row_count": len(df),
            "column_count": len(df.columns),
        }

        # ---------------------------------------------------------------------
        # 1. Non-Empty & Row-Count Reconciliation
        # ---------------------------------------------------------------------
        if len(df) == 0:
            failed.append("DataFrame is empty (0 rows)")
        elif len(df) == self.expected_row_count:
            passed.append(f"Row count reconciles exactly with baseline ({self.expected_row_count})")
        else:
            warnings.append(
                f"Row count ({len(df)}) differs from expected ({self.expected_row_count})"
            )

        # ---------------------------------------------------------------------
        # 2. Required 33 Columns Presence
        # ---------------------------------------------------------------------
        missing_cols = [col for col in SCMS_RAW_COLUMNS if col not in df.columns]
        if missing_cols:
            failed.append(f"Missing required SCMS raw columns: {missing_cols}")
        else:
            passed.append("All 33 required SCMS raw columns are present")

        # ---------------------------------------------------------------------
        # 3. Primary Key Uniqueness & Non-Nullness
        # ---------------------------------------------------------------------
        if COL_ID not in df.columns:
            failed.append("Primary key column 'ID' is missing")
        else:
            null_ids = int(df[COL_ID].isna().sum())
            if null_ids > 0:
                failed.append(f"Primary key 'ID' contains {null_ids} null values")
            else:
                passed.append("Primary key 'ID' contains 0 null values")

            unique_ids = df[COL_ID].nunique()
            metrics["unique_id_count"] = unique_ids
            if unique_ids != len(df):
                failed.append(
                    f"Primary key 'ID' contains duplicate values: {len(df) - unique_ids} duplicates ({unique_ids} unique vs {len(df)} total)"
                )
            else:
                passed.append(f"Primary key 'ID' is 100% unique ({unique_ids} unique values)")

        # ---------------------------------------------------------------------
        # 4. Critical Columns Zero-Null Constraints
        # ---------------------------------------------------------------------
        for col in self.critical_columns:
            if col in df.columns:
                null_count = int(df[col].isna().sum())
                if null_count > 0:
                    failed.append(
                        f"Critical column '{col}' contains {null_count} nulls (expected 0)"
                    )
                else:
                    passed.append(f"Critical column '{col}' has 0 null values")

        # ---------------------------------------------------------------------
        # 5. Non-Critical Column Null Tolerances
        # ---------------------------------------------------------------------
        null_tolerance_specs = {
            COL_SHIPMENT_MODE: 0.05,
            COL_DOSAGE: 0.40,
            COL_LINE_ITEM_INSURANCE_USD: 0.05,
            COL_WEIGHT_KG: 0.40,
            COL_FREIGHT_COST_USD: 0.40,
        }
        for col, max_null_ratio in null_tolerance_specs.items():
            if col in df.columns:
                null_ratio = float(df[col].isna().mean())
                metrics[f"{col}_null_ratio"] = null_ratio
                if null_ratio > max_null_ratio:
                    failed.append(
                        f"Column '{col}' null ratio ({null_ratio:.2%}) exceeds tolerance ({max_null_ratio:.2%})"
                    )
                else:
                    passed.append(
                        f"Column '{col}' null ratio ({null_ratio:.2%}) within tolerance ({max_null_ratio:.2%})"
                    )

        # ---------------------------------------------------------------------
        # 6. Numeric Positivity & Range Checks
        # ---------------------------------------------------------------------
        if COL_LINE_ITEM_QUANTITY in df.columns:
            non_pos_qty = int((df[COL_LINE_ITEM_QUANTITY] <= 0).sum())
            if non_pos_qty > 0:
                failed.append(f"Line Item Quantity contains {non_pos_qty} non-positive values")
            else:
                passed.append("Line Item Quantity values are all >= 1")

        if COL_LINE_ITEM_VALUE in df.columns:
            neg_val = int((df[COL_LINE_ITEM_VALUE] < 0).sum())
            if neg_val > 0:
                failed.append(f"Line Item Value contains {neg_val} negative values")
            else:
                passed.append("Line Item Value values are all >= 0.0")

        if COL_UNIT_PRICE in df.columns:
            neg_up = int((df[COL_UNIT_PRICE] < 0).sum())
            if neg_up > 0:
                failed.append(f"Unit Price contains {neg_up} negative values")
            else:
                passed.append("Unit Price values are all >= 0.0")

        if COL_PACK_PRICE in df.columns:
            neg_pp = int((df[COL_PACK_PRICE] < 0).sum())
            if neg_pp > 0:
                failed.append(f"Pack Price contains {neg_pp} negative values")
            else:
                passed.append("Pack Price values are all >= 0.0")

        if COL_UNIT_OF_MEASURE in df.columns:
            invalid_uom = int((df[COL_UNIT_OF_MEASURE] < 1).sum())
            if invalid_uom > 0:
                failed.append(f"Unit of Measure contains {invalid_uom} values < 1")
            else:
                passed.append("Unit of Measure values are all >= 1")

        if COL_LINE_ITEM_INSURANCE_USD in df.columns:
            ins_valid = df[COL_LINE_ITEM_INSURANCE_USD].dropna()
            neg_ins = int((ins_valid < 0).sum())
            if neg_ins > 0:
                failed.append(f"Line Item Insurance contains {neg_ins} negative values")
            else:
                passed.append("Line Item Insurance values are all >= 0.0")

        # ---------------------------------------------------------------------
        # 7. Categorical Domain Validity
        # ---------------------------------------------------------------------
        for cat_col, valid_set in SCMS_ALLOWED_DOMAINS.items():
            if cat_col in df.columns:
                actual_vals = set(df[cat_col].dropna().unique())
                invalid_vals = actual_vals - valid_set
                if invalid_vals:
                    failed.append(
                        f"Categorical '{cat_col}' contains invalid values: {invalid_vals}"
                    )
                else:
                    passed.append(f"Categorical '{cat_col}' values all within allowed domain")

        # ---------------------------------------------------------------------
        # 8. Delivery Milestone Dates Completeness and Temporal Bounds
        # ---------------------------------------------------------------------
        for milestone_col in [
            COL_SCHEDULED_DELIVERY_DATE,
            COL_DELIVERED_TO_CLIENT_DATE,
            COL_DELIVERY_RECORDED_DATE,
        ]:
            if milestone_col in df.columns:
                if pd.api.types.is_datetime64_any_dtype(df[milestone_col]):
                    nat_count = int(df[milestone_col].isna().sum())
                    if nat_count > 0:
                        failed.append(f"Milestone date '{milestone_col}' contains {nat_count} NaT values")
                    else:
                        passed.append(f"Milestone date '{milestone_col}' is 100% parsed with 0 NaT")

                    # Check temporal reasonable bounds (2006 to 2016)
                    non_null_dates = df[milestone_col].dropna()
                    if not non_null_dates.empty:
                        min_date = non_null_dates.min()
                        max_date = non_null_dates.max()
                        if min_date < pd.Timestamp("2006-01-01") or max_date > pd.Timestamp("2016-01-01"):
                            warnings.append(
                                f"Milestone date '{milestone_col}' out of standard bounds: {min_date} to {max_date}"
                            )
                        else:
                            passed.append(
                                f"Milestone date '{milestone_col}' within valid range ({min_date.date()} to {max_date.date()})"
                            )

        # ---------------------------------------------------------------------
        # 9. Temporal Anomaly Auditing
        # ---------------------------------------------------------------------
        if (
            COL_PO_SENT_DATE in df.columns
            and COL_DELIVERED_TO_CLIENT_DATE in df.columns
            and pd.api.types.is_datetime64_any_dtype(df[COL_PO_SENT_DATE])
            and pd.api.types.is_datetime64_any_dtype(df[COL_DELIVERED_TO_CLIENT_DATE])
        ):
            po_gt_deliv_mask = (df[COL_PO_SENT_DATE] > df[COL_DELIVERED_TO_CLIENT_DATE]).fillna(False)
            po_gt_deliv_count = int(po_gt_deliv_mask.sum())
            metrics["po_gt_delivered_anomaly_count"] = po_gt_deliv_count
            if po_gt_deliv_count > 0:
                id_list = (
                    df.loc[po_gt_deliv_mask, COL_ID].tolist()
                    if COL_ID in df.columns
                    else [f"row_{i}" for i in df[po_gt_deliv_mask].index]
                )
                warnings.append(
                    f"Audited {po_gt_deliv_count} records where PO Sent Date > Delivered to Client Date (IDs: {id_list})"
                )
            else:
                passed.append("0 records where PO Sent Date > Delivered to Client Date")

        if (
            COL_DELIVERY_RECORDED_DATE in df.columns
            and COL_DELIVERED_TO_CLIENT_DATE in df.columns
            and pd.api.types.is_datetime64_any_dtype(df[COL_DELIVERY_RECORDED_DATE])
            and pd.api.types.is_datetime64_any_dtype(df[COL_DELIVERED_TO_CLIENT_DATE])
        ):
            rec_lt_deliv_mask = (df[COL_DELIVERY_RECORDED_DATE] < df[COL_DELIVERED_TO_CLIENT_DATE]).fillna(False)
            rec_lt_deliv_count = int(rec_lt_deliv_mask.sum())
            metrics["recorded_lt_delivered_anomaly_count"] = rec_lt_deliv_count
            if rec_lt_deliv_count > 0:
                id_list = (
                    df.loc[rec_lt_deliv_mask, COL_ID].tolist()
                    if COL_ID in df.columns
                    else [f"row_{i}" for i in df[rec_lt_deliv_mask].index]
                )
                warnings.append(
                    f"Audited {rec_lt_deliv_count} records where Delivery Recorded Date < Delivered to Client Date (IDs: {id_list})"
                )
            else:
                passed.append("0 records where Delivery Recorded Date < Delivered to Client Date")

        # ---------------------------------------------------------------------
        # 10. Target Column Integrity (if present)
        # ---------------------------------------------------------------------
        if COL_DELAY_FLAG in df.columns:
            non_null_flags = df[COL_DELAY_FLAG].dropna()
            unique_flags = set(non_null_flags.unique())
            if not unique_flags.issubset({0, 1}):
                failed.append(f"Delay_Flag contains invalid values: {unique_flags}")
            else:
                passed.append("Delay_Flag is strictly binary in {0, 1}")
                if len(non_null_flags) > 0:
                    delayed_count = int((non_null_flags == 1).sum())
                    metrics["delayed_count"] = delayed_count
                    metrics["delay_rate"] = float(non_null_flags.mean())

        if COL_DELAY_DAYS in df.columns:
            non_null_delays = df[COL_DELAY_DAYS].dropna()
            if len(df) > 0 and not non_null_delays.empty:
                metrics["min_delay_days"] = int(non_null_delays.min())
                metrics["max_delay_days"] = int(non_null_delays.max())
                passed.append(
                    f"Delay_Days computed (min={metrics['min_delay_days']}, max={metrics['max_delay_days']})"
                )

        is_valid = len(failed) == 0
        total_checks = len(passed) + len(failed)

        return ValidationReport(
            is_valid=is_valid,
            total_checks=total_checks,
            passed_checks=passed,
            failed_checks=failed,
            warnings=warnings,
            metrics=metrics,
        )
