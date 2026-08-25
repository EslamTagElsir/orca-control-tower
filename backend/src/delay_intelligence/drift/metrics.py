"""
Mathematical and Statistical Metrics for Chronological Drift Detection.
Implements:
- Continuous Feature Drift: Laplace-regularized PSI, Scale-Normalized 1-Wasserstein,
  Two-sample KS-test with Benjamini-Hochberg FDR correction.
- Categorical Feature Drift: Jensen-Shannon Divergence/Distance, Chi-Square goodness-of-fit
  with rare-category pooling, Categorical PSI.
- Prediction Drift: Classifier probability PSI & Wasserstein, Regressor PSI & Wasserstein,
  Quantile shifts.
- Target / Prevalence Drift: Binary prevalence delta, Two-proportion z-test, Target PSI,
  Continuous delay days Wasserstein & PSI, Extreme delay proportion shift P(Y > 14).
- Uncertainty Drift: CQR nonconformity score shift, Exact one-sided binomial undercoverage test,
  Empirical coverage deficit, Conformal interval width shift.
"""

from typing import Dict, List, Optional, Tuple, Union, Any
import numpy as np
import pandas as pd
from scipy import stats
from delay_intelligence.drift.schemas import (
    DriftStatus,
    PredictionDriftResult,
    TargetDriftResult,
    UncertaintyDriftResult,
)


def calculate_psi(
    ref: Union[np.ndarray, pd.Series, list],
    det: Union[np.ndarray, pd.Series, list],
    num_bins: int = 10,
    epsilon: float = 1e-4,
) -> float:
    """
    Calculates the Population Stability Index (PSI) with Laplace smoothing (epsilon).
    Reference quantile bins are used to partition the support.
    
    Formula:
        PSI = sum_{k=1}^B (q_k - p_k) * ln(q_k / p_k)
        where p_k = (n_{ref, k} + eps) / (N_{ref} + B * eps)
              q_k = (n_{det, k} + eps) / (N_{det} + B * eps)
    """
    ref_arr = np.asarray(ref, dtype=float)
    det_arr = np.asarray(det, dtype=float)
    
    ref_clean = ref_arr[np.isfinite(ref_arr)]
    det_clean = det_arr[np.isfinite(det_arr)]
    
    if len(ref_clean) == 0 or len(det_clean) == 0:
        return 0.0
        
    # Check for identical arrays
    if len(ref_clean) == len(det_clean) and np.allclose(ref_clean, det_clean):
        return 0.0

    # Quantile bins on reference
    quantiles = np.linspace(0.0, 1.0, num_bins + 1)
    bin_edges = np.quantile(ref_clean, quantiles)
    bin_edges = np.unique(bin_edges)
    
    # If reference is constant or unique edges < 2, use min/max bounds
    if len(bin_edges) < 2:
        bin_edges = np.array([ref_clean.min() - 1.0, ref_clean.max() + 1.0])
    else:
        bin_edges[0] = -np.inf
        bin_edges[-1] = np.inf
        
    k_bins = len(bin_edges) - 1
    
    ref_counts, _ = np.histogram(ref_clean, bins=bin_edges)
    det_counts, _ = np.histogram(det_clean, bins=bin_edges)
    
    p = (ref_counts + epsilon) / (len(ref_clean) + k_bins * epsilon)
    q = (det_counts + epsilon) / (len(det_clean) + k_bins * epsilon)
    
    psi_val = np.sum((q - p) * np.log(q / p))
    return float(max(0.0, psi_val))


