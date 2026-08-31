# Temporal Evaluation, Calibrated Risk, and Conformal Delay-Severity Prediction in Pharmaceutical Logistics

**Authors**: `[AUTHOR INFORMATION REQUIRED: Authors]`  
**Affiliation**: `[AUTHOR INFORMATION REQUIRED: Affiliations]`  
**Target Venue**: *Transportation Research Part E: Logistics and Transportation Review*  
**Date**: August 31, 2026  

---

## Abstract

Delivery delays in global health logistics networks disrupt clinical treatments, deplete regional buffer stocks, and jeopardize public health outcomes. Machine learning models for shipment delay prediction are frequently evaluated using standard random cross-validation, an approach that can obscure severe performance degradation under real-world temporal distribution shifts. In this study, we propose and empirically evaluate an integrated decision-intelligence framework that addresses four core requirements of freight risk management: leakage-safe temporal evaluation, calibrated delay-risk estimation, conditional delay-severity prediction with empirical conformal intervals, and capacity-constrained operational triage. 

Using historical shipment data from the USAID Supply Chain Management System ($N = 10,324$ shipments across 42 recipient countries), we evaluate candidate predictive models using a 5-fold expanding-origin temporal validation design with 90-day post-delivery embargoes. Our primary empirical findings demonstrate that standard random cross-validation substantially overestimates precision-recall area under the curve (PR-AUC) relative to temporal evaluation across all tested model families, with relative overestimation ranging from $+26.2\%$ for regularized logistic regression to $+99.7\%$ for LightGBM ($+47.6\%$ for Random Forest, $+77.3\%$ for CatBoost). Post-hoc Platt scaling improved probability calibration (reducing Expected Calibration Error from $0.0850$ to $0.0807$ on CatBoost and $0.2051$ to $0.0866$ on Random Forest) while strictly preserving continuous risk rankings. 

For conditional delay severity on delayed shipments, a simple historical conditional median baseline achieves superior mean absolute error ($15.62 \pm 6.43$ days) compared to gradient-boosted quantile regressors ($16.96 \pm 4.66$ days), whereas quantile regressors enable Split Conformalized Quantile Regression (CQR) to estimate prediction intervals across $80\%$, $90\%$, and $95\%$ nominal coverage levels. On a secondary locked replication benchmark ($N = 1,013$ shipments, $61$ delays), $90\%$ CQR achieves $91.80\%$ empirical coverage ($56/61$, exact 95% Clopper-Pearson CI: $[81.90\%, 97.28\%]$) with a mean interval width of $46.27$ days. Simulated operational triage scenarios indicate that uncertainty-aware prioritization increases high-severity delay capture at tight inspection budgets ($K = 1\%$ and $K = 5\%$) compared to naive risk-only ranking. These findings highlight the necessity of temporal evaluation discipline, probability calibration, and decoupled severity estimation in mission-critical logistics decision support.

**Keywords**: Supply chain analytics; Delivery delay prediction; Temporal distribution shift; Probability calibration; Conformal prediction; Operational triage.

---

## 1. Introduction

Global health logistics networks responsible for distributing essential medicines, antiretroviral therapies, and diagnostic reagents operate in complex, volatile environments (Yadav, 2015; Vledder et al., 2019). In these supply chains, delivery delays can lead to stockouts, treatment interruptions, disease transmission resurgence, and emergency procurement expenditures. To anticipate and mitigate shipment disruptions, logistics control towers increasingly rely on predictive machine learning models to forecast delay probabilities and guide proactive interventions (Baryannis et al., 2019).

However, the deployment of supervised learning models in real-world freight and logistics management faces several fundamental methodological and operational hurdles:

1. **Evaluation Leakage and Temporal Distribution Shift**: In observational logistics datasets, shipments initiated at time $t$ often resolve their delivery outcomes at time $t + \Delta t$. When standard random $k$-fold cross-validation is applied, observations from the future are routinely included in training sets while past observations are placed in test sets (Kapoor & Narayanan, 2023; Roberts et al., 2017). Furthermore, changing vendor networks, evolving customs procedures, and macroeconomic shocks induce non-stationary temporal distribution shifts that random splits fail to capture.
2. **Probability Miscalibration in Class-Imbalanced Regimes**: Delay occurrence in supply chains is typically a minority event ($5\%$ to $15\%$ prevalence). While modern non-linear models such as gradient-boosted decision trees and random forests can achieve reasonable discriminative separation, their raw output scores are frequently miscalibrated, producing uncalibrated probability estimates that distort operational thresholding (Platt, 1999; Niculescu-Mizil & Caruana, 2005; Guo et al., 2017).
3. **Conflation of Delay Probability and Delay Severity**: A binary prediction indicating whether a shipment will be delayed provides no information regarding the duration of the disruption. A delay of three days often requires minimal buffer stock adjustments, whereas a delay of sixty days may necessitate emergency airfreight rerouting. Accurately modeling conditional delay duration given that a delay occurs is essential for informed intervention (Koenker & Bassett, 1978; Kourentzes et al., 2020).
4. **Predictive Uncertainty in Severity Estimates**: Point predictions of delay severity fail to convey predictive uncertainty. Decision-makers require statistically grounded prediction intervals to evaluate worst-case delivery horizons and maintain defensible service-level guarantees (Romano et al., 2019; Angelopoulos & Bates, 2023). Under exchangeability, conformal methods provide rigorous finite-sample coverage guarantees; evaluating their out-of-time empirical coverage under temporal distribution shift is vital for practical deployment (Barber et al., 2023; Gibbs & Candès, 2021).
5. **Operational Capacity Constraints**: Logistics management teams operate under finite inspection and expediting bandwidths. An operational decision support system must effectively prioritize a small subset (e.g., top $1\%$ to $10\%$) of high-risk, high-severity shipments rather than issuing unranked binary alerts (Bastani et al., 2021; Bertsimas & Kallus, 2020).

To address these challenges systematically, we present an integrated, four-stage decision-intelligence framework designed for mission-critical logistics environments. The core methodological architecture of the framework is illustrated in Figure 1.

