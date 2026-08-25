"""Concrete SCMS Supply Chain Dataset Ingestion Adapter."""

import hashlib
from pathlib import Path
from typing import Any, Dict, Optional, Union
import numpy as np
import pandas as pd

from delay_intelligence.core.config import get_data_paths, load_config
from delay_intelligence.core.exceptions import DataImmutabilityError
from delay_intelligence.core.logging import get_logger
from delay_intelligence.data.adapters.base import BaseIngestionAdapter
from delay_intelligence.data.schema import (
    COL_DELAY_DAYS,
    COL_DELAY_FLAG,
    COL_DELIVERED_TO_CLIENT_DATE,
    COL_DELIVERY_RECORDED_DATE,
    COL_FREIGHT_COST_USD,
    COL_FREIGHT_IS_NUMERIC,
    COL_FULFILL_VIA,
    COL_ID,
    COL_IS_PRE_PQ_PROCESS,
    COL_IS_RDC_FULFILLMENT,
    COL_IS_TEMPORAL_ANOMALY,
    COL_LINE_ITEM_INSURANCE_USD,
    COL_LINE_ITEM_QUANTITY,
    COL_LINE_ITEM_VALUE,
    COL_PACK_PRICE,
    COL_PO_SENT_DATE,
    COL_PO_SENT_IS_DATE,
    COL_PO_TO_SCHEDULED_DAYS,
    COL_PQ_FIRST_SENT_DATE,
    COL_PQ_FIRST_SENT_IS_DATE,
    COL_PQ_NUMBER,
    COL_SCHEDULED_DELIVERY_DATE,
    COL_SCHEDULED_TRANSIT_DAYS,
    COL_UNIT_OF_MEASURE,
    COL_UNIT_PRICE,
    COL_WEIGHT_IS_NUMERIC,
    COL_WEIGHT_KG,
    SCMS_CATEGORICAL_COLUMNS,
    SCMS_DELIVERY_MILESTONE_COLUMNS,
)

logger = get_logger("data.adapters.scms")