def calculate_normalized_wasserstein(
    ref: Union[np.ndarray, pd.Series, list],
    det: Union[np.ndarray, pd.Series, list],
    epsilon: float = 1e-6,
) -> float:
    """
    Calculates scale-normalized 1-Wasserstein distance (Earth Mover's Distance).
    Normalized by the reference standard deviation.
    
    Formula:
        W_1_norm = W_1(P_ref, P_det) / (sigma_ref + epsilon)
    """
    ref_arr = np.asarray(ref, dtype=float)
    det_arr = np.asarray(det, dtype=float)
    
    ref_clean = ref_arr[np.isfinite(ref_arr)]
    det_clean = det_arr[np.isfinite(det_arr)]
    
    if len(ref_clean) == 0 or len(det_clean) == 0:
        return 0.0
        
    if len(ref_clean) == len(det_clean) and np.allclose(ref_clean, det_clean):
        return 0.0

    w1 = stats.wasserstein_distance(ref_clean, det_clean)
    std_ref = float(np.std(ref_clean, ddof=1)) if len(ref_clean) > 1 else float(np.std(ref_clean))
    
    if std_ref < epsilon:
        # Fallback to combined standard deviation if reference has zero variance
        combined = np.concatenate([ref_clean, det_clean])
        std_comb = float(np.std(combined, ddof=1)) if len(combined) > 1 else float(np.std(combined))
        scale = std_comb if std_comb >= epsilon else 1.0
    else:
        scale = std_ref
        
    norm_w1 = w1 / (scale + epsilon)
    return float(max(0.0, norm_w1))


def calculate_ks_test(
    ref: Union[np.ndarray, pd.Series, list],
    det: Union[np.ndarray, pd.Series, list],
) -> Tuple[float, float]:
    """
    Two-sample Kolmogorov-Smirnov test for continuous distributions.
    Returns (ks_statistic, p_value).
    """
    ref_arr = np.asarray(ref, dtype=float)
    det_arr = np.asarray(det, dtype=float)
    
    ref_clean = ref_arr[np.isfinite(ref_arr)]
    det_clean = det_arr[np.isfinite(det_arr)]
    
    if len(ref_clean) == 0 or len(det_clean) == 0:
        return 0.0, 1.0
        
    res = stats.ks_2samp(ref_clean, det_clean)
    return float(res.statistic), float(res.pvalue)


def calculate_benjamini_hochberg_fdr(
    p_values: Dict[str, float],
    alpha: float = 0.05,
) -> Dict[str, bool]:
    """
    Applies Benjamini-Hochberg False Discovery Rate (FDR) control on a dictionary of p-values.
    Returns a dict mapping feature_name -> is_rejected (True if significant drift detected).
    """
    if not p_values:
        return {}
        
    sorted_items = sorted(p_values.items(), key=lambda x: x[1])
    m = len(sorted_items)
    
    # Find largest k such that p_(k) <= (k / m) * alpha
    max_k = -1
    for k, (feat, p_val) in enumerate(sorted_items, 1):
        critical_val = (k / m) * alpha
        if p_val <= critical_val:
            max_k = k
            
    rejected_dict = {}
    for k, (feat, _) in enumerate(sorted_items, 1):
        rejected_dict[feat] = (k <= max_k)
        
    return rejected_dict


def calculate_categorical_psi(
    ref: Union[pd.Series, np.ndarray, list],
    det: Union[pd.Series, np.ndarray, list],
    epsilon: float = 1e-4,
) -> float:
    """
    Calculates Population Stability Index across discrete/categorical classes with Laplace smoothing.
    """
    ref_s = pd.Series(ref).dropna().astype(str)
    det_s = pd.Series(det).dropna().astype(str)
    
    if len(ref_s) == 0 or len(det_s) == 0:
        return 0.0
        
    all_cats = list(set(ref_s.unique()).union(set(det_s.unique())))
    k = len(all_cats)
    if k == 0:
        return 0.0
        
    ref_counts = ref_s.value_counts().reindex(all_cats, fill_value=0)
    det_counts = det_s.value_counts().reindex(all_cats, fill_value=0)
    
    p = (ref_counts.values + epsilon) / (len(ref_s) + k * epsilon)
    q = (det_counts.values + epsilon) / (len(det_s) + k * epsilon)
    
    psi_val = np.sum((q - p) * np.log(q / p))
    return float(max(0.0, psi_val))