```
+---------------------------------------------------------------------------------------------------+
|                                 ORCA METHODOLOGICAL FRAMEWORK                                     |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [Stage 1: Leakage-Safe Feature Extraction]                                                       |
|   - Pre-outcome shipment features (origins, destinations, modes, item categories, scheduled lag)    |
|   - Expanding temporal split protocol with 90-day post-delivery embargoes                          |
|                                                                                                   |
|                                         v                                                         |
|  [Stage 2: Calibrated Delay-Risk Estimation]                                                      |
|   - Binary classification: CatBoost (Primary Model) & Random Forest (Sensitivity Comparator)      |
|   - Post-hoc Platt scaling / Sigmoid calibration on temporal buffers                              |
|   - Out-of-Fold (OOF) development threshold optimization (tau* = 0.1000 / 0.1050)                 |
|                                                                                                   |
|                                         v                                                         |
|  [Stage 3: Conditional Severity & Conformal Prediction Intervals]                                 |
|   - Decoupled severity modeling on delayed shipments: Conditional Median baseline (Point MAE)     |
|   - Multi-quantile LightGBM regressors (q0.025 to q0.975)                                         |
|   - Split Conformalized Quantile Regression (CQR) with empirical out-of-time validation           |
|                                                                                                   |
|                                         v                                                         |
|  [Stage 4: Capacity-Constrained Operational Prioritization [SIMULATED SCENARIO]]                  |
|   - Triaging under constrained inspection budgets (K in {1%, 5%, 10%, 20%})                       |
|   - Uncertainty-aware prioritization scoring: Priority = P_calibrated * Y_q95                     |
+---------------------------------------------------------------------------------------------------+
```
*Figure 1: Conceptual architecture of the decision-intelligence framework, illustrating the four-stage pipeline connecting leakage-safe feature ingestion to calibrated risk estimation, conformal uncertainty quantification, and operational triage.*

### Core Contributions
This paper makes five primary contributions:
1. **Empirical Demonstration of Random-Split Optimism (RQ1)**: We quantify the extent to which standard random cross-validation overestimates delay prediction metrics relative to expanding temporal evaluation across five major machine learning model families in an international pharmaceutical distribution network.
2. **Evaluation of Post-Hoc Probability Calibration under Temporal Shift (RQ2)**: We benchmark raw, Platt-calibrated, and isotonic probability estimation on temporal development folds, characterizing the operational trade-off between calibration error reduction and continuous rank preservation.
3. **Decoupled Conditional Severity Estimation (RQ3)**: We formalize the separation of delay occurrence and delay magnitude, showing that while gradient-boosted quantile models capture asymmetric spread, a simple conditional median baseline remains competitive for point estimation.
4. **Empirical Evaluation of Conformal Prediction Intervals (RQ4)**: We empirically evaluate the coverage and sharpness of Split Conformalized Quantile Regression (CQR) intervals across temporally later validation cohorts and a secondary locked registry benchmark across $80\%$, $90\%$, and $95\%$ nominal confidence levels.
5. **Capacity-Constrained Decision Support Simulation (RQ5)**: We evaluate operational triage policies across constrained inspection capacities ($K \in \{1\%, 5\%, 10\%, 20\%\}$), illustrating the trade-offs between naive risk ranking and uncertainty-aware prioritization.

---

## 2. Related Work

### 2.1 Supply-Chain Delay Prediction
Predicting transportation lead times and shipment delays has received extensive attention in operations research and logistics management (Baryannis et al., 2019). Early approaches relied on historical time-series averaging and discrete event simulation. Recent literature has embraced supervised machine learning algorithms—including Random Forests (Breiman, 2001), Extreme Gradient Boosting (Chen & Guestrin, 2016), LightGBM (Ke et al., 2017), and CatBoost (Prokhorenkova et al., 2018)—applied to freight tracking, port dwell time, and supplier delivery risk (Baryannis et al., 2019; Chawla et al., 2002). However, many existing studies evaluate model performance using random train-test splits or standard $k$-fold cross-validation without temporal ordering or post-outcome embargoes, creating vulnerability to lookahead leakage.

### 2.2 Temporal Validation and Leakage in Machine Learning
Data leakage occurs when training data inadvertently incorporate information from outside the target deployment distribution (Kapoor & Narayanan, 2023). In time-dependent operational systems, standard random cross-validation permits past predictions to be informed by future training instances, leading to inflated performance estimates that fail under production deployment (Roberts et al., 2017; Bergmeir & Benítez, 2012). In financial forecasting, López de Prado (2018) formalized purged and embargoed cross-validation to eliminate leakage from overlapping asset holding periods. In this work, we translate and formalize post-delivery temporal embargoes to international supply chain delay prediction, accounting for the unobservable delivery lag of in-transit shipments.

### 2.3 Probability Calibration in Operational Decision Support
In high-stakes decision environments, predicted scores must reflect true posterior event probabilities rather than arbitrary discrimination rankings (Platt, 1999; Niculescu-Mizil & Caruana, 2005; Zadrozny & Elkan, 2002). Modern tree ensembles often produce skewed probability distributions due to asymmetric leaf purity criteria and class imbalance (Guo et al., 2017). Post-hoc calibration methods—principally parametric Platt scaling (Platt, 1999) and non-parametric Isotonic regression (Zadrozny & Elkan, 2002)—have been studied extensively in clinical risk prediction. Brier score decompositions (Brier, 1950) and Expected Calibration Error (Guo et al., 2017) provide quantitative metrics to evaluate probabilistic reliability. In this study, we examine how calibration methods behave under temporal distribution shift in supply chains and analyze their impact on continuous precision-recall metrics.

### 2.4 Conditional Severity and Quantile Modeling
Delay durations exhibit severe right-skewness, rendering standard conditional mean regression vulnerable to extreme outliers (Koenker & Bassett, 1978). Quantile regression estimates specific conditional percentiles by minimizing the asymmetric pinball loss (Koenker & Bassett, 1978; Meinshausen, 2006). In inventory control, quantile models have been applied to safety stock determination and intermittent lead-time buffering (Kourentzes et al., 2020; Simchi-Levi et al., 2014). We decouple delay occurrence from delay magnitude, examining whether non-linear quantile regressors outperform simple empirical medians for point estimation while providing the foundation for prediction intervals.

### 2.5 Conformal Uncertainty and Distribution Shift
Conformal prediction provides a general, distribution-free framework for constructing predictive sets or intervals with finite-sample coverage guarantees under the assumption of data exchangeability (Vovk et al., 2005; Angelopoulos & Bates, 2023). Romano, Patterson, and Candès (2019) introduced Split Conformalized Quantile Regression (CQR), combining the adaptive spread of quantile regression with distribution-free conformal calibration. Recent theoretical advances have explored conformal inference beyond exchangeability and under covariate shift (Tibshirani et al., 2019; Barber et al., 2023; Gibbs & Candès, 2021). In global health supply chains, where temporal regime shifts occur naturally, evaluating how CQR performs out-of-time provides practical insights for decision-makers.

