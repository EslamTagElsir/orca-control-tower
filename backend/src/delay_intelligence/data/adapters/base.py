"""Abstract Base Class for Data Ingestion Adapters."""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, Optional, Union


class BaseIngestionAdapter(ABC):
    """Abstract Base Class defining the contract for all raw dataset adapters.

    Every concrete adapter (e.g. SCMSAdapter, OlistAdapter, DataCoAdapter) must implement
    this contract to allow seamless, decoupled ingestion into the delay intelligence pipeline.
    """

    def __init__(self, data_path: Union[str, Path], config: Optional[Dict[str, Any]] = None) -> None:
        """Initialize adapter with dataset path and optional configuration.

        Args:
            data_path: Path to raw dataset file or root directory.
            config: Optional configuration dictionary for dataset-specific settings.
        """
        self.data_path = Path(data_path)
        self.config = config or {}

    @abstractmethod
    def load_raw(self) -> Any:
        """Load raw data into an in-memory tabular representation (e.g. pandas.DataFrame).

        Returns:
            Raw tabular data structure.

        Raises:
            DataImmutabilityError: If source cannot be read without write access.
            FileNotFoundError: If the specified raw data file does not exist.
        """
        pass

    @abstractmethod
    def standardize_schema(self, df: Any) -> Any:
        """Standardize column names, types, missing values, and date parsing.

        Args:
            df: Raw tabular data.

        Returns:
            Standardized DataFrame with normalized column headers and clean data types.
        """
        pass

    @abstractmethod
    def extract_temporal_features(self, df: Any) -> Any:
        """Extract primary timestamps, transit durations, and temporal targets (Delay_Flag, Delay_Days).

        Args:
            df: Standardized tabular data.

        Returns:
            DataFrame with enriched temporal milestones and target variables.
        """
        pass

    @abstractmethod
    def get_dataset_metadata(self) -> Dict[str, Any]:
        """Return dataset metadata summary including row/column counts, primary key, and target definition.

        Returns:
            Dictionary containing metadata attributes.
        """
        pass