def calculate_categorical_jsd(
    ref: Union[pd.Series, np.ndarray, list],
    det: Union[pd.Series, np.ndarray, list],
    epsilon: float = 1e-4,
) -> Tuple[float, float]:
    """
    Calculates Jensen-Shannon Divergence (JSD) and JS Distance for categorical distributions.
    
    Formula:
        JSD(P || Q) = 0.5 * KL(P || M) + 0.5 * KL(Q || M) where M = 0.5 * (P + Q)
        JSDist = sqrt(JSD / ln(2)) in [0, 1]
    """
    ref_s = pd.Series(ref).dropna().astype(str)
    det_s = pd.Series(det).dropna().astype(str)
    
    if len(ref_s) == 0 or len(det_s) == 0:
        return 0.0, 0.0
        
    all_cats = list(set(ref_s.unique()).union(set(det_s.unique())))
    k = len(all_cats)
    if k == 0:
        return 0.0, 0.0
        
    ref_counts = ref_s.value_counts().reindex(all_cats, fill_value=0)
    det_counts = det_s.value_counts().reindex(all_cats, fill_value=0)
    
    p = (ref_counts.values + epsilon) / (len(ref_s) + k * epsilon)
    q = (det_counts.values + epsilon) / (len(det_s) + k * epsilon)
    m = 0.5 * (p + q)
    
    kl_pm = np.sum(p * np.log(p / m))
    kl_qm = np.sum(q * np.log(q / m))
    jsd = 0.5 * kl_pm + 0.5 * kl_qm
    jsd = max(0.0, float(jsd))
    
    # JS distance in [0, 1]
    js_dist = np.sqrt(jsd / np.log(2.0))
    js_dist = min(1.0, max(0.0, float(js_dist)))
    
    return jsd, js_dist


def calculate_chi_square_test(
    ref: Union[pd.Series, np.ndarray, list],
    det: Union[pd.Series, np.ndarray, list],
    min_freq: int = 5,
) -> Tuple[float, float]:
    """
    Performs Chi-Squared Goodness-of-Fit test with rare-category pooling (Cochran's rule).
    Expected counts E_k < min_freq are pooled into an '__OTHER__' bin.
    Returns (chi2_stat, p_value).
    """
    ref_s = pd.Series(ref).dropna().astype(str)
    det_s = pd.Series(det).dropna().astype(str)
    
    if len(ref_s) == 0 or len(det_s) == 0:
        return 0.0, 1.0
        
    all_cats = list(set(ref_s.unique()).union(set(det_s.unique())))
    n_ref = len(ref_s)
    n_det = len(det_s)
    
    ref_counts = ref_s.value_counts().reindex(all_cats, fill_value=0)
    det_counts = det_s.value_counts().reindex(all_cats, fill_value=0)
    
    ref_props = ref_counts / n_ref
    expected_det = ref_props * n_det
    
    # Pool rare categories where expected count < min_freq
    major_mask = expected_det >= min_freq
    
    if major_mask.sum() == 0:
        # All categories are rare
        return 0.0, 1.0
        
    obs_major = det_counts[major_mask].values
    exp_major = expected_det[major_mask].values
    
    obs_other = det_counts[~major_mask].sum()
    exp_other = expected_det[~major_mask].sum()
    
    if exp_other > 0:
        obs_final = np.append(obs_major, obs_other)
        exp_final = np.append(exp_major, exp_other)
    else:
        obs_final = obs_major
        exp_final = exp_major
        
    # Degrees of freedom: K_pooled - 1
    dof = len(obs_final) - 1
    if dof < 1:
        return 0.0, 1.0
        
    # Scale expected so sum(exp) == sum(obs) to avoid float precision mismatch
    exp_final = exp_final * (obs_final.sum() / exp_final.sum())
    
    chi2_stat = np.sum((obs_final - exp_final) ** 2 / (exp_final + 1e-12))
    p_val = float(stats.chi2.sf(chi2_stat, df=dof))
    
    return float(max(0.0, chi2_stat)), p_val