### 2.6 Capacity-Constrained Operational Decision Support
Logistics control towers manage thousands of active shipments concurrently but operate under strict labor and expediting capacity constraints (Bastani et al., 2021; Bertsimas & Kallus, 2020). Rather than evaluating models solely on aggregate statistical metrics, prescriptive analytics focuses on optimizing operational triage queues under finite inspection bandwidths (Bastani et al., 2021; Simchi-Levi et al., 2014).

### 2.7 Literature Gap Statement
To our knowledge, while individual components (tree boosting, probability calibration, quantile regression, and conformal prediction) have been studied independently, we did not identify prior work in the reviewed literature that jointly evaluates: (1) leakage-safe temporal validation with post-delivery embargoes, (2) post-hoc probability calibration under class imbalance, (3) decoupled conformal severity estimation, and (4) uncertainty-aware operational prioritization under constrained inspection capacities.

---

## 3. Data and Prediction-Time Problem Formulation

### 3.1 Dataset Description and Provenance
Our empirical analysis uses the publicly available **USAID SCMS Delivery History Dataset** (USAID SCMS Project, 2015; USAID, 2016). The dataset records international procurement and logistics transactions managed under the Supply Chain Management System (SCMS) program between 2007 and 2015, delivering essential health commodities across 42 recipient countries in Sub-Saharan Africa, the Caribbean, Southeast Asia, and Eastern Europe.

The canonical dataset contains $N = 10,324$ completed shipment records. A total of $1,186$ shipments experienced delivery delays relative to their scheduled delivery dates, representing an overall delay prevalence of $11.488\%$. Product categories comprise:
- Antiretroviral pharmaceuticals (ARVs: Adult and Pediatric formulations, $N = 6,778$)
- Rapid diagnostic test kits (HIV and Malaria RDTs, $N = 1,496$)
- Antimalarial treatments and ACTs ($N = 45$)
- Ancillary laboratory and medical supplies ($N = 2,005$)

### 3.2 Prediction-Time Feature Space ($\mathcal{X}$)
To prevent post-outcome leakage, we enforce a strict prediction-time feature cutoff. For any given shipment $i$, the prediction point $T_{\text{pred}, i}$ is defined as the date on which the purchase order or shipment schedule is finalized:
$$T_{\text{pred}, i} = \text{Scheduled Delivery Date}_i - \text{Scheduled Lead Time}_i$$

All features $\mathbf{x}_i \in \mathcal{X}$ are restricted to information known on or before $T_{\text{pred}, i}$. The feature space comprises 39 operational variables (detailed in Supplementary Table S1): 13 categorical and 26 continuous variables. All post-delivery operational variables—including `Delivered to Client Date`, `Delivery Recorded Date`, and actual delivery delay outcomes—are strictly excluded from $\mathcal{X}$.

### 3.3 Target Definitions
For each shipment $i$, we observe the true delivery timestamp $T_{\text{delivered}, i}$ and scheduled delivery timestamp $T_{\text{scheduled}, i}$. The target variables are defined as:
1. **Binary Delay Flag ($Y_i \in \{0, 1\}$)**:
   $$Y_i = \mathbb{I}\left(T_{\text{delivered}, i} > T_{\text{scheduled}, i}\right)$$
   where $\mathbb{I}(\cdot)$ is the indicator function. Shipments arriving on or before the scheduled date are non-delayed ($Y_i = 0$); shipments arriving after the scheduled date are delayed ($Y_i = 1$).
2. **Continuous Delay Severity ($S_i \in \mathbb{R}_{\ge 0}$)**:
   $$S_i = \max\left(0, \frac{T_{\text{delivered}, i} - T_{\text{scheduled}, i}}{1\text{ day}}\right)$$
   representing the delay magnitude in calendar days. Severity is modeled conditionally on the delayed sub-cohort ($\{i : Y_i = 1\}$).

---

## 4. Temporal Evaluation and Leakage-Control Protocol

### 4.1 Expanding-Origin Cross-Validation Design
Evaluating delay prediction models using standard random shuffling introduces lookahead bias because shipment transit durations overlap in time. To simulate real-world deployment faithfully, we construct an expanding-origin temporal evaluation structure comprising five chronological folds spanning the development window ($N = 7,306$ shipments).

```
Timeline Progression (2006 - 2015):
[====== Fold 0: Train ======][--Embargo--][== Val 0 ==]
[========= Fold 1: Train ========][--Embargo--][== Val 1 ==]
[============ Fold 2: Train ===========][--Embargo--][== Val 2 ==]
[=============== Fold 3: Train ==============][--Embargo--][== Val 3 ==]
[================== Fold 4: Train =================][--Embargo--][== Val 4 ==]
                                                    [--Calib Buffer--][== Locked Registry Benchmark ==]
```
*Figure 2: Chronological structure of expanding-origin temporal cross-validation with 90-day post-delivery embargoes, 6-month calibration buffer, and the secondary locked registry benchmark.*

### 4.2 The 90-Day Post-Delivery Embargo
When a model is trained at time $T_{\text{cut}}$, shipments that departed prior to $T_{\text{cut}}$ but have scheduled deliveries in the future may still be in transit. If an in-transit shipment experiences a long delay, its actual outcome is not resolved until $T_{\text{cut}} + \Delta t$. Including shipments whose delivery outcomes would not have been known by the validation start date introduces label leakage (López de Prado, 2018).

To eliminate this vulnerability, we institute a strict **90-day temporal embargo** between the training cutoff and the validation window. Any shipment scheduled for delivery within the 90-day buffer is purged from the training set, ensuring that all training labels represent fully resolved outcomes at the point of validation deployment.

### 4.3 Summary of Chronological Cohorts
The resulting temporal dataset partitions are detailed in Table 1.

**Table 1: Chronological dataset partition summary across expanding development folds and the secondary locked benchmark.**

