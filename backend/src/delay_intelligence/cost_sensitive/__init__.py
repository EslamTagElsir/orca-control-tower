"""
Cost-Sensitive Learning and Scenario Engine (Phase 2 — Experiment E8).

Exports:
- CostScenario: Pydantic configuration schema for cost parameters.
- CostScenarioModel: Primary engine for instance-dependent cost calculation.
- CostEngine: Alias for CostScenarioModel.
- LeakageViolationError: Exception raised on forbidden leakage column usage.
- CostBreakdown: Container holding instance-level cost outputs.
- FORBIDDEN_COLUMNS: Canonical list of forbidden features and post-outcome columns.
- BaseE8Strategy: Abstract base strategy class.
- StandardCatBoostStrategy: Strategy E8-A (Logloss + probability calibration + governed threshold).
- CostWeightedCatBoostStrategy: Strategy E8-B (Cost-weighted CatBoost with instance sample weights).
- CostThresholdCatBoostStrategy: Strategy E8-C (Calibrated CatBoost with instance Bayes threshold).
- preprocess_features: Feature cleaning and preprocessing helper.
- load_default_feature_schema: Schema loader helper.
- ExpandingWindowBacktester: Development expanding-window backtester across 5 chronological folds.
- calculate_e8_metrics: Comprehensive economic and statistical metric calculation.
- compute_expected_calibration_error: ECE calculation helper.
"""

from delay_intelligence.cost_sensitive.backtester import (
    ExpandingWindowBacktester,
    calculate_e8_metrics,
    compute_expected_calibration_error,
    run_e8_dev_backtest,
)
from delay_intelligence.cost_sensitive.budgeting import (
    BudgetMetrics,
    OperationalBudgetSimulator,
    OperationalPolicyType,
    run_e8_dev_budget_simulation,
)
from delay_intelligence.cost_sensitive.cost_engine import (
    CostBreakdown,
    CostEngine,
    CostScenario,
    CostScenarioModel,
    FORBIDDEN_COLUMNS,
    LeakageViolationError,
)
from delay_intelligence.cost_sensitive.holdout_evaluator import (
    FinalHoldoutEvaluator,
    run_e8_holdout_evaluation,
)
from delay_intelligence.cost_sensitive.models import (
    BaseE8Strategy,
    CostThresholdCatBoostStrategy,
    CostWeightedCatBoostStrategy,
    StandardCatBoostStrategy,
    load_default_feature_schema,
    preprocess_features,
)
from delay_intelligence.cost_sensitive.policy_freeze import (
    ChampionStrategySpec,
    FrozenCostPolicy,
    FrozenFeatureContract,
    HoldoutLeakageError,
    OperationalBudgetRuleSpec,
    freeze_e8_policy,
    verify_temporal_holdout_isolation,
)
from delay_intelligence.cost_sensitive.sensitivity import (
    CostSensitivityAnalyzer,
    PolicyRobustnessReport,
    RobustnessClassification,
    run_e8_dev_sensitivity_analysis,
)

__all__ = [
    "CostScenario",
    "CostScenarioModel",
    "CostEngine",
    "LeakageViolationError",
    "CostBreakdown",
    "FORBIDDEN_COLUMNS",
    "BaseE8Strategy",
    "StandardCatBoostStrategy",
    "CostWeightedCatBoostStrategy",
    "CostThresholdCatBoostStrategy",
    "preprocess_features",
    "load_default_feature_schema",
    "ExpandingWindowBacktester",
    "calculate_e8_metrics",
    "compute_expected_calibration_error",
    "run_e8_dev_backtest",
    "OperationalPolicyType",
    "BudgetMetrics",
    "OperationalBudgetSimulator",
    "run_e8_dev_budget_simulation",
    "RobustnessClassification",
    "PolicyRobustnessReport",
    "CostSensitivityAnalyzer",
    "run_e8_dev_sensitivity_analysis",
    "HoldoutLeakageError",
    "ChampionStrategySpec",
    "FrozenFeatureContract",
    "OperationalBudgetRuleSpec",
    "FrozenCostPolicy",
    "freeze_e8_policy",
    "verify_temporal_holdout_isolation",
    "FinalHoldoutEvaluator",
    "run_e8_holdout_evaluation",
]


