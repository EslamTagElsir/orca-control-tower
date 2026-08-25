"""High-level DataLoader and pipeline orchestration for dataset ingestion."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Optional, Tuple, Union
import pandas as pd

from delay_intelligence.core.config import find_config_dir, load_config
from delay_intelligence.core.exceptions import DataValidationError
from delay_intelligence.core.logging import get_logger
from delay_intelligence.data.adapters.scms import SCMSAdapter

if TYPE_CHECKING:
    from delay_intelligence.validation.scms_validator import ValidationReport

logger = get_logger("data.loader")


class DataLoader:
    """High-level orchestrator for loading, staging, and caching datasets."""

    def __init__(self, config_dir: Optional[Union[str, Path]] = None) -> None:
        """Initialize DataLoader with optional custom config directory."""
        self.config_dir = Path(config_dir) if config_dir else find_config_dir()
        self.data_config = load_config("data", config_dir=self.config_dir)
        self.val_config = load_config("validation", config_dir=self.config_dir)

    def load_scms(
        self,
        save_bronze: bool = False,
        bronze_path: Optional[Union[str, Path]] = None,
    ) -> Tuple[pd.DataFrame, ValidationReport]:
        """Execute the full SCMS ingestion, validation, and staging pipeline.

        Args:
            save_bronze: If True, serializes validated data to Bronze Parquet table.
            bronze_path: Optional destination path for Bronze Parquet table.

        Returns:
            Tuple of (standardized DataFrame, ValidationReport).
        """
        from delay_intelligence.validation.scms_validator import SCMSValidator

        adapter = SCMSAdapter()
        df_raw = adapter.load_raw()
        df_std = adapter.standardize_schema(df_raw)
        df_final = adapter.extract_temporal_features(df_std)

        validator = SCMSValidator(config=self.val_config.get("scms_validation", {}))
        report = validator.validate(df_final)

        if not report.is_valid:
            error_msg = f"SCMS validation failed with {len(report.failed_checks)} failures: {report.failed_checks}"
            logger.error(error_msg)
            raise DataValidationError(error_msg)

        if save_bronze:
            if bronze_path is None:
                repo_root = self.config_dir.parent
                bronze_path = repo_root / "artifacts" / "data" / "bronze_scms.parquet"
            else:
                bronze_path = Path(bronze_path)

            bronze_path.parent.mkdir(parents=True, exist_ok=True)
            df_final.to_parquet(
                bronze_path, engine="pyarrow", compression="snappy", index=False
            )
            logger.info(f"Staged Bronze Parquet artifact at {bronze_path} ({bronze_path.stat().st_size} bytes)")

        return df_final, report


def ingest_scms_pipeline(
    bronze_output_path: Optional[Union[str, Path]] = None,
    save_parquet: bool = True,
    validate: bool = True,
) -> Tuple[pd.DataFrame, ValidationReport]:
    """Execute complete Stage 1 ingestion, validation, and Bronze Parquet staging.

    Args:
        bronze_output_path: Optional destination path for Bronze parquet file.
        save_parquet: Whether to write the standardized DataFrame to artifacts/data/.
        validate: Whether to run quality validations and raise on failure.

    Returns:
        Tuple of (standardized DataFrame, ValidationReport).

    Raises:
        DataValidationError: If critical schema validation checks fail.
    """
    adapter = SCMSAdapter()

    # 1. Load Raw strictly read-only
    df_raw = adapter.load_raw()
    logger.info(f"Loaded {len(df_raw)} raw SCMS records.")

    # 2. Standardize Schema & Clean Types
    df_std = adapter.standardize_schema(df_raw)

    # 3. Extract Preliminary Milestone Targets & Anomalies
    df_final = adapter.extract_temporal_features(df_std)

    # 4. Run Automated Validation
    from delay_intelligence.validation.scms_validator import SCMSValidator

    try:
        val_cfg = load_config("validation")
        scms_val_cfg = val_cfg.get("scms_validation", {})
    except Exception:
        scms_val_cfg = {}

    validator = SCMSValidator(config=scms_val_cfg)
    report = validator.validate(df_final)

    if validate and not report.is_valid:
        logger.error(f"Validation failed: {report.failed_checks}")
        raise DataValidationError(f"SCMS ingestion validation failed: {report.failed_checks}")

    logger.info(
        f"Validation status: {'PASSED' if report.is_valid else 'FAILED'} "
        f"({len(report.passed_checks)} passed, {len(report.failed_checks)} failed, "
        f"{len(report.warnings)} warnings)"
    )

    # 5. Save Bronze Parquet Artifact
    if save_parquet:
        if bronze_output_path is None:
            try:
                cfg_dir = find_config_dir()
                repo_root = cfg_dir.parent
                bronze_output_path = repo_root / "artifacts" / "data" / "bronze_scms.parquet"
            except Exception:
                bronze_output_path = Path("artifacts/data/bronze_scms.parquet")
        else:
            bronze_output_path = Path(bronze_output_path)

        bronze_output_path.parent.mkdir(parents=True, exist_ok=True)
        df_final.to_parquet(
            bronze_output_path,
            engine="pyarrow",
            compression="snappy",
            index=False,
        )
        logger.info(
            f"Successfully staged Bronze Parquet table at {bronze_output_path} "
            f"({bronze_output_path.stat().st_size} bytes)"
        )

    return df_final, report