| Split Identifier | Temporal Window ($T_{\text{pred}}$ Range) | Total Rows ($N$) | Delayed Rows ($N_{\text{pos}}$) | Delay Prevalence (%) | Scientific Role |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Fold 0: Train** | $T_{\text{pred}} \le \text{2011-12-08}$ | 3,747 | 530 | 14.14% | Development Training Cohort |
| **Fold 0: Validation** | $\text{2012-03-07} \le T_{\text{pred}} \le \text{2012-09-03}$ | 598 | 39 | 6.52% | Development Temporal Fold 0 |
| **Fold 1: Train** | $T_{\text{pred}} \le \text{2012-06-05}$ | 4,302 | 564 | 13.11% | Development Training Cohort |
| **Fold 1: Validation** | $\text{2012-09-03} \le T_{\text{pred}} \le \text{2013-03-02}$ | 618 | 99 | 16.02% | Development Temporal Fold 1 |
| **Fold 2: Train** | $T_{\text{pred}} \le \text{2012-12-02}$ | 4,942 | 643 | 13.01% | Development Training Cohort |
| **Fold 2: Validation** | $\text{2013-03-02} \le T_{\text{pred}} \le \text{2013-08-29}$ | 738 | 195 | 26.42% | Development Temporal Fold 2 |
| **Fold 3: Train** | $T_{\text{pred}} \le \text{2013-05-31}$ | 5,614 | 783 | 13.95% | Development Training Cohort |
| **Fold 3: Validation** | $\text{2013-08-29} \le T_{\text{pred}} \le \text{2014-02-25}$ | 606 | 121 | 19.97% | Development Temporal Fold 3 |
| **Fold 4: Train** | $T_{\text{pred}} \le \text{2013-11-27}$ | 6,312 | 959 | 15.19% | Development Training Cohort |
| **Fold 4: Validation** | $\text{2014-02-25} \le T_{\text{pred}} \le \text{2014-08-24}$ | 717 | 103 | 14.37% | Development Temporal Fold 4 |
| **Calibration Buffer** | $\text{2014-02-25} \le T_{\text{pred}} < \text{2014-08-24}$ | 717 | 103 | 14.37% | Platt & Conformal Calibration Split |
| **Locked Benchmark** | $\text{2014-08-24} \le T_{\text{pred}} \le \text{2015-08-24}$ | 1,013 | 61 | 6.02% | Secondary Replication Benchmark |

*Artifact Source*: `research/outputs/metrics/temporal_fold_manifest.csv`.

---

## 5. Delay-Risk Classification & Model Architectures

### 5.1 Evaluated Classifiers
We benchmark five supervised learning architectures spanning linear, bagged, and boosted paradigms:
1. **Regularized Logistic Regression ($L_2$)**: Baseline linear model trained on standardized numeric variables and one-hot encoded nominals.
2. **Random Forest (RF)**: Ensemble of 300 bagged trees with balanced subsample weighting (`max_depth=8`, `min_samples_leaf=5`) (Breiman, 2001).
3. **XGBoost**: Gradient-boosted decision trees optimizing binary cross-entropy with histogram-based tree building (`n_estimators=300`, `learning_rate=0.05`, `max_depth=6`) (Chen & Guestrin, 2016).
4. **LightGBM**: Leaf-wise gradient boosting with native categorical handling (`n_estimators=300`, `learning_rate=0.05`, `num_leaves=31`) (Ke et al., 2017).
5. **CatBoost**: Ordered boosting with native categorical target encoding (`iterations=300`, `learning_rate=0.05`, `depth=6`, `auto_class_weights='Balanced'`) (Prokhorenkova et al., 2018).

### 5.2 Primary Metric: Precision-Recall Area Under the Curve (PR-AUC)
Under severe class imbalance ($6\%$ to $15\%$ delay prevalence), Receiver Operating Characteristic Area Under the Curve (ROC-AUC) can present an overly optimistic view of performance because the large number of true negatives dominates the false positive rate denominator (Niculescu-Mizil & Caruana, 2005). Consequently, we designate **PR-AUC** (Average Precision) as the primary evaluation metric:
$$\text{PR-AUC} = \sum_{k} (R_k - R_{k-1}) P_k$$
where $P_k$ and $R_k$ denote precision and recall at operating threshold $k$. ROC-AUC and Brier Score are tracked as secondary criteria.

---

## 6. Probability Calibration

### 6.1 Calibration Formulation
Tree ensembles produce score distributions $f(\mathbf{x}) \in \mathbb{R}$ that correlate monotonically with empirical risk but do not represent true class posterior probabilities $P(Y=1 \mid \mathbf{x})$. To map raw scores to calibrated probabilities $\hat{p} \in [0, 1]$, we evaluate two post-hoc calibration methods fit on disjoint temporal calibration splits:
1. **Platt / Sigmoid Scaling**: Fits a scalar logistic transformation:
   $$\hat{p}_{\text{Platt}}(\mathbf{x}) = \frac{1}{1 + \exp\left(-(a f(\mathbf{x}) + b)\right)}$$
   where parameters $a, b \in \mathbb{R}$ are optimized via maximum likelihood on the calibration split (Platt, 1999). Because Platt scaling is a strictly monotonic transformation, it preserves continuous risk rankings and leaves PR-AUC and ROC-AUC unchanged while adjusting the probability scale.
2. **Isotonic Regression**: Fits a piecewise-constant non-decreasing step function:
   $$\hat{p}_{\text{Iso}}(\mathbf{x}) = m(f(\mathbf{x}))$$
   via the pair-adjacent violators algorithm (Zadrozny & Elkan, 2002). While Isotonic regression can achieve lower Expected Calibration Error, its step-function structure introduces discrete ties that can degrade continuous precision-recall metrics.

### 6.2 Expected Calibration Error (ECE)
Calibration quality is evaluated using Expected Calibration Error (ECE) partitioned into $M = 10$ uniform probability bins $B_m$ (Guo et al., 2017):
$$\text{ECE} = \sum_{m=1}^{M} \frac{|B_m|}{N} \left| \text{acc}(B_m) - \text{conf}(B_m) \right|$$
where $\text{conf}(B_m) = \frac{1}{|B_m|} \sum_{i \in B_m} \hat{p}_i$ is the average predicted confidence and $\text{acc}(B_m) = \frac{1}{|B_m|} \sum_{i \in B_m} y_i$ is the empirical delay fraction in bin $B_m$.

---

## 7. Conditional Delay-Severity Modeling

### 7.1 Decoupled Severity Formulation
Delay severity modeling is conducted conditionally on the delayed subset ($\{i : Y_i = 1\}$). Predicting severity unconditionally across all shipments collapses the target distribution at zero ($>85\%$ of observations), biasing continuous regression losses toward zero days.

