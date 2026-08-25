"""
Cost-Sensitive Model Strategies for Supply Chain Delay Intelligence (Phase 2 — Experiment E8).

Implements:
- BaseE8Strategy: Abstract base class for all E8 cost-sensitive modeling strategies.
- StandardCatBoostStrategy (E8-A): Standard logloss CatBoost classifier with probability calibration
  and governed thresholding (fixed tau=0.50 and validation F1-optimal).
- CostWeightedCatBoostStrategy (E8-B): CatBoost trained with instance-dependent sample weights
  w_i = y_i * max(FN_Cost(i) - TP_Cost(i), epsilon) + (1 - y_i) * FP_Cost(i), normalized across folds.
- CostThresholdCatBoostStrategy (E8-C): Standard CatBoost with probability calibration and
  instance-dependent Bayes optimal threshold T_i = FP_Cost(i) / (Net_Benefit(i) + FP_Cost(i))
  (with optional inner-CV tuned gamma multiplier).
"""

from __future__ import annotations

import abc
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import catboost as cb
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import f1_score

from delay_intelligence.cost_sensitive.cost_engine import (
    CostBreakdown,
    CostEngine,
    CostScenario,
    CostScenarioModel,
    FORBIDDEN_COLUMNS,
    LeakageViolationError,
)

logger = logging.getLogger(__name__)

DEFAULT_FEATURE_SCHEMA_PATH = "artifacts/model_registry/v1/feature_schema.json"


def load_default_feature_schema(
    schema_path: Union[str, Path] = DEFAULT_FEATURE_SCHEMA_PATH,
) -> Tuple[List[str], List[str], List[str]]:
    """
    Loads default feature column lists from the model registry schema if available.

    Returns:
        Tuple of (feature_cols, num_cols, cat_cols).
    """
    path = Path(schema_path)
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            num_cols = list(data.get("num_cols", []))
            cat_cols = list(data.get("cat_cols", []))
            all_features = list(data.get("all_features", []))
            if all_features:
                return all_features, num_cols, cat_cols
            return num_cols + cat_cols, num_cols, cat_cols
        except Exception as e:
            logger.warning(f"Could not load feature schema from {path}: {e}")

    # Canonical default fallback
    num_cols = [
        "Unit Price",
        "vendor_hist_volume",
        "country_hist_delay_rate",
        "T_pred_quarter",
        "vendor_hist_delay_median",
        "weight_is_numeric",
        "freight_is_numeric",
        "vendor_hist_delay_rate",
        "is_rdc_fulfillment",
        "po_sent_is_date",
        "Forecast_Horizon_Days",
        "PQ_to_PO_Days",
        "T_pred_year",
        "T_pred_month",
        "Unit of Measure (Per Pack)",
        "pq_first_sent_is_date",
        "site_hist_delay_rate",
        "country_hist_delay_median",
        "Line Item Value",
        "Pack Price",
        "is_pre_pq_process",
        "Line Item Insurance (USD)",
        "Scheduled_Transit_Days",
        "T_pred_dayofweek",
        "country_hist_volume",
        "Line Item Quantity",
    ]
    cat_cols = [
        "Country",
        "Brand",
        "Fulfill Via",
        "Molecule/Test Type",
        "Manufacturing Site",
        "First Line Designation",
        "Dosage Form",
        "Dosage",
        "Shipment Mode",
        "Product Group",
        "Sub Classification",
        "Vendor INCO Term",
        "Vendor",
    ]
    return num_cols + cat_cols, num_cols, cat_cols


