"""Custom domain exceptions for the delay intelligence system."""


class DelayIntelligenceError(Exception):
    """Base exception for all delay intelligence domain errors."""

    pass


class ConfigurationError(DelayIntelligenceError):
    """Raised when configuration parsing or validation fails."""

    pass


class DataValidationError(DelayIntelligenceError):
    """Raised when data fails schema, range, or integrity validation."""

    pass


class LeakageViolationError(DelayIntelligenceError):
    """Raised when feature engineering or temporal evaluation detects target or horizon leakage."""

    pass


class DataImmutabilityError(DelayIntelligenceError):
    """Raised when an attempt to modify read-only raw data sources is detected."""

    pass


class ModelTrainingError(DelayIntelligenceError):
    """Raised when model training, fitting, or convergence fails."""

    pass


class ConformalCalibrationError(DelayIntelligenceError):
    """Raised when conformal calibration fails or coverage bounds cannot be computed."""

    pass


class CausalIdentificationError(DelayIntelligenceError):
    """Raised when a causal effect cannot be identified from the specified DAG."""

    pass


class PrescriptiveOptimizationError(DelayIntelligenceError):
    """Raised when prescriptive optimization or policy selection fails."""

    pass