### 7.2 Point Estimation Baselines
We evaluate two point-prediction models for conditional delay duration $S$:
1. **Conditional Median Baseline**: Predicts the constant historical median delay duration observed in the training cohort:
   $$\hat{s}_{\text{med}} = \text{Median}\left(\{S_j : Y_j = 1, j \in \mathcal{D}_{\text{train}}\}\right)$$
2. **Ridge Regression**: Linear $L_2$-regularized regression fit on pre-outcome features for delayed training instances.

### 7.3 Asymmetric Quantile Loss
To model asymmetric tail delays, we train Gradient-Boosted Quantile Regressors (LightGBM) to estimate conditional quantiles $\hat{q}_\alpha(\mathbf{x})$ by minimizing the pinball loss function (Koenker & Bassett, 1978):
$$\mathcal{L}_\alpha(s, \hat{q}) = \max\left(\alpha (s - \hat{q}), (\alpha - 1)(s - \hat{q})\right)$$
Models are trained for quantile levels $\alpha \in \{0.025, 0.05, 0.10, 0.50, 0.90, 0.95, 0.975\}$.

---

## 8. Conformalized Quantile Regression (CQR)

### 8.1 Split CQR Formulation
Point forecasts of delay duration do not convey predictive uncertainty. We employ Split Conformalized Quantile Regression (CQR) (Romano et al., 2019) to construct prediction intervals $C(\mathbf{x}) = [\hat{s}_{\text{low}}(\mathbf{x}), \hat{s}_{\text{high}}(\mathbf{x})]$. Under the assumption of exchangeability between calibration and test data, CQR guarantees marginal coverage at nominal confidence level $1 - \gamma$:
$$P\left(S \in C(\mathbf{X})\right) \ge 1 - \gamma$$

Because temporal distribution shift can violate exchangeability in practice (Barber et al., 2023; Gibbs & Candès, 2021), we treat coverage in temporally later cohorts as empirical out-of-time validation rather than as an unconditional mathematical guarantee under shift.

The procedure operates as follows:
1. Train lower and upper quantile regressors $\hat{q}_{\gamma/2}(\mathbf{x})$ and $\hat{q}_{1 - \gamma/2}(\mathbf{x})$ on delayed training shipments $\mathcal{D}_{\text{train, del}}$.
2. On a separate delayed temporal calibration buffer $\mathcal{D}_{\text{cal, del}} = \{(\mathbf{x}_i, s_i)\}_{i=1}^{n_{\text{cal}}}$, compute conformity error scores:
   $$E_i = \max\left(\hat{q}_{\gamma/2}(\mathbf{x}_i) - s_i, \; s_i - \hat{q}_{1 - \gamma/2}(\mathbf{x}_i)\right)$$
3. Compute the finite-sample adjusted empirical quantile:
   $$Q = \text{Quantile}\left(\{E_i\}_{i=1}^{n_{\text{cal}}}, \; \min\left(1.0, \; (1 - \gamma)\left(1 + \frac{1}{n_{\text{cal}}}\right)\right), \; \text{method}='higher'\right)$$
4. For a new shipment $\mathbf{x}_{\text{new}}$, the prediction interval is constructed as:
   $$C(\mathbf{x}_{\text{new}}) = \left[\hat{q}_{\gamma/2}(\mathbf{x}_{\text{new}}) - Q, \; \hat{q}_{1 - \gamma/2}(\mathbf{x}_{\text{new}}) + Q\right]$$

We pre-register and evaluate three nominal coverage levels:
- **80% Nominal ($\gamma = 0.20$)**: $q_{\text{low}} = 0.10, q_{\text{high}} = 0.90$.
- **90% Nominal ($\gamma = 0.10$)**: $q_{\text{low}} = 0.05, q_{\text{high}} = 0.95$.
- **95% Nominal ($\gamma = 0.05$)**: $q_{\text{low}} = 0.025, q_{\text{high}} = 0.975$.

---

## 9. Capacity-Constrained Operational Prioritization [SIMULATED SCENARIO]

### 9.1 Operational Triage Problem
Logistics control towers manage thousands of active shipments concurrently but have limited labor and expediting capacity (Bastani et al., 2021). If an operations team can inspect or expedite at most $K\%$ of active shipments (e.g., $K \in \{1\%, 5\%, 10\%, 20\%\}$), shipments must be ranked by an operational priority score $\pi(\mathbf{x})$.

### 9.2 Prioritization Strategies
We compare three ranking strategies:
1. **Strategy 1: Risk Only**: Ranks shipments by calibrated delay probability:
   $$\pi_1(\mathbf{x}) = \hat{p}_{\text{cal}}(\mathbf{x})$$
2. **Strategy 2: Risk $\times$ Expected Severity**: Ranks shipments by expected delay days:
   $$\pi_2(\mathbf{x}) = \hat{p}_{\text{cal}}(\mathbf{x}) \cdot \hat{s}_{0.50}(\mathbf{x})$$
3. **Strategy 3: Uncertainty-Aware Prioritization**: Ranks shipments by risk multiplied by the upper conformal severity bound ($q_{0.95} + Q_{0.90}$):
   $$\pi_3(\mathbf{x}) = \hat{p}_{\text{cal}}(\mathbf{x}) \cdot \hat{s}_{\text{upper}}(\mathbf{x})$$

Performance is evaluated by:
- **Recall@K**: Fraction of all delayed shipments captured in the top $K\%$.
- **High-Severity Recall@K**: Fraction of critical delays ($> 14$ days) captured in the top $K\%$.
- **Delay-Days Capture Ratio**: Cumulative delay days captured divided by total observed delay days.

---

## 10. Primary Empirical Results

### 10.1 Random-Split Optimism vs. Temporal Evaluation (RQ1)
Table 2 presents the benchmark comparing standard 5-fold random cross-validation against 5-fold expanding temporal cross-validation across all model families.

**Table 2: Comparison of standard random cross-validation versus expanding temporal evaluation, demonstrating substantial PR-AUC performance overestimation under random splitting.**

| Classifier Architecture | Temporal Mean PR-AUC | Temporal Mean ROC-AUC | Temporal Mean Brier | Random-Split PR-AUC | Relative PR-AUC Inflation |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Logistic Regression ($L_2$)** | 0.3011 | 0.7132 | 0.2001 | 0.3800 | **+26.2%** |
| **Random Forest** | **0.3238** | 0.7316 | 0.1605 | 0.4780 | **+47.6%** |
| **CatBoost** | **0.3164** | **0.7401** | **0.1417** | 0.5608 | **+77.3%** |
| **XGBoost** | 0.2917 | 0.7128 | 0.1395 | 0.5591 | **+91.6%** |
| **LightGBM** | 0.2992 | 0.7277 | 0.1430 | 0.5975 | **+99.7%** |