def sanitize_cost_inputs(
    df: Union[pd.DataFrame, Dict[str, Any], pd.Series],
) -> Union[pd.DataFrame, Dict[str, Any], pd.Series]:
    """
    Strips forbidden post-outcome columns and targets before cost computation to guarantee zero leakage.
    """
    if isinstance(df, pd.DataFrame):
        cols_to_drop = [c for c in df.columns if c in FORBIDDEN_COLUMNS or c in ["Delay_Flag", "Delay_Days", "ID", "T_pred"]]
        if cols_to_drop:
            return df.drop(columns=cols_to_drop, errors="ignore")
    elif isinstance(df, dict):
        return {k: v for k, v in df.items() if k not in FORBIDDEN_COLUMNS and k not in ["Delay_Flag", "Delay_Days", "ID", "T_pred"]}
    elif isinstance(df, pd.Series):
        idx_to_drop = [k for k in df.index if k in FORBIDDEN_COLUMNS or k in ["Delay_Flag", "Delay_Days", "ID", "T_pred"]]
        if idx_to_drop:
            return df.drop(labels=idx_to_drop, errors="ignore")
    return df


def preprocess_features(
    X: pd.DataFrame,
    cat_cols: Optional[Sequence[str]] = None,
    num_cols: Optional[Sequence[str]] = None,
    feature_cols: Optional[Sequence[str]] = None,
) -> Tuple[pd.DataFrame, List[str]]:
    """
    Cleans and standardizes input feature DataFrame for CatBoost ingestion.
    - Filters to allowed feature columns (omitting target/forbidden columns).
    - Replaces NaNs in numeric columns with 0.0.
    - Replaces NaNs / string nulls in categorical columns with 'missing'.

    Args:
        X: Input feature DataFrame.
        cat_cols: List of categorical feature names.
        num_cols: List of numeric feature names.
        feature_cols: List of all ordered feature column names.

    Returns:
        Tuple of (preprocessed_DataFrame, resolved_cat_cols).
    """
    df_clean = X.copy()

    # Drop any forbidden / leakage columns if accidentally passed in X
    cols_to_drop = [c for c in df_clean.columns if c in FORBIDDEN_COLUMNS or c in ["Delay_Flag", "Delay_Days", "ID", "T_pred"]]
    if cols_to_drop:
        df_clean = df_clean.drop(columns=cols_to_drop, errors="ignore")

    if feature_cols is not None:
        avail_features = [c for c in feature_cols if c in df_clean.columns]
        if avail_features:
            df_clean = df_clean[avail_features].copy()

    resolved_cat: List[str] = []
    if cat_cols is not None:
        resolved_cat = [c for c in cat_cols if c in df_clean.columns]
    else:
        resolved_cat = df_clean.select_dtypes(exclude=[np.number]).columns.tolist()

    resolved_num: List[str] = []
    if num_cols is not None:
        resolved_num = [c for c in num_cols if c in df_clean.columns]
    else:
        resolved_num = [c for c in df_clean.columns if c not in resolved_cat]

    for c in resolved_num:
        df_clean[c] = pd.to_numeric(df_clean[c], errors="coerce").fillna(0.0).astype(float)

    for c in resolved_cat:
        df_clean[c] = (
            df_clean[c]
            .fillna("missing")
            .astype(str)
            .replace({"nan": "missing", "<NA>": "missing", "None": "missing", "NaT": "missing", "": "missing"})
        )

    return df_clean, resolved_cat