def calculate_prediction_drift(
    ref_prob: np.ndarray,
    det_prob: np.ndarray,
    ref_reg: Optional[np.ndarray] = None,
    det_reg: Optional[np.ndarray] = None,
    ref_quantiles: Optional[Dict[str, np.ndarray]] = None,
    det_quantiles: Optional[Dict[str, np.ndarray]] = None,
    prob_psi_yellow: float = 0.10,
    prob_psi_red: float = 0.20,
) -> PredictionDriftResult:
    """
    Evaluates Prediction Drift across model outputs:
    - Classifier predicted probability PSI and Wasserstein distance.
    - Regression point prediction PSI and Wasserstein distance.
    - Quantile prediction shifts (q05, q50, q95).
    """
    ref_p = np.asarray(ref_prob, dtype=float)
    det_p = np.asarray(det_prob, dtype=float)
    
    p_psi = calculate_psi(ref_p, det_p, num_bins=10)
    p_w1 = float(stats.wasserstein_distance(ref_p, det_p))
    p_mean_delta = float(np.mean(det_p) - np.mean(ref_p))
    
    if p_psi >= prob_psi_red or p_w1 >= 0.10:
        prob_status = DriftStatus.RED
    elif p_psi >= prob_psi_yellow or p_w1 >= 0.05:
        prob_status = DriftStatus.YELLOW
    else:
        prob_status = DriftStatus.GREEN
        
    reg_psi = None
    reg_w1 = None
    reg_mean_delta = None
    reg_status = None
    
    if ref_reg is not None and det_reg is not None:
        ref_r = np.asarray(ref_reg, dtype=float)
        det_r = np.asarray(det_reg, dtype=float)
        reg_psi = calculate_psi(ref_r, det_r, num_bins=10)
        reg_w1 = calculate_normalized_wasserstein(ref_r, det_r)
        reg_mean_delta = float(np.mean(det_r) - np.mean(ref_r))
        
        if reg_psi >= 0.25 or reg_w1 >= 0.30:
            reg_status = DriftStatus.RED
        elif reg_psi >= 0.10 or reg_w1 >= 0.15:
            reg_status = DriftStatus.YELLOW
        else:
            reg_status = DriftStatus.GREEN
            
    q05_shift = None
    q50_shift = None
    q95_shift = None
    
    if ref_quantiles and det_quantiles:
        if 'q05' in ref_quantiles and 'q05' in det_quantiles:
            q05_shift = float(np.mean(det_quantiles['q05']) - np.mean(ref_quantiles['q05']))
        if 'q50' in ref_quantiles and 'q50' in det_quantiles:
            q50_shift = float(np.mean(det_quantiles['q50']) - np.mean(ref_quantiles['q50']))
        if 'q95' in ref_quantiles and 'q95' in det_quantiles:
            q95_shift = float(np.mean(det_quantiles['q95']) - np.mean(ref_quantiles['q95']))
            
    overall_status = prob_status
    if reg_status == DriftStatus.RED:
        overall_status = DriftStatus.RED
    elif reg_status == DriftStatus.YELLOW and overall_status != DriftStatus.RED:
        overall_status = DriftStatus.YELLOW
        
    return PredictionDriftResult(
        prob_psi=p_psi,
        prob_wasserstein=p_w1,
        prob_mean_delta=p_mean_delta,
        prob_status=prob_status,
        regression_psi=reg_psi,
        regression_wasserstein=reg_w1,
        regression_mean_delta=reg_mean_delta,
        regression_status=reg_status,
        quantile_shift_q05=q05_shift,
        quantile_shift_q50=q50_shift,
        quantile_shift_q95=q95_shift,
        status=overall_status,
    )