*Artifact Source*: `research/outputs/tables/random_vs_temporal.csv`, `research/outputs/figures/temporal_pr_auc.png`.

As detailed in Table 2, random cross-validation overestimates PR-AUC by $+26.2\%$ to $+99.7\%$ relative to temporally ordered evaluation. This performance gap is consistent with temporal dependence, non-stationary feature distributions, and the auto-correlated structure of supply chain transactions.

### 10.2 Probability Calibration Benchmark (RQ2)
Table 3 reports the performance of post-hoc calibration methods evaluated across the expanding temporal development folds.

**Table 3: Comparison of probability calibration methods on expanding temporal development folds.**

| Model | Calibration Strategy | Brier Score (mean $\pm$ SD) | ECE 10-Bins (mean $\pm$ SD) | Validation PR-AUC |
| :--- | :--- | :---: | :---: | :---: |
| **CatBoost** | Raw Uncalibrated | 0.1398 $\pm$ 0.0292 | 0.0850 $\pm$ 0.0543 | 0.2999 $\pm$ 0.1573 |
| **CatBoost** | **Platt / Sigmoid Scaling** | **0.1357 $\pm$ 0.0556** | **0.0807 $\pm$ 0.0501** | **0.2999 $\pm$ 0.1573** |
| **CatBoost** | Isotonic Regression | 0.1336 $\pm$ 0.0536 | 0.0760 $\pm$ 0.0551 | 0.2730 $\pm$ 0.1292 |
| **Random Forest** | Raw Uncalibrated | 0.1797 $\pm$ 0.0469 | 0.2051 $\pm$ 0.1059 | 0.3296 $\pm$ 0.1797 |
| **Random Forest** | **Platt / Sigmoid Scaling** | **0.1317 $\pm$ 0.0566** | **0.0866 $\pm$ 0.0553** | **0.3296 $\pm$ 0.1797** |
| **Random Forest** | Isotonic Regression | 0.1316 $\pm$ 0.0536 | 0.0774 $\pm$ 0.0538 | 0.2904 $\pm$ 0.1467 |

*Artifact Source*: `research/outputs/tables/calibration_summary.csv`, `research/outputs/figures/calibration_reliability_catboost.png`.

Platt scaling improved probability calibration, reducing Brier score and cutting ECE on Random Forest by over $57\%$ ($0.2051 \to 0.0866$) while strictly preserving continuous rank discrimination. In contrast, while Isotonic regression achieves slightly lower ECE, its discrete step quantization reduces PR-AUC from $0.2999$ to $0.2730$ on CatBoost and $0.3296$ to $0.2904$ on Random Forest.

### 10.3 Conditional Severity Point Estimation (RQ3)
Table 4 presents conditional severity point-prediction errors evaluated on delayed shipments across temporal folds.

**Table 4: Point-prediction error on delayed shipments across expanding temporal folds.**

| Severity Model | Evaluated Delayed Cohort | Mean Absolute Error (MAE, days $\pm$ SD) | Median Absolute Error (MedAE, days $\pm$ SD) | Pinball Loss $q_{0.50}$ |
| :--- | :---: | :---: | :---: | :---: |
| **Conditional Median Baseline** | 1,125 delays | **15.62 $\pm$ 6.43 d** | **7.60 $\pm$ 0.89 d** | **7.81** |
| **LightGBM Quantile ($q_{0.50}$)** | 1,125 delays | 16.96 $\pm$ 4.66 d | 8.74 $\pm$ 1.64 d | 8.48 |
| **Ridge Regression** | 1,125 delays | 23.76 $\pm$ 3.92 d | 15.01 $\pm$ 0.54 d | 11.88 |

*Artifact Source*: `research/outputs/tables/severity_summary.csv`.

The Conditional Median baseline achieves the lowest MAE ($15.62$ days), outperforming gradient-boosted quantile regression ($16.96$ days) and Ridge regression ($23.76$ days). This confirms that complex quantile models should be utilized for asymmetric interval construction rather than claimed as superior point predictors (Simchi-Levi et al., 2014).

### 10.4 Conformalized Quantile Regression Coverage (RQ4)
Table 5 summarizes the performance of Split CQR evaluated across temporal development folds.

**Table 5: Conformalized Quantile Regression (CQR) empirical coverage and prediction interval sharpness across nominal confidence levels on temporal development folds.**

| Nominal Coverage ($1-\gamma$) | Empirical Coverage ($\pm$ SD) | Coverage Error ($\Delta$) | Mean Interval Width (Days $\pm$ SD) | Median Interval Width (Days) | Mean Conformal Adjustment ($\bar{Q}$) |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **80%** | 78.33% $\pm$ 8.37% | -1.67% | 46.37 $\pm$ 16.41 d | 40.55 d | 10.15 d |
| **90%** | 85.76% $\pm$ 15.24% | -4.24% | 110.33 $\pm$ 108.53 d | 106.73 d | 38.78 d |
| **95%** | 95.84% $\pm$ 6.02% | +0.84% | 153.55 $\pm$ 120.28 d | 151.98 d | 57.06 d |

*Artifact Source*: `research/outputs/tables/conformal_summary.csv`, `research/outputs/figures/coverage_vs_width.png`.

CQR demonstrates an empirical coverage-sharpness trade-off: achieving $95\%$ nominal coverage requires wider prediction intervals ($153.55$ days) relative to $80\%$ nominal coverage ($46.37$ days).

---

## 11. Capacity-Constrained Operational Prioritization [SIMULATED SCENARIO] (RQ5)

Table 6 reports the results of simulated operational triage across four inspection capacities ($K \in \{1\%, 5\%, 10\%, 20\%\}$) on the locked benchmark cohort ($N = 1,013$, 61 total delays, 15 high-severity delays $>14$ days).

**Table 6: Operational decision utility under constrained inspection capacity on the locked registry benchmark [SIMULATED SCENARIO].**

