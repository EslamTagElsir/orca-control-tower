"""Supply Chain Delay Intelligence System.

A Python-first, local-first research-grade predictive, conformal uncertainty,
and prescriptive causal intelligence system for multi-modal supply chains.
"""

__version__ = "0.1.0"
__author__ = "Supply Chain Intelligence Team"

from delay_intelligence.core.config import get_data_paths, load_config
from delay_intelligence.core.exceptions import DelayIntelligenceError
from delay_intelligence.core.logging import get_logger, setup_logging

__all__ = [
    "__version__",
    "load_config",
    "get_data_paths",
    "setup_logging",
    "get_logger",
    "DelayIntelligenceError",
]