class SCMSAdapter(BaseIngestionAdapter):
    """Ingestion Adapter for SCMS Delivery History Dataset.

    Implements the BaseIngestionAdapter contract for the USAID Global Health
    SCMS pharmaceutical delivery history dataset.
    """

    def __init__(
        self,
        data_path: Optional[Union[str, Path]] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Initialize SCMSAdapter with dataset path and optional configuration.

        Args:
            data_path: Path to raw SCMS CSV file. If None, resolves from data.yaml.
            config: Optional configuration dictionary. If None, loads from data.yaml.
        """
        if data_path is None:
            resolved_paths = get_data_paths()
            data_path = resolved_paths["scms"]

        if config is None:
            try:
                data_cfg = load_config("data")
                config = data_cfg.get("datasets", {}).get("scms", {})
            except Exception:
                config = {}

        super().__init__(data_path=data_path, config=config)
        self.raw_sha256: Optional[str] = None

    def _compute_sha256(self) -> str:
        """Compute cryptographic SHA-256 checksum of the raw CSV file."""
        hasher = hashlib.sha256()
        with open(self.data_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                hasher.update(chunk)
        return hasher.hexdigest()

    def load_raw(self) -> pd.DataFrame:
        """Load raw SCMS data into pandas DataFrame strictly in read-only mode.

        Returns:
            Raw DataFrame containing all 10,324 rows and 33 columns.

        Raises:
            FileNotFoundError: If the raw data file does not exist.
            DataImmutabilityError: If the source file cannot be read in read-only mode.
        """
        if not self.data_path.exists() or not self.data_path.is_file():
            raise FileNotFoundError(f"SCMS raw data file not found: {self.data_path}")

        # Compute and record immutability checksum
        self.raw_sha256 = self._compute_sha256()
        logger.info(
            f"Loading SCMS raw data from {self.data_path} (SHA-256: {self.raw_sha256[:12]}...)"
        )

        encoding = self.config.get("encoding", "utf-8-sig")
        try:
            with open(self.data_path, "r", encoding=encoding) as f:
                df_raw = pd.read_csv(f, dtype=str)
        except Exception as exc:
            raise DataImmutabilityError(f"Failed to read SCMS raw data file: {exc}") from exc

        return df_raw.copy()

    def standardize_schema(self, df: pd.DataFrame) -> pd.DataFrame:
        """Standardize column types, clean composite strings, and parse dates.

        Guarantees zero data loss (retains all 10,324 rows).

        Args:
            df: Raw tabular DataFrame.

        Returns:
            Standardized DataFrame with normalized types and indicator flags.
        """
        df_out = df.copy()

        # 1. Clean Identifiers & Integer Columns
        df_out[COL_ID] = pd.to_numeric(df_out[COL_ID], errors="raise").astype(np.int64)
        df_out[COL_UNIT_OF_MEASURE] = (
            pd.to_numeric(df_out[COL_UNIT_OF_MEASURE], errors="coerce").fillna(1).astype(np.int64)
        )
        df_out[COL_LINE_ITEM_QUANTITY] = (
            pd.to_numeric(df_out[COL_LINE_ITEM_QUANTITY], errors="coerce").fillna(0).astype(np.int64)
        )

        # 2. Clean Monetary and Continuous Numerics
        df_out[COL_LINE_ITEM_VALUE] = pd.to_numeric(
            df_out[COL_LINE_ITEM_VALUE], errors="coerce"
        ).astype(np.float64)
        df_out[COL_PACK_PRICE] = pd.to_numeric(
            df_out[COL_PACK_PRICE], errors="coerce"
        ).astype(np.float64)
        df_out[COL_UNIT_PRICE] = pd.to_numeric(
            df_out[COL_UNIT_PRICE], errors="coerce"
        ).astype(np.float64)
        df_out[COL_LINE_ITEM_INSURANCE_USD] = pd.to_numeric(
            df_out[COL_LINE_ITEM_INSURANCE_USD], errors="coerce"
        ).astype(np.float64)

        # 3. Clean Composite Logistics Numerics (Weight & Freight Cost)
        # Capture numeric values, convert sentinels/notes to NaN, add indicator flags
        weight_numeric = pd.to_numeric(df_out[COL_WEIGHT_KG], errors="coerce")
        df_out[COL_WEIGHT_IS_NUMERIC] = weight_numeric.notna().astype(int)
        df_out[COL_WEIGHT_KG] = weight_numeric.astype(np.float64)

        freight_numeric = pd.to_numeric(df_out[COL_FREIGHT_COST_USD], errors="coerce")
        df_out[COL_FREIGHT_IS_NUMERIC] = freight_numeric.notna().astype(int)
        df_out[COL_FREIGHT_COST_USD] = freight_numeric.astype(np.float64)

        # 4. Parse Delivery Milestone Dates (format: %d-%b-%y)
        for date_col in SCMS_DELIVERY_MILESTONE_COLUMNS:
            df_out[date_col] = pd.to_datetime(df_out[date_col], format="%d-%b-%y", errors="coerce")

        # 5. Parse Procurement Milestone Dates (format: %m/%d/%y with sentinels)
        # RDC Fulfillment Indicator
        df_out[COL_IS_RDC_FULFILLMENT] = (df_out[COL_FULFILL_VIA] == "From RDC").astype(int)

        # Pre-PQ Process Indicator
        df_out[COL_IS_PRE_PQ_PROCESS] = (
            (df_out[COL_PQ_NUMBER] == "Pre-PQ Process")
            | (df_out[COL_PQ_FIRST_SENT_DATE] == "Pre-PQ Process")
        ).astype(int)

        # Coerce sentinels to NaT for datetimes
        df_out[COL_PO_SENT_DATE] = pd.to_datetime(
            df_out[COL_PO_SENT_DATE], format="%m/%d/%y", errors="coerce"
        )
        df_out[COL_PO_SENT_IS_DATE] = df_out[COL_PO_SENT_DATE].notna().astype(int)

        df_out[COL_PQ_FIRST_SENT_DATE] = pd.to_datetime(
            df_out[COL_PQ_FIRST_SENT_DATE], format="%m/%d/%y", errors="coerce"
        )
        df_out[COL_PQ_FIRST_SENT_IS_DATE] = df_out[COL_PQ_FIRST_SENT_DATE].notna().astype(int)

        # 6. Clean and Strip Categoricals
        for col in SCMS_CATEGORICAL_COLUMNS:
            if col in df_out.columns:
                df_out[col] = df_out[col].astype("string").str.strip()

        return df_out

    def extract_temporal_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract canonical target variables, transit durations, and temporal anomaly flags.

        Args:
            df: Standardized SCMS DataFrame.

        Returns:
            DataFrame enriched with Delay_Flag, Delay_Days, transit metrics, and anomaly masks.
        """
        df_out = df.copy()

        # Compute preliminary delay metrics safely with nullable dtypes
        if (
            COL_DELIVERED_TO_CLIENT_DATE in df_out.columns
            and COL_SCHEDULED_DELIVERY_DATE in df_out.columns
        ):
            delay_diff = (
                pd.to_datetime(df_out[COL_DELIVERED_TO_CLIENT_DATE], errors="coerce")
                - pd.to_datetime(df_out[COL_SCHEDULED_DELIVERY_DATE], errors="coerce")
            ).dt.days
            df_out[COL_DELAY_DAYS] = delay_diff.astype("Int64")
            df_out[COL_DELAY_FLAG] = pd.Series(
                np.where(delay_diff.isna(), pd.NA, (delay_diff > 0).astype(int)),
                index=df_out.index,
                dtype="Int64",
            )
        else:
            df_out[COL_DELAY_DAYS] = pd.Series(pd.NA, index=df_out.index, dtype="Int64")
            df_out[COL_DELAY_FLAG] = pd.Series(pd.NA, index=df_out.index, dtype="Int64")

        # Transit Duration Feature: Scheduled Transit Days
        if (
            COL_SCHEDULED_DELIVERY_DATE in df_out.columns
            and COL_PO_SENT_DATE in df_out.columns
        ):
            scheduled_transit = (
                pd.to_datetime(df_out[COL_SCHEDULED_DELIVERY_DATE], errors="coerce")
                - pd.to_datetime(df_out[COL_PO_SENT_DATE], errors="coerce")
            ).dt.days
            df_out[COL_SCHEDULED_TRANSIT_DAYS] = scheduled_transit.astype("Float64")
            df_out[COL_PO_TO_SCHEDULED_DAYS] = scheduled_transit.astype("Float64")
        else:
            df_out[COL_SCHEDULED_TRANSIT_DAYS] = pd.Series(pd.NA, index=df_out.index, dtype="Float64")
            df_out[COL_PO_TO_SCHEDULED_DAYS] = pd.Series(pd.NA, index=df_out.index, dtype="Float64")

        # Temporal Anomaly Flags (Audited Inversions)
        # 1. PO Sent > Delivered (5 records)
        # 2. Delivery Recorded < Delivered (3 records)
        # 3. Scheduled < PO Sent (4 records)
        if (
            COL_PO_SENT_DATE in df_out.columns
            and COL_DELIVERED_TO_CLIENT_DATE in df_out.columns
        ):
            po_gt_deliv = (
                pd.to_datetime(df_out[COL_PO_SENT_DATE], errors="coerce")
                > pd.to_datetime(df_out[COL_DELIVERED_TO_CLIENT_DATE], errors="coerce")
            ).fillna(False)
        else:
            po_gt_deliv = pd.Series(False, index=df_out.index)

        if (
            COL_DELIVERY_RECORDED_DATE in df_out.columns
            and COL_DELIVERED_TO_CLIENT_DATE in df_out.columns
        ):
            rec_lt_deliv = (
                pd.to_datetime(df_out[COL_DELIVERY_RECORDED_DATE], errors="coerce")
                < pd.to_datetime(df_out[COL_DELIVERED_TO_CLIENT_DATE], errors="coerce")
            ).fillna(False)
        else:
            rec_lt_deliv = pd.Series(False, index=df_out.index)

        if (
            COL_SCHEDULED_DELIVERY_DATE in df_out.columns
            and COL_PO_SENT_DATE in df_out.columns
        ):
            sched_lt_po = (
                pd.to_datetime(df_out[COL_SCHEDULED_DELIVERY_DATE], errors="coerce")
                < pd.to_datetime(df_out[COL_PO_SENT_DATE], errors="coerce")
            ).fillna(False)
        else:
            sched_lt_po = pd.Series(False, index=df_out.index)

        df_out[COL_IS_TEMPORAL_ANOMALY] = (po_gt_deliv | rec_lt_deliv | sched_lt_po).astype(int)

        return df_out

    def get_dataset_metadata(self) -> Dict[str, Any]:
        """Generate comprehensive dataset metadata, audit statistics, and validation summary.

        Returns:
            Structured dictionary with dataset properties and distribution profiles.
        """
        df_raw = self.load_raw()
        df_std = self.standardize_schema(df_raw)
        df_final = self.extract_temporal_features(df_std)

        null_summary = {col: int(df_final[col].isna().sum()) for col in df_final.columns}
        null_percentages = {col: float(df_final[col].isna().mean()) for col in df_final.columns}

        non_null_delays = df_final[COL_DELAY_DAYS].dropna()
        non_null_flags = df_final[COL_DELAY_FLAG].dropna()
        delayed_subset = df_final[df_final[COL_DELAY_FLAG] == 1][COL_DELAY_DAYS].dropna()

        return {
            "name": "scms",
            "dataset_name": self.config.get("name", "SCMS Supply Chain Dataset"),
            "raw_file_path": str(self.data_path.resolve()),
            "raw_sha256": self.raw_sha256 or self._compute_sha256(),
            "raw_byte_size": self.data_path.stat().st_size,
            "row_count": len(df_final),
            "column_count": len(df_raw.columns),
            "raw_row_count": len(df_raw),
            "raw_column_count": len(df_raw.columns),
            "standardized_row_count": len(df_final),
            "standardized_column_count": len(df_final.columns),
            "primary_key": COL_ID,
            "is_primary_key_unique": bool(df_final[COL_ID].is_unique),
            "duplicate_rows": int(df_raw.duplicated().sum()),
            "date_milestone_coverage": {
                COL_SCHEDULED_DELIVERY_DATE: {
                    "valid_count": int(df_final[COL_SCHEDULED_DELIVERY_DATE].notna().sum()),
                    "min_date": str(df_final[COL_SCHEDULED_DELIVERY_DATE].min()),
                    "max_date": str(df_final[COL_SCHEDULED_DELIVERY_DATE].max()),
                },
                COL_DELIVERED_TO_CLIENT_DATE: {
                    "valid_count": int(df_final[COL_DELIVERED_TO_CLIENT_DATE].notna().sum()),
                    "min_date": str(df_final[COL_DELIVERED_TO_CLIENT_DATE].min()),
                    "max_date": str(df_final[COL_DELIVERED_TO_CLIENT_DATE].max()),
                },
                COL_DELIVERY_RECORDED_DATE: {
                    "valid_count": int(df_final[COL_DELIVERY_RECORDED_DATE].notna().sum()),
                    "min_date": str(df_final[COL_DELIVERY_RECORDED_DATE].min()),
                    "max_date": str(df_final[COL_DELIVERY_RECORDED_DATE].max()),
                },
                COL_PO_SENT_DATE: {
                    "valid_count": int(df_final[COL_PO_SENT_DATE].notna().sum()),
                    "from_rdc_count": int((df_final[COL_FULFILL_VIA] == "From RDC").sum()),
                    "uncaptured_direct_drop_count": int(
                        (
                            (df_final[COL_FULFILL_VIA] == "Direct Drop")
                            & df_final[COL_PO_SENT_DATE].isna()
                        ).sum()
                    ),
                },
                COL_PQ_FIRST_SENT_DATE: {
                    "valid_count": int(df_final[COL_PQ_FIRST_SENT_DATE].notna().sum()),
                    "pre_pq_process_count": int(
                        (df_final[COL_IS_PRE_PQ_PROCESS] == 1).sum()
                    ),
                },
            },
            "target_distribution": {
                "delayed_count": int((non_null_flags == 1).sum()),
                "on_time_count": int((non_null_flags == 0).sum()),
                "delay_rate": float(non_null_flags.mean()) if len(non_null_flags) > 0 else 0.0,
                "min_delay_days": int(non_null_delays.min()) if not non_null_delays.empty else 0,
                "max_delay_days": int(non_null_delays.max()) if not non_null_delays.empty else 0,
                "median_delay_days_when_delayed": float(
                    delayed_subset.median()
                ) if not delayed_subset.empty else 0.0,
            },
            "null_summary": null_summary,
            "null_percentages": null_percentages,
        }