| Capacity ($K$) | Inspected Shipments | Prioritization Strategy | Delayed Captured ($/61$) | Recall@K (%) | High-Severity Captured ($/15$) | High-Severity Recall@K (%) | Delay Days Captured | Delay Days Ratio (%) |
| :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **$K = 1\%$** | 11 | Strategy 1: Risk Only ($\hat{p}$) | 6 | 9.8% | 1 | 6.7% | 42.0 d | 5.9% |
| | 11 | Strategy 2: Risk $\times$ Severity ($\hat{p} \times \hat{y}_{50}$) | 9 | 14.8% | 8 | 53.3% | 318.0 d | 44.4% |
| | 11 | Strategy 3: Uncertainty-Aware ($\hat{p} \times \hat{y}_{95}$) | **8** | **13.1%** | **8** | **53.3%** | **317.0 d** | **44.3%** |
| **$K = 5\%$** | 51 | Strategy 1: Risk Only ($\hat{p}$) | 16 | 26.2% | 2 | 13.3% | 92.0 d | 12.8% |
| | 51 | Strategy 2: Risk $\times$ Severity ($\hat{p} \times \hat{y}_{50}$) | 21 | 34.4% | 10 | 66.7% | 414.0 d | 57.8% |
| | 51 | Strategy 3: Uncertainty-Aware ($\hat{p} \times \hat{y}_{95}$) | **21** | **34.4%** | **10** | **66.7%** | **421.0 d** | **58.8%** |
| **$K = 10\%$** | 102 | Strategy 1: Risk Only ($\hat{p}$) | 26 | 42.6% | 10 | 66.7% | 288.0 d | 40.2% |
| | 102 | Strategy 2: Risk $\times$ Severity ($\hat{p} \times \hat{y}_{50}$) | 31 | 50.8% | 13 | 86.7% | 510.0 d | 71.2% |
| | 102 | Strategy 3: Uncertainty-Aware ($\hat{p} \times \hat{y}_{95}$) | **28** | **45.9%** | **13** | **86.7%** | **493.0 d** | **68.9%** |
| **$K = 20\%$** | 203 | Strategy 1: Risk Only ($\hat{p}$) | 42 | 68.9% | 15 | 100.0% | 619.0 d | 86.5% |
| | 203 | Strategy 2: Risk $\times$ Severity ($\hat{p} \times \hat{y}_{50}$) | 36 | 59.0% | 15 | 100.0% | 574.0 d | 80.2% |
| | 203 | Strategy 3: Uncertainty-Aware ($\hat{p} \times \hat{y}_{95}$) | **35** | **57.4%** | **14** | **93.3%** | **550.0 d** | **76.8%** |

*Artifact Source*: `research/outputs/tables/locked_registry_decision_utility.csv`, `research/outputs/figures/decision_utility_at_k.png`.

### Operational Trade-off Analysis
At low inspection capacities ($K = 1\%$ and $K = 5\%$), uncertainty-aware ranking ($\hat{p} \times \hat{y}_{95}$) and expected severity ranking capture **$8/15$ ($53.3\%$)** and **$10/15$ ($66.7\%$)** of all high-severity delayed shipments, compared to only $1/15$ ($6.7\%$) and $2/15$ ($13.3\%$) for naive risk ranking. At higher capacities ($K = 20\%$), risk-only ranking captures more total delayed shipments ($42$ vs. $35$). Thus, prioritization strategies reflect a fundamental operational trade-off between maximizing raw delay count capture and preempting severe, catastrophic delays (Bastani et al., 2021).

---

## 12. Discussion & Logistics Implications

The empirical findings from this study highlight several critical implications for applied freight transportation and logistics risk management:

1. **Temporal Evaluation as a Logistics Necessity**: The substantial inflation observed under random cross-validation ($+26.2\%$ to $+99.7\%$ PR-AUC) confirms that ignoring temporal ordering and post-delivery resolution lags yields overly optimistic models that risk failure in live logistics control towers (Kapoor & Narayanan, 2023; Roberts et al., 2017). Logistics engineering teams must enforce expanding temporal splits with post-outcome embargoes as standard operating procedure.
2. **Probability Calibration in Resource Allocation**: Tree ensemble classifiers achieve competitive discrimination but exhibit probability miscalibration under class imbalance (Guo et al., 2017). Platt scaling offers an effective operational compromise by improving Brier scores and ECE while preserving continuous rank-ordering for expediting and inspection queues.
3. **Decoupling Delay Probability and Disruption Duration**: Treating delay risk purely as binary classification overlooks the operational reality that delay durations are highly skewed. Decoupling occurrence from magnitude enables targeted modeling, where simple medians serve for expected baseline estimation and quantile models provide uncertainty bounds (Simchi-Levi et al., 2014).
4. **Finite-Sample Uncertainty and Conformal Guarantees**: Split CQR provides a structured mechanism to bound predictive uncertainty. However, in small delayed cohorts ($N = 61$), individual miscoveries have non-trivial impacts on empirical coverage rates, emphasizing the need to report exact binomial confidence intervals (Clopper & Pearson, 1934; Barber et al., 2023).

---

## 13. Limitations

We explicitly note the following boundary conditions:
1. **Single Public Health Logistics Dataset**: The study is conducted on the USAID SCMS Delivery History Dataset ($N = 10,324$). While representative of global health logistics, findings may not directly generalize to high-velocity commercial e-commerce networks.
2. **Historical Observational Data**: We evaluate observational procurement records without observed counterfactuals (e.g., delay outcomes under hypothetical expediting interventions).
3. **Small Benchmark Delayed Cohort ($N = 61$)**: The secondary benchmark contains 61 delays, resulting in finite-sample coverage variance ($\approx 1.64\%$ per event).
4. **Simulated Decision Utility**: Operational triage results represent simulated scenarios under synthetic capacity budgets and do not reflect measured financial balance-sheet savings.
5. **No Causal Claims**: We do not claim entity memorization as an established causal mechanism for random-split optimism.
6. **Absence of Prospective Clinical Field Trials**: Findings reflect retrospective temporal evaluation rather than an active randomized trial in a live control tower.

---

## 14. Conclusion

This study establishes a four-stage decision-intelligence framework for pharmaceutical supply chain delay risk prediction. By combining expanding temporal cross-validation with 90-day post-delivery embargoes, post-hoc probability calibration, conditional severity modeling, and Split Conformalized Quantile Regression, the framework provides reliable probabilistic predictions and empirical prediction intervals under temporal distribution shift. Our findings demonstrate that random cross-validation substantially inflates performance metrics, that probability calibration is vital for operational triage, and that uncertainty-aware ranking enhances the capture of high-severity delays under constrained operational inspection capacity.

---

## Declarations