def calculate_target_drift(
    ref_y: Union[np.ndarray, pd.Series],
    det_y: Union[np.ndarray, pd.Series],
    ref_days: Optional[Union[np.ndarray, pd.Series]] = None,
    det_days: Optional[Union[np.ndarray, pd.Series]] = None,
    prev_yellow: float = 0.03,
    prev_red: float = 0.07,
) -> TargetDriftResult:
    """
    Evaluates Target / Concept / Prevalence Drift:
    - Binary Late Delivery Prevalence shift: Delta p, Two-proportion z-test, Binary PSI.
    - Continuous Delay Days shift: Wasserstein distance, Normalized Wasserstein, PSI.
    - Severe delay proportion shift: P(Delay_Days > 14).
    """
    ref_arr = np.asarray(ref_y, dtype=float)
    det_arr = np.asarray(det_y, dtype=float)
    
    n_ref = len(ref_arr)
    n_det = len(det_arr)
    
    ref_prev = float(np.mean(ref_arr)) if n_ref > 0 else 0.0
    det_prev = float(np.mean(det_arr)) if n_det > 0 else 0.0
    delta_prev = det_prev - ref_prev
    
    # Two-proportion z-test
    p_pooled = (np.sum(ref_arr) + np.sum(det_arr)) / (n_ref + n_det + 1e-12)
    se = np.sqrt(p_pooled * (1.0 - p_pooled) * (1.0 / (n_ref + 1e-12) + 1.0 / (n_det + 1e-12)))
    
    if se > 1e-9:
        z_stat = (det_prev - ref_prev) / se
        z_pval = float(2.0 * stats.norm.sf(abs(z_stat)))
    else:
        z_stat = 0.0
        z_pval = 1.0
        
    targ_psi = calculate_categorical_psi(ref_arr, det_arr)
    
    days_w1 = None
    days_norm_w1 = None
    days_psi = None
    ext_ref = None
    ext_det = None
    ext_delta = None
    
    if ref_days is not None and det_days is not None:
        ref_d = np.asarray(ref_days, dtype=float)
        det_d = np.asarray(det_days, dtype=float)
        days_w1 = float(stats.wasserstein_distance(ref_d, det_d))
        days_norm_w1 = calculate_normalized_wasserstein(ref_d, det_d)
        days_psi = calculate_psi(ref_d, det_d, num_bins=10)
        
        ext_ref = float(np.mean(ref_d > 14.0))
        ext_det = float(np.mean(det_d > 14.0))
        ext_delta = ext_det - ext_ref
        
    # Status evaluation
    abs_delta_prev = abs(delta_prev)
    if (abs_delta_prev >= prev_red and z_pval < 0.01) or (days_norm_w1 is not None and days_norm_w1 >= 0.30):
        status = DriftStatus.RED
    elif (abs_delta_prev >= prev_yellow and z_pval < 0.05) or (days_norm_w1 is not None and days_norm_w1 >= 0.15):
        status = DriftStatus.YELLOW
    else:
        status = DriftStatus.GREEN
        
    return TargetDriftResult(
        ref_prevalence=ref_prev,
        det_prevalence=det_prev,
        delta_prevalence=delta_prev,
        z_stat=float(z_stat),
        z_pvalue=float(z_pval),
        target_psi=targ_psi,
        delay_days_wasserstein=days_w1,
        delay_days_normalized_wasserstein=days_norm_w1,
        delay_days_psi=days_psi,
        extreme_delay_ref_prop=ext_ref,
        extreme_delay_det_prop=ext_det,
        delta_extreme_delay_prop=ext_delta,
        status=status,
    )