class BaseE8Strategy(abc.ABC):
    """
    Abstract Base Class for all Experiment E8 Cost-Sensitive Modeling Strategies.
    """

    def __init__(
        self,
        strategy_id: str,
        name: str,
        cost_engine: Optional[CostScenarioModel] = None,
        scenario_name: str = "base",
        model_params: Optional[Dict[str, Any]] = None,
        cat_cols: Optional[List[str]] = None,
        num_cols: Optional[List[str]] = None,
        feature_cols: Optional[List[str]] = None,
        calibrate: bool = True,
    ):
        """
        Initializes the base strategy.

        Args:
            strategy_id: Identifier code (e.g. 'E8-A', 'E8-B', 'E8-C').
            name: Human-readable descriptive name.
            cost_engine: CostScenarioModel instance (creates default if None).
            scenario_name: Cost scenario name ('low', 'base', 'high').
            model_params: Dictionary of CatBoost hyperparameters.
            cat_cols: Explicit list of categorical feature names.
            num_cols: Explicit list of numerical feature names.
            feature_cols: Explicit list of all feature names.
            calibrate: Whether to apply post-hoc probability calibration.
        """
        self.strategy_id = strategy_id
        self.name = name
        self.scenario_name = scenario_name.lower()
        self.cost_engine = cost_engine or CostScenarioModel(scenario_name=self.scenario_name)
        self.cost_engine.set_scenario(self.scenario_name)

        self.calibrate = calibrate
        self.calibrator: Optional[IsotonicRegression] = None
        self.model: Optional[cb.CatBoostClassifier] = None
        self.is_fitted: bool = False
        self.metadata: Dict[str, Any] = {}

        # Default model hyperparameters
        self.model_params: Dict[str, Any] = {
            "iterations": 300,
            "learning_rate": 0.05,
            "depth": 6,
            "random_seed": 42,
            "verbose": 0,
            "loss_function": "Logloss",
            "eval_metric": "Logloss",
        }
        if model_params:
            self.model_params.update(model_params)

        # Resolve feature schema
        if feature_cols is None or cat_cols is None or num_cols is None:
            def_feat, def_num, def_cat = load_default_feature_schema()
            self.feature_cols = feature_cols or def_feat
            self.num_cols = num_cols or def_num
            self.cat_cols = cat_cols or def_cat
        else:
            self.feature_cols = list(feature_cols)
            self.num_cols = list(num_cols)
            self.cat_cols = list(cat_cols)

    def preprocess(self, X: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
        """Preprocesses input feature DataFrame."""
        return preprocess_features(
            X,
            cat_cols=self.cat_cols,
            num_cols=self.num_cols,
            feature_cols=self.feature_cols,
        )

    @abc.abstractmethod
    def fit(
        self,
        X_train: pd.DataFrame,
        y_train: Union[pd.Series, np.ndarray, Sequence[int]],
        df_raw_train: Optional[pd.DataFrame] = None,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[Union[pd.Series, np.ndarray, Sequence[int]]] = None,
        df_raw_val: Optional[pd.DataFrame] = None,
    ) -> BaseE8Strategy:
        """
        Fits the strategy on training data, calibrating probabilities and tuning
        governed thresholds on inner validation data if provided.
        """
        raise NotImplementedError

    @abc.abstractmethod
    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """
        Computes predicted delay probability p_i in [0, 1] for each instance.
        """
        raise NotImplementedError

    def predict_thresholds(
        self,
        X: pd.DataFrame,
        df_raw: Optional[pd.DataFrame] = None,
    ) -> np.ndarray:
        """
        Returns the decision threshold(s) applicable to each instance.
        Base implementation returns a scalar threshold broadcast to array of length len(X).
        """
        thresh_val = getattr(self, "threshold", 0.50)
        return np.full(len(X), float(thresh_val), dtype=float)

    def predict(
        self,
        X: pd.DataFrame,
        df_raw: Optional[pd.DataFrame] = None,
    ) -> np.ndarray:
        """
        Predicts binary intervention decision d_i in {0, 1} for each instance.
        d_i = 1 (Intervene / Review / Expedite) if prob >= threshold_i else 0.
        """
        probs = self.predict_proba(X)
        thresholds = self.predict_thresholds(X, df_raw=df_raw)
        return (probs >= thresholds).astype(int)

    def compute_ranking_scores(
        self,
        X: pd.DataFrame,
        df_raw: Optional[pd.DataFrame] = None,
        policy: str = "cost_benefit",
    ) -> np.ndarray:
        """
        Computes prioritization ranking scores for operational review budgets (5%, 10%, 20%).

        Supported policies:
        - 'cost_benefit' / 'cost_sensitive': Expected net benefit E[Delta C_i] = p_i * Net_Benefit(i) - (1 - p_i) * FP_Cost(i).
        - 'risk_only' / 'probability': Probability of delay p_i.
        - 'value_only': Raw commodity line item value V_i.
        - 'expected_loss': Expected unmitigated loss p_i * FN_Cost(i).

        Args:
            X: Input feature dataset.
            df_raw: Optional raw dataset containing Line Item Value etc.
            policy: Prioritization policy rule.

        Returns:
            1D numpy array of priority ranking scores (higher score = higher review priority).
        """
        raw_source = df_raw if df_raw is not None else X
        clean_raw_source = sanitize_cost_inputs(raw_source)
        probs = self.predict_proba(X)

        if policy.lower() in ["risk_only", "probability"]:
            return probs

        if policy.lower() == "value_only":
            return self.cost_engine.extract_monetary_values(clean_raw_source)

        costs_df = self.cost_engine.compute_costs(
            clean_raw_source,
            scenario_name=self.scenario_name,
            strict_leakage_check=True,
            return_dataframe=True,
        )

        if policy.lower() in ["cost_benefit", "cost_sensitive", "net_benefit"]:
            net_ben = costs_df["net_benefit"].to_numpy(dtype=float)
            fp_cost = costs_df["fp_cost"].to_numpy(dtype=float)
            return probs * net_ben - (1.0 - probs) * fp_cost

        if policy.lower() in ["expected_loss", "expected_fn_cost"]:
            fn_cost = costs_df["fn_cost"].to_numpy(dtype=float)
            return probs * fn_cost

        raise ValueError(f"Unknown ranking policy: {policy}")

    def get_metadata(self) -> Dict[str, Any]:
        """Returns diagnostic and fitting metadata."""
        return {
            "strategy_id": self.strategy_id,
            "name": self.name,
            "scenario_name": self.scenario_name,
            "is_fitted": self.is_fitted,
            "calibrate": self.calibrate,
            **self.metadata,
        }


class StandardCatBoostStrategy(BaseE8Strategy):
    """
    Strategy E8-A: Standard CatBoost Classifier (Logloss) + Probability Calibration + Governed Threshold.

    Characteristics:
    - Trained using standard unweighted Logloss cross-entropy.
    - Post-hoc Isotonic Regression probability calibration on inner validation data.
    - Governed thresholding options:
        * 'fixed': Default threshold (e.g. tau = 0.50).
        * 'f1_optimal': Inner validation split F1-maximizing threshold tau* in [0.05, 0.95].
        * 'custom': Explicit specified threshold.
    """

    def __init__(
        self,
        threshold_mode: str = "fixed",
        fixed_threshold: float = 0.50,
        cost_engine: Optional[CostScenarioModel] = None,
        scenario_name: str = "base",
        model_params: Optional[Dict[str, Any]] = None,
        cat_cols: Optional[List[str]] = None,
        num_cols: Optional[List[str]] = None,
        feature_cols: Optional[List[str]] = None,
        calibrate: bool = True,
    ):
        super().__init__(
            strategy_id="E8-A",
            name=f"StandardCatBoost_{threshold_mode}",
            cost_engine=cost_engine,
            scenario_name=scenario_name,
            model_params=model_params,
            cat_cols=cat_cols,
            num_cols=num_cols,
            feature_cols=feature_cols,
            calibrate=calibrate,
        )
        self.threshold_mode = threshold_mode.lower()
        self.fixed_threshold = float(fixed_threshold)
        self.threshold: float = self.fixed_threshold

    def fit(
        self,
        X_train: pd.DataFrame,
        y_train: Union[pd.Series, np.ndarray, Sequence[int]],
        df_raw_train: Optional[pd.DataFrame] = None,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[Union[pd.Series, np.ndarray, Sequence[int]]] = None,
        df_raw_val: Optional[pd.DataFrame] = None,
    ) -> StandardCatBoostStrategy:
        """
        Fits standard CatBoost classifier on training set, fits probability calibrator on validation set,
        and determines governed decision threshold.
        """
        X_tr_clean, resolved_cat = self.preprocess(X_train)
        y_tr = np.asarray(y_train, dtype=int)

        # Initialize CatBoost classifier
        params = dict(self.model_params)
        self.model = cb.CatBoostClassifier(
            **params,
            cat_features=resolved_cat,
        )
        self.model.fit(X_tr_clean, y_tr, verbose=False)
        self.is_fitted = True

        # Probability Calibration
        if self.calibrate and X_val is not None and y_val is not None:
            X_val_clean, _ = self.preprocess(X_val)
            y_v = np.asarray(y_val, dtype=int)
            raw_val_probs = self.model.predict_proba(X_val_clean)[:, 1]

            if len(np.unique(y_v)) > 1 and len(y_v) >= 10:
                self.calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
                self.calibrator.fit(raw_val_probs, y_v)
            else:
                self.calibrator = None
        else:
            self.calibrator = None

        # Threshold Determination
        if self.threshold_mode == "f1_optimal":
            if X_val is not None and y_val is not None:
                cal_val_probs = self.predict_proba(X_val)
                y_v = np.asarray(y_val, dtype=int)
                best_f1 = -1.0
                best_tau = 0.50
                for tau in np.arange(0.05, 0.95, 0.01):
                    preds = (cal_val_probs >= tau).astype(int)
                    f1 = float(f1_score(y_v, preds, zero_division=0))
                    if f1 > best_f1:
                        best_f1 = f1
                        best_tau = float(tau)
                self.threshold = best_tau
                self.metadata["val_best_f1"] = best_f1
            else:
                self.threshold = self.fixed_threshold
        elif self.threshold_mode == "fixed":
            self.threshold = self.fixed_threshold
        else:
            self.threshold = self.fixed_threshold

        self.metadata["threshold"] = self.threshold
        self.metadata["threshold_mode"] = self.threshold_mode
        self.metadata["n_train"] = len(X_train)
        self.metadata["n_val"] = len(X_val) if X_val is not None else 0

        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Computes calibrated or uncalibrated delay probabilities."""
        if not self.is_fitted or self.model is None:
            raise RuntimeError("Model must be fitted before predict_proba.")

        X_clean, _ = self.preprocess(X)
        raw_probs = self.model.predict_proba(X_clean)[:, 1]

        if self.calibrate and self.calibrator is not None:
            cal_probs = self.calibrator.predict(raw_probs)
            return np.clip(np.nan_to_num(cal_probs, nan=raw_probs), 0.0, 1.0)
        return raw_probs


class CostWeightedCatBoostStrategy(BaseE8Strategy):
    """
    Strategy E8-B: Cost-Sensitive CatBoost Classifier (Instance-Dependent Sample Weights).

    Characteristics:
    - Incorporates asymmetric operational penalties directly into tree-building via instance sample weights:
        w_i = y_i * max(FN_Cost(i) - TP_Cost(i), epsilon) + (1 - y_i) * FP_Cost(i)
        where FN_Cost(i) - TP_Cost(i) = Net_Benefit(i).
    - Normalized such that mean(w_i) = 1.0.
    - Evaluates decision with default threshold (tau=0.50) or inner-CV empirical cost-minimizing threshold.
    """

    def __init__(
        self,
        threshold_mode: str = "cost_optimal",
        fixed_threshold: float = 0.50,
        epsilon: float = 10.0,
        normalize: bool = True,
        cost_engine: Optional[CostScenarioModel] = None,
        scenario_name: str = "base",
        model_params: Optional[Dict[str, Any]] = None,
        cat_cols: Optional[List[str]] = None,
        num_cols: Optional[List[str]] = None,
        feature_cols: Optional[List[str]] = None,
        calibrate: bool = False,
    ):
        super().__init__(
            strategy_id="E8-B",
            name="CostWeightedCatBoost",
            cost_engine=cost_engine,
            scenario_name=scenario_name,
            model_params=model_params,
            cat_cols=cat_cols,
            num_cols=num_cols,
            feature_cols=feature_cols,
            calibrate=calibrate,
        )
        self.threshold_mode = threshold_mode.lower()
        self.fixed_threshold = float(fixed_threshold)
        self.threshold: float = self.fixed_threshold
        self.epsilon = float(epsilon)
        self.normalize = normalize

    def compute_sample_weights(
        self,
        X: pd.DataFrame,
        y: Union[pd.Series, np.ndarray, Sequence[int]],
        df_raw: Optional[pd.DataFrame] = None,
    ) -> np.ndarray:
        """
        Computes normalized instance-dependent sample weights w_i based strictly on prediction-time attributes.
        """
        raw_source = df_raw if df_raw is not None else X
        clean_raw_source = sanitize_cost_inputs(raw_source)

        costs_df = self.cost_engine.compute_costs(
            clean_raw_source,
            scenario_name=self.scenario_name,
            strict_leakage_check=True,
            return_dataframe=True,
        )

        y_arr = np.asarray(y, dtype=int)
        fn_costs = costs_df["fn_cost"].to_numpy(dtype=float)
        fp_costs = costs_df["fp_cost"].to_numpy(dtype=float)
        interv_costs = costs_df["intervention_cost"].to_numpy(dtype=float)
        resid_costs = costs_df["residual_delay_cost"].to_numpy(dtype=float)

        # Penalty for omission (FN penalty over TP cost): Net_Benefit = FN - (Intervention + Residual)
        net_benefit = fn_costs - (interv_costs + resid_costs)
        positive_weight = np.maximum(net_benefit, self.epsilon)
        negative_weight = np.maximum(fp_costs, 1.0)

        weights = np.where(y_arr == 1, positive_weight, negative_weight)
        if self.normalize and len(weights) > 0:
            mean_w = np.mean(weights)
            if mean_w > 0:
                weights = weights / mean_w

        return weights

    def fit(
        self,
        X_train: pd.DataFrame,
        y_train: Union[pd.Series, np.ndarray, Sequence[int]],
        df_raw_train: Optional[pd.DataFrame] = None,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[Union[pd.Series, np.ndarray, Sequence[int]]] = None,
        df_raw_val: Optional[pd.DataFrame] = None,
    ) -> CostWeightedCatBoostStrategy:
        """
        Fits cost-weighted CatBoost model and determines empirical cost-minimizing threshold.
        """
        X_tr_clean, resolved_cat = self.preprocess(X_train)
        y_tr = np.asarray(y_train, dtype=int)

        # Compute sample weights strictly from training features
        sample_weights = self.compute_sample_weights(X_train, y_tr, df_raw=df_raw_train)

        params = dict(self.model_params)
        self.model = cb.CatBoostClassifier(
            **params,
            cat_features=resolved_cat,
        )
        self.model.fit(X_tr_clean, y_tr, sample_weight=sample_weights, verbose=False)
        self.is_fitted = True

        # Calibration (optional for weighted models)
        if self.calibrate and X_val is not None and y_val is not None:
            X_val_clean, _ = self.preprocess(X_val)
            y_v = np.asarray(y_val, dtype=int)
            raw_val_probs = self.model.predict_proba(X_val_clean)[:, 1]
            if len(np.unique(y_v)) > 1 and len(y_v) >= 10:
                self.calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
                self.calibrator.fit(raw_val_probs, y_v)
            else:
                self.calibrator = None
        else:
            self.calibrator = None

        # Threshold Determination
        if self.threshold_mode == "cost_optimal" and X_val is not None and y_val is not None:
            val_probs = self.predict_proba(X_val)
            y_v = np.asarray(y_val, dtype=int)
            raw_val_source = df_raw_val if df_raw_val is not None else X_val
            clean_raw_val = sanitize_cost_inputs(raw_val_source)

            val_costs = self.cost_engine.compute_costs(
                clean_raw_val,
                scenario_name=self.scenario_name,
                strict_leakage_check=True,
                return_dataframe=True,
            )

            best_cost = float("inf")
            best_tau = 0.50
            for tau in np.arange(0.05, 0.95, 0.01):
                d = (val_probs >= tau).astype(int)
                cost = CostScenarioModel.compute_expected_cost(y_v, d, val_costs)
                if cost < best_cost:
                    best_cost = cost
                    best_tau = float(tau)

            self.threshold = best_tau
            self.metadata["val_min_cost"] = best_cost
        else:
            self.threshold = self.fixed_threshold

        self.metadata["threshold"] = self.threshold
        self.metadata["threshold_mode"] = self.threshold_mode
        self.metadata["sample_weight_mean"] = float(np.mean(sample_weights))
        self.metadata["sample_weight_std"] = float(np.std(sample_weights))
        self.metadata["sample_weight_max"] = float(np.max(sample_weights))
        self.metadata["sample_weight_min"] = float(np.min(sample_weights))

        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Computes predicted probabilities from weighted CatBoost model."""
        if not self.is_fitted or self.model is None:
            raise RuntimeError("Model must be fitted before predict_proba.")

        X_clean, _ = self.preprocess(X)
        raw_probs = self.model.predict_proba(X_clean)[:, 1]

        if self.calibrate and self.calibrator is not None:
            cal_probs = self.calibrator.predict(raw_probs)
            return np.clip(np.nan_to_num(cal_probs, nan=raw_probs), 0.0, 1.0)
        return raw_probs


class CostThresholdCatBoostStrategy(BaseE8Strategy):
    """
    Strategy E8-C: Standard CatBoost (Logloss) + Probability Calibration + Instance-Dependent Bayes Optimal Thresholding.

    Characteristics:
    - Fits standard unweighted CatBoost with Logloss for maximum statistical calibration.
    - Applies Isotonic Regression probability calibration on inner validation data.
    - Decides intervention using instance-dependent Bayes optimal threshold:
        T_i = FP_Cost(i) / (Net_Benefit(i) + FP_Cost(i))
        d_i = 1 if p_cal,i >= clip(gamma * T_i, 0.0, 1.0) else 0.
    - Multiplier gamma:
        * Default gamma = 1.0 (exact Bayes risk minimum).
        * Tuned gamma* in [0.2, 2.0] tuned on inner validation data to minimize realized business cost.
    """

    def __init__(
        self,
        use_gamma_tuning: bool = False,
        gamma: float = 1.0,
        gamma_range: Tuple[float, float, float] = (0.20, 2.00, 0.05),
        use_simple_bayes: bool = False,
        cost_engine: Optional[CostScenarioModel] = None,
        scenario_name: str = "base",
        model_params: Optional[Dict[str, Any]] = None,
        cat_cols: Optional[List[str]] = None,
        num_cols: Optional[List[str]] = None,
        feature_cols: Optional[List[str]] = None,
        calibrate: bool = True,
    ):
        name_str = "CostThresholdCatBoost_TunedGamma" if use_gamma_tuning else "CostThresholdCatBoost_Bayes"
        super().__init__(
            strategy_id="E8-C",
            name=name_str,
            cost_engine=cost_engine,
            scenario_name=scenario_name,
            model_params=model_params,
            cat_cols=cat_cols,
            num_cols=num_cols,
            feature_cols=feature_cols,
            calibrate=calibrate,
        )
        self.use_gamma_tuning = use_gamma_tuning
        self.gamma = float(gamma)
        self.gamma_range = gamma_range
        self.use_simple_bayes = use_simple_bayes

    def fit(
        self,
        X_train: pd.DataFrame,
        y_train: Union[pd.Series, np.ndarray, Sequence[int]],
        df_raw_train: Optional[pd.DataFrame] = None,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[Union[pd.Series, np.ndarray, Sequence[int]]] = None,
        df_raw_val: Optional[pd.DataFrame] = None,
    ) -> CostThresholdCatBoostStrategy:
        """
        Fits standard CatBoost classifier, calibrates probabilities, and optionally tunes gamma multiplier on inner validation split.
        """
        X_tr_clean, resolved_cat = self.preprocess(X_train)
        y_tr = np.asarray(y_train, dtype=int)

        params = dict(self.model_params)
        self.model = cb.CatBoostClassifier(
            **params,
            cat_features=resolved_cat,
        )
        self.model.fit(X_tr_clean, y_tr, verbose=False)
        self.is_fitted = True

        # Probability Calibration
        if self.calibrate and X_val is not None and y_val is not None:
            X_val_clean, _ = self.preprocess(X_val)
            y_v = np.asarray(y_val, dtype=int)
            raw_val_probs = self.model.predict_proba(X_val_clean)[:, 1]

            if len(np.unique(y_v)) > 1 and len(y_v) >= 10:
                self.calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
                self.calibrator.fit(raw_val_probs, y_v)
            else:
                self.calibrator = None
        else:
            self.calibrator = None

        # Gamma Multiplier Tuning
        if self.use_gamma_tuning and X_val is not None and y_val is not None:
            val_probs = self.predict_proba(X_val)
            y_v = np.asarray(y_val, dtype=int)
            raw_val_source = df_raw_val if df_raw_val is not None else X_val
            clean_raw_val = sanitize_cost_inputs(raw_val_source)

            val_costs = self.cost_engine.compute_costs(
                clean_raw_val,
                scenario_name=self.scenario_name,
                strict_leakage_check=True,
                return_dataframe=True,
            )

            thresh_col = "tau_star_simple" if self.use_simple_bayes else "tau_star"
            base_tau = val_costs[thresh_col].to_numpy(dtype=float)

            best_cost = float("inf")
            best_gamma = 1.0
            g_min, g_max, g_step = self.gamma_range
            for g in np.arange(g_min, g_max + 1e-6, g_step):
                eff_tau = np.clip(g * base_tau, 0.0, 1.0)
                d = (val_probs >= eff_tau).astype(int)
                cost = CostScenarioModel.compute_expected_cost(y_v, d, val_costs)
                if cost < best_cost:
                    best_cost = cost
                    best_gamma = float(g)

            self.gamma = best_gamma
            self.metadata["val_min_cost"] = best_cost
            self.metadata["val_best_gamma"] = best_gamma
        else:
            self.metadata["gamma"] = self.gamma

        self.metadata["use_gamma_tuning"] = self.use_gamma_tuning
        self.metadata["use_simple_bayes"] = self.use_simple_bayes
        self.metadata["final_gamma"] = self.gamma

        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Computes calibrated or raw probabilities."""
        if not self.is_fitted or self.model is None:
            raise RuntimeError("Model must be fitted before predict_proba.")

        X_clean, _ = self.preprocess(X)
        raw_probs = self.model.predict_proba(X_clean)[:, 1]

        if self.calibrate and self.calibrator is not None:
            cal_probs = self.calibrator.predict(raw_probs)
            return np.clip(np.nan_to_num(cal_probs, nan=raw_probs), 0.0, 1.0)
        return raw_probs

    def predict_thresholds(
        self,
        X: pd.DataFrame,
        df_raw: Optional[pd.DataFrame] = None,
    ) -> np.ndarray:
        """
        Computes instance-dependent Bayes optimal threshold T_i for each instance in X:
        T_i = clip(gamma * tau*(i), 0.0, 1.0).
        """
        raw_source = df_raw if df_raw is not None else X
        clean_raw_source = sanitize_cost_inputs(raw_source)

        costs_df = self.cost_engine.compute_costs(
            clean_raw_source,
            scenario_name=self.scenario_name,
            strict_leakage_check=True,
            return_dataframe=True,
        )

        thresh_col = "tau_star_simple" if self.use_simple_bayes else "tau_star"
        base_tau = costs_df[thresh_col].to_numpy(dtype=float)
        return np.clip(self.gamma * base_tau, 0.0, 1.0)