### Funding Statement
`[DECLARATION REQUIRED: Funding Statement]`

### Competing Interests
`[DECLARATION REQUIRED: Conflict of Interest Declaration]`

### CRediT Author Statement
`[DECLARATION REQUIRED: Author Contributions]`

### Data Availability Statement
The USAID SCMS Delivery History Dataset used in this study is publicly accessible via the U.S. Agency for International Development public data repository (USAID, 2016).

### Code Availability Statement
The research evaluation code, temporal fold generators, calibration routines, conformal prediction modules, and test suites are available from the authors upon reasonable academic request.

---

## References

- Angelopoulos, A. N., & Bates, S. (2023). Conformal prediction: A gentle introduction. *Foundations and Trends in Machine Learning*, 16(4), 494–591.
- Barber, R. F., Candès, E. J., Ramdas, A., & Tibshirani, R. J. (2023). Conformal prediction beyond exchangeability. *The Annals of Statistics*, 51(2), 816–845.
- Baryannis, G., Validi, S., Dani, S., & Antoniou, G. (2019). Supply chain risk management and artificial intelligence: state of the art and future research directions. *International Journal of Production Research*, 57(7), 2179–2202.
- Bastani, H., Drakopoulos, K., Gupta, V., Vlachogiannis, I., Hadjichristodoulou, C., et al. (2021). Efficient and targeted COVID-19 border testing via reinforcement learning. *Nature*, 599(7883), 108–113.
- Bergmeir, C., & Benítez, J. M. (2012). On the use of cross-validation for time series predictor evaluation. *Information Sciences*, 191, 192–213.
- Bertsimas, D., & Kallus, N. (2020). From predictive to prescriptive analytics. *Management Science*, 66(3), 1025–1044.
- Breiman, L. (2001). Random forests. *Machine Learning*, 45(1), 5–32.
- Brier, G. W. (1950). Verification of forecasts expressed in terms of probability. *Monthly Weather Review*, 78(1), 1–3.
- Chawla, N. V., Bowyer, K. W., Hall, L. O., & Kegelmeyer, W. P. (2002). SMOTE: synthetic minority over-sampling technique. *Journal of Artificial Intelligence Research*, 16, 321–357.
- Chen, T., & Guestrin, C. (2016). XGBoost: A scalable tree boosting system. *Proceedings of the 22nd ACM SIGKDD International Conference on Knowledge Discovery and Data Mining*, 785–794.
- Clopper, C. J., & Pearson, E. S. (1934). The use of confidence or fiducial limits illustrated in the case of the binomial. *Biometrika*, 26(4), 404–413.
- Gibbs, I., & Candès, E. (2021). Adaptive conformal inference under distribution shift. *Advances in Neural Information Processing Systems (NeurIPS)*, 34, 1660–1672.
- Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q. (2017). On calibration of modern neural networks. *Proceedings of the 34th International Conference on Machine Learning (ICML)*, 1321–1330.
- Kapoor, S., & Narayanan, A. (2023). Leakage and the reproducibility crisis in machine-learning-based science. *Patterns*, 4(9), 100804.
- Ke, G., Meng, Q., Finley, T., Wang, T., Chen, W., Ma, W., Ye, Q., & Liu, T.-Y. (2017). LightGBM: A highly efficient gradient boosting decision tree. *Advances in Neural Information Processing Systems (NeurIPS)*, 30, 3146–3154.
- Koenker, R., & Bassett, G. (1978). Regression quantiles. *Econometrica*, 46(1), 33–50.
- Kourentzes, N., Trapero, J. R., & Barrow, D. K. (2020). Optimising forecasting models for inventory planning. *International Journal of Production Economics*, 225, 107597.
- López de Prado, M. (2018). *Advances in Financial Machine Learning*. John Wiley & Sons.
- Meinshausen, N. (2006). Quantile random forests. *Journal of Machine Learning Research*, 7, 983–999.
- Niculescu-Mizil, A., & Caruana, R. (2005). Predicting good probabilities with supervised learning. *Proceedings of the 22nd International Conference on Machine Learning (ICML)*, 625–632.
- Platt, J. (1999). Probabilistic outputs for support vector machines and comparisons to regularized likelihood methods. *Advances in Large Margin Classifiers*, 61–74.
- Prokhorenkova, L., Gusev, G., Vorobev, A., Dorogush, A. V., & Gulin, A. (2018). CatBoost: unbiased boosting with categorical features. *Advances in Neural Information Processing Systems (NeurIPS)*, 31, 6638–6648.
- Roberts, D. R., Bahn, V., Ciuti, S., Boyce, M. S., Elith, Jane, et al. (2017). Cross-validation strategies for data with temporal, spatial or phylogenetic structure. *Ecography*, 40(8), 913–929.
- Romano, Y., Patterson, E., & Candès, E. (2019). Conformalized Quantile Regression. *Advances in Neural Information Processing Systems (NeurIPS)*, 32, 3543–3553.
- Simchi-Levi, D., Schmidt, W., & Wei, Y. (2014). From superstorms to factory fires: Managing high-impact supply chain risks. *Harvard Business Review*, 92(1–2), 96–101.
- Tibshirani, R. J., Foygel Barber, R., Candès, E., & Ramdas, A. (2019). Conformal prediction under covariate shift. *Advances in Neural Information Processing Systems (NeurIPS)*, 32, 2530–2540.
- USAID. (2016). *USAID Supply Chain Management System (SCMS) Delivery History Dataset*. U.S. President's Emergency Plan for AIDS Relief (PEPFAR) / USAID Data Repository.
- USAID SCMS Project. (2015). *Supply Chain Management System: Final Program Report (2005–2015)*. U.S. Agency for International Development.
- Vledder, M., Friedman, J., Sjoblom, M., Brown, T., & Yadav, P. (2019). Improving supply chain for essential drugs in low-income countries: Results from a large scale randomized experiment in Zambia. *Health Systems & Reform*, 5(2), 158–177.
- Vovk, V., Gammerman, A., & Shafer, G. (2005). *Algorithmic Learning in a Random World*. Springer.
- Yadav, P. (2015). Health product supply chains in developing countries: Diagnosis of the root causes of underperformance and an agenda for reform. *Health Systems & Reform*, 1(2), 142–154.
- Zadrozny, B., & Elkan, C. (2002). Transforming classifier scores into accurate multiclass probability estimates. *Proceedings of the Eighth ACM SIGKDD International Conference on Knowledge Discovery and Data Mining*, 694–699.