def calculate_uncertainty_drift(
    q_low_calib: np.ndarray,
    q_high_calib: np.ndarray,
    y_calib: np.ndarray,
    q_low_det: np.ndarray,
    q_high_det: np.ndarray,
    y_det: np.ndarray,
    alpha: float = 0.10,
    q_adjustment: Optional[float] = None,
    cov_err_yellow: float = 0.04,
    cov_err_red: float = 0.08,
) -> UncertaintyDriftResult:
    """
    Evaluates Uncertainty Drift in Conformalized Quantile Regression (CQR):
    - Nonconformity scores distribution shift: W_1(S_calib, S_det), delta mean, KS test.
    - Empirical coverage and coverage error: (1 - alpha) - Cov_det.
    - Exact one-sided binomial test for undercoverage: H0: p >= 1 - alpha vs H1: p < 1 - alpha.
    - Prediction interval width distribution shift: W_1(W_calib, W_det), median delta, width ratio.
    """
    # 1. Nonconformity scores
    s_calib = np.maximum(q_low_calib - y_calib, y_calib - q_high_calib)
    s_det = np.maximum(q_low_det - y_det, y_det - q_high_det)
    
    n_calib = len(s_calib)
    n_det = len(s_det)
    
    # 2. Conformal adjustment factor Q
    if q_adjustment is None:
        q_level = min(1.0, (1.0 - alpha) * (1.0 + 1.0 / n_calib))
        q_adj = float(np.quantile(s_calib, q_level, method='higher'))
    else:
        q_adj = float(q_adjustment)
        
    # 3. Empirical coverage on detection window
    y_lower_det = q_low_det - q_adj
    y_upper_det = q_high_det + q_adj
    covered = (y_det >= y_lower_det) & (y_det <= y_upper_det)
    k_covered = int(np.sum(covered))
    
    nominal_cov = 1.0 - alpha
    empirical_cov = float(k_covered / (n_det + 1e-12))
    cov_error = float(nominal_cov - empirical_cov)
    
    # 4. Exact one-sided Binomial test for undercoverage (P(K <= k | p = nominal_cov))
    # scipy.stats.binom.cdf(k, n, p) calculates P(X <= k)
    binom_pval = float(stats.binom.cdf(k_covered, n_det, nominal_cov))
    
    # 5. Nonconformity shift metrics
    s_w1 = float(stats.wasserstein_distance(s_calib, s_det))
    s_mean_delta = float(np.mean(s_det) - np.mean(s_calib))
    ks_res = stats.ks_2samp(s_calib, s_det)
    s_ks_stat = float(ks_res.statistic)
    s_ks_pval = float(ks_res.pvalue)
    
    # 6. Conformal interval width metrics
    w_calib = (q_high_calib - q_low_calib) + 2.0 * q_adj
    w_det = (q_high_det - q_low_det) + 2.0 * q_adj
    
    ref_mean_w = float(np.mean(w_calib))
    det_mean_w = float(np.mean(w_det))
    w_w1 = float(stats.wasserstein_distance(w_calib, w_det))
    w_med_delta = float(np.median(w_det) - np.median(w_calib))
    w_ratio = float(det_mean_w / (ref_mean_w + 1e-12))
    
    # 7. Uncertainty status
    if (cov_error >= cov_err_red and binom_pval < 0.01) or (s_w1 >= 3.0):
        status = DriftStatus.RED
    elif (cov_error >= cov_err_yellow and binom_pval < 0.05) or (s_w1 >= 1.5) or (w_ratio >= 1.25):
        status = DriftStatus.YELLOW
    else:
        status = DriftStatus.GREEN
        
    return UncertaintyDriftResult(
        nominal_coverage=nominal_cov,
        empirical_coverage=empirical_cov,
        coverage_error=cov_error,
        binomial_pvalue=binom_pval,
        nonconformity_wasserstein=s_w1,
        nonconformity_mean_delta=s_mean_delta,
        nonconformity_ks_stat=s_ks_stat,
        nonconformity_ks_pvalue=s_ks_pval,
        ref_mean_interval_width=ref_mean_w,
        det_mean_interval_width=det_mean_w,
        interval_width_wasserstein=w_w1,
        interval_width_median_delta=w_med_delta,
        interval_width_ratio=w_ratio,
        status=status,
    )
