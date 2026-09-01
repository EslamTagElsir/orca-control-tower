# Temporal Evaluation, Calibrated Risk, and Conformal Delay-Severity Prediction in Pharmaceutical Logistics

**Anonymized manuscript for double-anonymized review**

## Abstract

Delivery delays in global health supply chains disrupt treatment continuity, deplete buffer stocks, and complicate procurement and transportation planning. Machine-learning models for shipment-delay prediction are often evaluated with random cross-validation, which can obscure deterioration when the data-generating process changes over time. We evaluate an integrated logistics decision-support framework that combines prediction-time leakage control, expanding-origin temporal evaluation with 90-day post-delivery embargoes, calibrated delay-risk estimation, conditional delay-severity modeling, conformalized quantile uncertainty, and capacity-constrained shipment prioritization. Using the USAID Supply Chain Management System delivery-history data (N = 10,324 shipments across 42 recipient countries), random cross-validation overestimated PR-AUC relative to temporally ordered evaluation across all five tested classifiers, with relative inflation from 26.2% for logistic regression to 99.7% for LightGBM. Platt scaling reduced Brier score and expected calibration error while preserving continuous rankings. Conditional-median severity estimates achieved lower mean absolute error than LightGBM quantile point predictions, while the quantile models enabled Split Conformalized Quantile Regression. Under exchangeability, split CQR has finite-sample marginal coverage guarantees; here, temporally later cohorts are treated as empirical out-of-time coverage audits rather than formal guarantees under shift. On the secondary locked registry benchmark (N = 1,013; 61 delays), 90% CQR achieved 91.80% empirical coverage (56/61; exact 95% CI 81.90%-97.28%) with 46.27-day mean width. Simulated Top-K triage showed different trade-offs among risk, severity, and uncertainty. The results support temporally disciplined and uncertainty-aware logistics evaluation rather than a single universally dominant model or ranking policy.

**Keywords:** Pharmaceutical logistics; shipment delay; temporal validation; probability calibration; conformal prediction; decision support

## 1. Introduction

Global health supply chains operate under long international lead times, heterogeneous transport modes, procurement constraints, and uneven infrastructure. Delayed health-product deliveries can contribute to stockouts and emergency responses, making delivery reliability a practical logistics concern [@yadav2015health; @vledder2019improving]. Predictive analytics can help identify shipments that warrant attention, but a deployable logistics model must answer more than whether an order is likely to be late. It must be evaluated at a realistic prediction time, provide probabilities that are meaningful for decision thresholds, characterize how severe a delay may become, communicate uncertainty, and support prioritization when review capacity is limited.

A central methodological difficulty is temporal dependence. Randomly mixing historical and future shipments can allow a model-selection process to exploit distributional information unavailable at deployment time. Leakage and poorly matched validation can therefore produce optimistic scientific claims [@kapoor2023leakage; @roberts2017crossvalidation; @bergmeir2012use]. In shipment data, the problem is amplified by label maturity: an order can be known before its eventual delivery outcome is resolved. We therefore treat prediction-time integrity and temporal separation as part of the scientific problem rather than as implementation details.

A second challenge is that ranking and probability reliability are different objectives. A classifier may separate late and on-time shipments reasonably well while assigning probability values that are unsuitable for thresholding or resource allocation. Post-hoc calibration methods such as Platt scaling and isotonic regression provide established tools for this distinction [@platt1999probabilistic; @niculescu2005predicting; @guo2017calibration]. Third, binary risk and delay magnitude are operationally distinct. A short delay and a prolonged disruption can have different consequences even when both share the same binary label. Quantile regression offers a way to describe asymmetric conditional delay distributions [@koenker1978regression], while conformalized quantile regression (CQR) can conformalize such bounds under its validity assumptions [@romano2019cqr; @angelopoulos2023gentle].

Finally, logistics teams face finite intervention capacity. Prediction becomes operationally useful only when it informs which shipments to inspect or escalate. This motivates a decision layer in which calibrated risk, conditional severity, and uncertainty may produce different rankings rather than a claim that one score is universally superior [@bertsimas2020predictive].

This study evaluates these components within historical USAID Supply Chain Management System (SCMS) shipment records. Its contributions are: (1) a leakage-aware expanding temporal evaluation with a 90-day label-maturity embargo; (2) a five-model comparison quantifying random-split optimism; (3) separate evaluation of probability calibration and conditional severity; (4) empirical auditing of CQR coverage and sharpness in temporally later cohorts; and (5) a capacity-constrained Top-K prioritization analysis explicitly labeled as a simulated operational scenario.

## 2. Related work

### 2.1 Supply-chain delay prediction and pharmaceutical logistics

Machine learning has been applied broadly to supply-chain risk and disruption prediction [@baryannis2019supply]. Earlier pharmaceutical work includes machine-learning lead-time forecasting [@oliveira2021lead], while more recent studies have examined pharmaceutical disruption risk across the COVID-19 regime shift [@hupman2024predicting] and global-health shipment delays using shipment and country-level logistics indicators [@gali2025predicting]. Order-delay classification is also represented in general supply-chain studies [@thomas2023application; @bassiouni2024deep]. A recent analytical review of delivery-delay prediction identifies continued emphasis on predictive classification and highlights the importance of linking predictions to decision support [@muller2025analytical].

### 2.2 Temporal evaluation, leakage, and label maturity

Temporally structured evaluation is necessary when observations are dependent or non-stationary. Random cross-validation can understate prospective error when data have temporal structure [@roberts2017crossvalidation], while leakage has been identified as a broader reproducibility problem in machine-learning science [@kapoor2023leakage]. Time-series validation literature similarly emphasizes matching the validation design to the deployment setting [@bergmeir2012use]. Purging or embargo ideas have also been used in other time-dependent domains to separate training observations from outcomes whose information would not yet be available [@deprado2018advances]. In the present logistics setting, the embargo is tied directly to shipment outcome resolution.

### 2.3 Calibration and severity uncertainty

Probability calibration is distinct from discrimination. Platt scaling applies a monotonic logistic mapping to model scores, while isotonic regression provides a more flexible monotonic mapping [@platt1999probabilistic; @zadrozny2002transforming; @niculescu2005predicting]. Reliability is evaluated here with Brier score [@brier1950verification] and a 10-bin expected calibration error, with the latter treated as a descriptive calibration metric rather than a sufficient stand-alone measure.

Conditional severity is modeled only among truly delayed shipments to avoid a target distribution dominated by zero-delay observations. Quantile regression [@koenker1978regression] provides lower, median, and upper conditional estimates. CQR then adjusts learned quantile intervals using held-out conformity scores [@romano2019cqr]. Standard conformal validity relies on exchangeability or related conditions; covariate shift and broader non-exchangeability require additional care [@tibshirani2019covariate; @gibbs2021adaptive; @barber2023beyond]. We therefore distinguish formal exchangeability-based guarantees from empirical future-period coverage in this study.

### 2.4 Prediction-to-decision integration and closest prior art

Recent work narrows the novelty boundary substantially. In global-health logistics, Pathak et al. [@pathak2025predicting] proposed SCaLDR, a two-stage framework for HIV-medicine shipment-delay occurrence and duration. In broader logistics, Yang [@yang2026o2rdl] jointly modeled risk classification and delay forecasting using a chronological design. Faulkner et al. [@faulkner2026uncertainty], a 2026 preprint, combines delay classification, quantile duration modeling, and conformalized uncertainty on a very large industrial shipment dataset. Conformal prediction has also been propagated into capacity-constrained container-terminal scheduling [@makhado2026conformal] and transportation-delay uncertainty [@sadeek2026uncertainty]. Separately, delay classification has been coupled to supplier-selection and order-allocation optimization [@zaghdoudi2024collaborative], and risk-based container inspection has been formulated under explicit operational resource constraints [@liang2026freeports].

These studies rule out broad claims that the present work is the first application of machine learning to pharmaceutical delays, the first use of conformal prediction in logistics, or the first combination of delay occurrence and duration. **To the best of our knowledge, this is the first study to jointly evaluate, in pharmaceutical shipment logistics, a leakage-aware temporally ordered delay-risk pipeline with post-delivery embargoes, post-hoc probability calibration, conditional delay-severity modeling, conformalized quantile uncertainty, and capacity-constrained shipment prioritization.** This is a qualified joint-combination priority claim based on literature reviewed through 31 August 2026, not a claim of algorithmic novelty.

## 3. Data and prediction-time formulation

### 3.1 Dataset and outcome

The study uses the public USAID SCMS Delivery History Dataset and associated program documentation [@usaid2015scms; @scmsdataset2016]. The canonical file contains 10,324 completed shipment records across 42 recipient countries. There are 1,186 delayed records, corresponding to an overall delay prevalence of 11.488%. The commodity mix includes antiretroviral pharmaceuticals, rapid diagnostic tests, antimalarial products, and ancillary health-supply items. The dataset is historical and observational; it does not contain randomized intervention outcomes.

For shipment i, the binary target is Y_i = 1 when the delivered date occurs after the scheduled delivery date and Y_i = 0 otherwise. Positive delay severity S_i is the number of calendar days beyond the scheduled date and is modeled only in the subset Y_i = 1.

### 3.2 Prediction-time feature contract

The prediction anchor T_pred represents the point at which the shipment schedule is available and a prospective risk score could be issued. The frozen research contract contains 39 pre-outcome features. Post-outcome and target-derived fields - including Delay_Days, Delay_Flag, Delivered to Client Date, and Delivery Recorded Date - are excluded. Categorical missing values are represented explicitly; numeric missingness is imputed using training-only statistics. The objective is not merely to remove obvious target columns but to ensure that all engineered features are computable at or before T_pred.

## 4. Temporal evaluation and leakage-control protocol

The primary evidence comes from five expanding-origin temporal development folds covering a development cohort of 7,306 shipments, including 1,125 delayed observations. A 90-day embargo is inserted between the end of eligible training outcomes and each validation window. The embargo acts as a label-maturity buffer so that shipments whose final outcomes would not yet be resolved cannot contribute target information to training. Figure 2 provides a schematic representation.

A later 717-row calibration buffer (103 delayed shipments) is used for frozen post-hoc calibration and conformal adjustment where specified. The secondary Locked Registry Evaluation Set contains 1,013 shipments from 24 August 2014 through 24 August 2015, of which 61 are delayed (6.02%). This cohort was historically evaluated by the serving registry before the research track and is therefore treated as a **secondary locked registry benchmark**, not as a newly untouched confirmatory holdout.

**Table 1. Evidence hierarchy and temporal cohorts.**

| Cohort | N | Delayed | Scientific role |
|---|---:|---:|---|
| Canonical SCMS population | 10,324 | 1,186 | Historical source population |
| Temporal development cohort | 7,306 | 1,125 | Primary evidence: 5 expanding folds |
| Calibration buffer | 717 | 103 | Frozen probability/CQR calibration buffer |
| Locked registry benchmark | 1,013 | 61 | Secondary replication/benchmark evidence |

## 5. Delay-risk classification

Five tabular classifiers were compared: regularized logistic regression, Random Forest, CatBoost, XGBoost, and LightGBM [@breiman2001random; @prokhorenkova2018catboost; @chen2016xgboost; @ke2017lightgbm]. PR-AUC is primary because delay is the minority class; ROC-AUC and Brier score are secondary. Random 5-fold cross-validation is included only as a diagnostic comparator. Model selection and paper claims rely on temporal evaluation.

**Table 2. Random-split diagnostic versus expanding temporal evaluation.**

| Model | Random PR-AUC | Temporal PR-AUC | Relative inflation | Temporal ROC-AUC | Temporal Brier |
|---|---:|---:|---:|---:|---:|
| Logistic Regression | 0.3799 | 0.3011 | +26.2% | 0.7132 | 0.2001 |
| Random Forest | 0.4780 | 0.3238 | +47.6% | 0.7316 | 0.1605 |
| CatBoost | 0.5608 | 0.3164 | +77.3% | 0.7401 | 0.1417 |
| XGBoost | 0.5591 | 0.2917 | +91.6% | 0.7128 | 0.1395 |
| LightGBM | 0.5975 | 0.2992 | +99.7% | 0.7277 | 0.1430 |

Random splitting produced higher PR-AUC for every tested architecture. Relative inflation ranged from 26.2% for logistic regression to 99.7% for LightGBM, with Random Forest at 47.6% and CatBoost at 77.3%. We interpret these differences as evidence that random splitting materially overstates performance relative to the temporally ordered deployment proxy. The experiment does not establish a single causal mechanism such as entity memorization; the gap is consistent with temporal dependence and changing distribution structure.

## 6. Probability calibration

Tree-ensemble scores were evaluated in raw form and after Platt or isotonic calibration. Platt scaling was frozen for the operational comparison because it improved probability reliability while preserving continuous score ordering. Isotonic regression often improved ECE or Brier score further but introduced ties that reduced PR-AUC in these experiments.

**Table 3. Probability calibration on temporal development folds.**

| Model | Calibration | Brier | ECE (10 bins) | PR-AUC | ROC-AUC |
|---|---|---:|---:|---:|---:|
| CatBoost | Raw | 0.1398 | 0.0850 | 0.2999 | 0.6916 |
| CatBoost | Platt | 0.1357 | 0.0807 | 0.2999 | 0.6916 |
| CatBoost | Isotonic | 0.1336 | 0.0760 | 0.2730 | 0.6854 |
| Random Forest | Raw | 0.1797 | 0.2051 | 0.3296 | 0.7269 |
| Random Forest | Platt | 0.1317 | 0.0866 | 0.3296 | 0.7269 |
| Random Forest | Isotonic | 0.1316 | 0.0774 | 0.2904 | 0.6985 |

For CatBoost, Platt calibration reduced Brier score from 0.1398 to 0.1357 and ECE from 0.0850 to 0.0807 while leaving PR-AUC at 0.2999. For Random Forest, the reduction was larger: Brier fell from 0.1797 to 0.1317 and ECE from 0.2051 to 0.0866 while PR-AUC remained 0.3296. No hypothesis test of calibration improvement is claimed; the results are descriptive quantitative comparisons.

## 7. Conditional delay-severity modeling

Severity is evaluated only on delayed shipments. A simple conditional median provides a transparent baseline. Ridge regression tests a linear feature-dependent model, while LightGBM quantile regressors estimate asymmetric conditional quantiles used by the CQR layer. This separation avoids allowing the large mass at zero delay to dominate a continuous regression loss.

**Table 4. Conditional severity point error on temporal development folds.**

| Model | MAE, days | Median AE, days | q0.50 pinball |
|---|---:|---:|---:|
| Conditional median | 15.62 +/- 6.43 | 7.60 +/- 0.89 | 7.81 |
| LightGBM quantile q0.50 | 16.96 +/- 4.66 | 8.74 +/- 1.64 | 8.48 |
| Ridge regression | 23.76 +/- 3.92 | 15.01 +/- 0.54 | 11.88 |

The conditional median achieved the lowest mean point error (15.62 days), compared with 16.96 days for the LightGBM median quantile and 23.76 days for Ridge. This negative result is important: the more complex quantile model is not presented as a universally better point predictor. Its principal role is to represent conditional asymmetry and provide quantile bounds for conformalization.

## 8. Conformalized quantile regression

For nominal coverage 1-gamma, lower and upper LightGBM quantile models estimate q_(gamma/2)(x) and q_(1-gamma/2)(x). On a disjoint calibration set, the nonconformity score is E_i = max(q_low(x_i)-s_i, s_i-q_high(x_i)). The finite-sample adjustment uses the empirical quantile of conformity scores with the frozen higher-quantile rule. The final interval expands the learned lower and upper quantiles by this adjustment.

Under exchangeability, split CQR provides finite-sample marginal coverage guarantees [@romano2019cqr]. Because the evaluation here is explicitly temporal and may be non-exchangeable, future-cohort coverage is interpreted as an **empirical out-of-time audit**, not as a formal distribution-free guarantee under arbitrary temporal shift [@tibshirani2019covariate; @barber2023beyond].

**Table 5. CQR coverage and sharpness.**

| Nominal | Development coverage | Dev. mean width (days) | Dev. median width | Locked coverage (61 delays) | Exact 95% CI | Locked mean width |
|---:|---:|---:|---:|---:|---:|---:|
| 80% | 78.33% +/- 8.37% | 46.37 | 40.55 | 70.49% (43/61) | 57.43-81.48% | 41.04 |
| 90% | 85.76% +/- 15.24% | 110.33 | 106.73 | 91.80% (56/61) | 81.90-97.28% | 46.27 |
| 95% | 95.84% +/- 6.02% | 153.55 | 151.98 | 100.00% (61/61) | 94.13-100.00% | 61.74 |

Development results show meaningful temporal variability, especially at the 90% level, where average interval width was 110.33 days with large fold-to-fold variation. On the locked benchmark, the 80% point estimate undercovered (70.49%), although the nominal 80% level falls inside the exact interval; the 90% level achieved 91.80% coverage; and the 95% level covered all 61 delayed shipments at the cost of wider intervals. Reporting all three levels makes the coverage-sharpness trade-off explicit rather than selecting a favorable level after evaluation.

## 9. Secondary locked registry benchmark

The secondary benchmark is used to examine whether the frozen research pipeline behaves consistently in the same historical period previously seen by the serving registry. It is not a new globally unseen test set. CatBoost is retained as the **deployment-aligned primary model**, while Random Forest is reported as the **development PR-AUC sensitivity comparator**. Their roles were frozen before this benchmark and are not redefined based on benchmark performance.

**Table 6. Locked registry benchmark classification results.**

| Model | Role | Threshold | PR-AUC | ROC-AUC | Brier | ECE | Precision | Recall | F1 | Balanced accuracy |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CatBoost | Deployment-aligned primary | 0.1000 | 0.2709 | 0.7477 | 0.0527 | 0.0568 | 0.2174 | 0.7377 (45/61) | 0.3358 | 0.7899 |
| Random Forest | PR-AUC sensitivity comparator | 0.1050 | 0.3195 | 0.7898 | 0.0493 | 0.0314 | 0.2117 | 0.7705 (47/61) | 0.3322 | 0.8037 |

Random Forest achieved higher benchmark PR-AUC (0.3195 versus 0.2709), ROC-AUC, Brier score, ECE, recall, and balanced accuracy. CatBoost had slightly higher F1 and precision at its frozen threshold. These results do not support calling CatBoost the best predictive model; they support transparent model-role separation and sensitivity analysis.

On the 61 delayed benchmark shipments, the conditional median achieved MAE 9.05 days and median absolute error 7.00 days, whereas the LightGBM quantile median had MAE 14.21 days but median absolute error 4.91 days. Again, the evidence favors different models for different loss functions rather than a universal severity winner.

## 10. Capacity-constrained operational prioritization [SIMULATED SCENARIO]

The operational analysis assumes that a logistics team can inspect only the top K% of shipments. Three rankings are compared: calibrated risk alone, calibrated risk multiplied by predicted median severity, and calibrated risk multiplied by the upper-severity estimate. Outcomes are retrospectively evaluated using observed delays; no real intervention was applied, and no causal or financial-effect claim is made.

At K=1%, risk-only ranking captured 1 of 15 high-severity delays, while both severity-aware rankings captured 8 of 15. At K=5%, the corresponding counts were 2 of 15 versus 10 of 15. At K=10%, both severity-aware strategies captured 13 of 15 high-severity delays, but risk x q50 captured more total delays than risk x q95. At K=20%, risk-only ranking captured all 15 high-severity delays and more total delayed shipments than the other strategies. Thus, the evidence does not support a universally superior uncertainty-aware ranking. Instead, **risk, severity, and uncertainty generate different prioritization trade-offs under constrained inspection capacity**.

The complete Top-K table is provided in the supplementary material and every operational result is labeled **[SIMULATED SCENARIO]**.

## 11. Discussion

### 11.1 Random-split optimism is a logistics evaluation problem

The largest and most consistent result is not that one classifier dominates another, but that the evaluation design changes the apparent level of performance. Every architecture showed higher PR-AUC under random cross-validation than under expanding temporal evaluation. The effect was model-dependent: 26.2% for logistic regression and nearly 100% for LightGBM. This reinforces the need to make prediction-time information sets and outcome maturity explicit when evaluating logistics forecasting systems.

The 90-day embargo is not proposed as a universally optimal constant. It is a domain-specific label-maturity policy chosen to reduce the chance that unresolved shipment outcomes leak across temporal boundaries. Other logistics systems should set this gap from their own information-delay characteristics.

### 11.2 Calibration matters when probability enters a decision rule

For resource allocation, the numeric scale of risk matters. Platt scaling reduced Brier and ECE without changing continuous ordering, making it an operationally convenient calibrator in this study. Isotonic calibration sometimes attained lower calibration error but produced coarser tied probabilities and lower PR-AUC. The implication is not that Platt scaling is universally superior, but that calibrator choice should reflect both reliability and the decision process consuming the scores.

### 11.3 A simple severity baseline remains difficult to beat

The conditional median's lower MAE is a useful caution against assuming that model complexity automatically improves operational point forecasts. Feature-dependent quantile models remain valuable because the task is not only point prediction: asymmetric quantiles define heterogeneous uncertainty bounds for CQR. The manuscript therefore separates the point-estimation result from the uncertainty-estimation role.

### 11.4 Conformal uncertainty should be audited under temporal shift

The locked 90% CQR result is encouraging in that period, but it should not be generalized into a guarantee under shift. Development folds show large variation in both coverage and width, and the 80% locked point estimate undercovers. The study therefore treats future coverage as an empirical diagnostic. For live deployment, uncertainty quality would require ongoing monitoring and governed recalibration rather than permanent reliance on a frozen conformal layer.

### 11.5 Prioritization depends on operational objective and capacity

The simulated decision layer highlights an operational distinction often hidden by aggregate classification metrics. Under tight review budgets, incorporating severity strongly increased high-severity capture relative to risk-only ranking. At larger budgets, risk-only ranking recovered more total delayed shipments and eventually all high-severity delays. This pattern is useful because it prevents the operational analysis from collapsing into a single 'best policy' headline. Organizations should define whether the objective is broad delay capture, severe-delay avoidance, delay-day capture, or another cost-sensitive criterion before choosing a queue score.

## 12. Limitations

First, the empirical evidence comes from one historical USAID SCMS dataset. The multi-country nature of the data does not establish generalizability to contemporary commercial, e-commerce, cold-chain, or other supply chains. Second, all records are observational; no randomized expediting or inspection interventions are available, so operational triage is simulated and no causal effect or realized financial savings are claimed. Third, the locked benchmark contains only 61 delayed shipments. A single covered or uncovered shipment therefore changes empirical coverage by about 1.64 percentage points, motivating exact binomial intervals.

Fourth, temporal prevalence and feature distributions vary, so direct metric comparisons across periods must be contextualized. Brier score in particular is prevalence-sensitive. Fifth, standard CQR validity conditions do not automatically hold under temporal distribution shift. The out-of-time coverage results are therefore empirical audits. Sixth, the secondary locked registry benchmark was historically evaluated by the serving registry before this research track and should not be described as a newly untouched confirmatory holdout. Seventh, the Level-2 priority statement is qualified by the literature reviewed through 31 August 2026 and could be narrowed by newly indexed or inaccessible prior work.

## 13. Reproducibility and evidence governance

The research process freezes the dataset, split logic, model roles, thresholds, calibration policy, and benchmark protocol before the secondary benchmark is read. The canonical dataset SHA-256 is `918b992dd3e8d4b64d2a727b2c4ea607603d0c58f19484e73f7b78528c6a8673`. The final evaluation freeze SHA-256 is `631F1FA4241FBE697B46D9658B8720D2CE13CFB5A9F65E32C7532F8A1F6CD21A`, and the locked benchmark manifest SHA-256 is `62BE80CE9BC977767BC983EDABF61DAA23609A1801251F4E93CFA9693EBDD9AB`. The frozen integrity suite reported 26 of 26 tests passing.

For double-anonymized review, repository identity and author-linked URLs are omitted from this manuscript. A blinded reproducibility package can be supplied during review, with public repository details restored after the review process in accordance with journal policy.

## 14. Conclusion

This study evaluates a logistics delay-intelligence pipeline under temporally ordered conditions rather than treating a random split as a proxy for deployment. Across five classifier families, random splitting materially overstated PR-AUC. Probability calibration improved reliability without requiring a new classifier, while a simple conditional median remained competitive for severity point estimation. CQR added an explicit uncertainty layer whose future-period performance was evaluated empirically rather than assumed to remain valid under shift. Finally, simulated Top-K prioritization showed that risk, severity, and uncertainty support different operational objectives depending on review capacity.

The main contribution is therefore methodological integration and evaluation discipline rather than a new learning algorithm. For pharmaceutical shipment logistics, the results support a workflow in which prediction-time leakage control, temporally ordered validation, calibrated risk, conditional severity, uncertainty auditing, and explicit operational capacity are treated as one connected decision-support problem.

## Data availability

The study uses the publicly released USAID SCMS Delivery History Dataset. The exact source citation and data-access route are provided in the references. A checksum of the canonical analysis file is reported in the reproducibility section.

## Code availability

Code and frozen research artifacts are maintained in a version-controlled research repository. Repository identity is **[BLINDED FOR DOUBLE-ANONYMIZED REVIEW]** in this submission version. The final accepted manuscript will provide the public repository and reproducibility instructions, subject to journal policy.

## Ethics and responsible use

The analysis uses retrospective shipment transactions and is intended for logistics decision support. Predictions should not be used as automatic punitive assessments of suppliers or personnel. Operational rankings require human review, and simulated decision outcomes should not be interpreted as observed intervention effects.

## Declaration of generative AI and AI-assisted technologies in the manuscript preparation process

During the preparation of this work, the author used OpenAI ChatGPT and Google Gemini to support literature-search organization, manuscript structuring, language refinement, bibliographic integrity checks, and submission-readiness review. After using these tools/services, the author reviewed and edited the content as needed, independently verified quantitative results and references against frozen artifacts and primary sources, and takes full responsibility for the content of the publication.

## References
1. Müller, N., Burggräf, P., Steinberg, F., Sauer, C.R., Schütz, M. (2025). An analytical review of predictive methods for delivery delays in supply chains. Supply Chain Analytics 11, 100130. https://doi.org/10.1016/j.sca.2025.100130
2. Biazon de Oliveira, M., Zucchi, G., Lippi, M., Cordeiro, D.F., Rosa da Silva, N., Iori, M. (2021). Lead Time Forecasting with Machine Learning Techniques for a Pharmaceutical Supply Chain. ICEIS, 634-641. https://doi.org/10.5220/0010434406340641
3. Pathak, N., Keshari, S., Rai, S., Saksham, K., Raj, P. (2025). Predicting Global Supply Chain Delays for HIV Medicines Using SCaLDR: A Two-stage ML Framework. IEEE CICT. https://doi.org/10.1109/CICT67193.2025.11399211
4. Yang, X. (2026). O²RDL-net for joint risk classification and delay forecasting in logistics systems using interaction amplified deep. Scientific Reports 16, 24683. https://doi.org/10.1038/s41598-026-55703-6
5. Faulkner, S., Zandehshahvar, R., Eghbal Akhlaghi, V., Ouellet, S., Jordan, C., Van Hentenryck, P. (2026). Uncertainty-Aware Delivery Delay Duration Prediction via Multi-Task Deep Learning. arXiv:2602.20271. Preprint.
6. Makhado, N., Sejeso, M., Paepae, T. (2026). Conformal prediction-based sequential scheduling for container terminal operations under uncertainty. Operations Research Perspectives 17, 100409. https://doi.org/10.1016/j.orp.2026.100409
7. Liang, X., Fan, S., Li, H., Goerlandt, F., Yang, Z. (2026). Freeports under the lens: securing container supply chains with a risk-based inspection framework. Transportation Research Part E 208, 104658. https://doi.org/10.1016/j.tre.2025.104658
8. Zaghdoudi, M.A., Hajri-Gabouj, S., Ghezail, F., Darmoul, S., Varnier, C., Zerhouni, N. (2024). Collaborative and integrated data-driven delay prediction and supplier selection optimization: A case study in a furniture industry. Computers & Industrial Engineering 197, 110590. https://doi.org/10.1016/j.cie.2024.110590
9. Hupman, A.C., Zhang, J., Li, H. (2024). Predicting pharmaceutical supply chain disruptions before and during the COVID-19 pandemic. Risk Analysis 44(12), 2797-2811. https://doi.org/10.1111/risa.17453
10. Gali, J.S., Molavi, N., Alavi, S. (2025). Predicting Global Healthcare Supply Chain Delays: A Machine Learning Approach Leveraging Country-level Logistics Metrics. Journal of International Technology and Information Management 34(1), Article 3. https://doi.org/10.58729/1941-6679.1634
11. Sadeek, S.N., Hanaoka, S., Sugishita, K. (2026). Uncertainty quantification of departure delay considering network properties and conformal prediction framework. Journal of Air Transport Management 136, 103037. https://doi.org/10.1016/j.jairtraman.2026.103037
12. Bassiouni, M.M., Chakrabortty, R.K., Sallam, K.M., Hussain, O.K. (2024). Deep learning approaches to identify order status in a complex supply chain. Expert Systems with Applications 250, 123947. https://doi.org/10.1016/j.eswa.2024.123947
13. Thomas, A., Panicker, V.V. (2023). Application of Machine Learning Algorithms for Order Delivery Delay Prediction in Supply Chain Disruption Management. In Intelligent Manufacturing Systems in Industry 4.0, 491-500. https://doi.org/10.1007/978-981-99-1665-8_42
14. Kapoor, S., Narayanan, A. (2023). Leakage and the reproducibility crisis in machine-learning-based science. Patterns 4(9), 100804. https://doi.org/10.1016/j.patter.2023.100804
15. Roberts, D.R. et al. (2017). Cross-validation strategies for data with temporal, spatial or phylogenetic structure. Ecography 40(8), 913-929. https://doi.org/10.1111/ecog.02881
16. Niculescu-Mizil, A., Caruana, R. (2005). Predicting good probabilities with supervised learning. ICML, 625-632. https://doi.org/10.1145/1102351.1102430
17. Romano, Y., Patterson, E., Candès, E. (2019). Conformalized Quantile Regression. NeurIPS 32, 3543-3553.
18. Barber, R.F., Candès, E.J., Ramdas, A., Tibshirani, R.J. (2023). Conformal prediction beyond exchangeability. Annals of Statistics 51(2), 816-845. https://doi.org/10.1214/23-AOS2276
19. Yadav, P. (2015). Health Product Supply Chains in Developing Countries. Health Systems & Reform 1(2), 142-154. https://doi.org/10.4161/23288604.2014.968005
20. Vledder, M., Friedman, J., Sjöblom, M., Brown, T., Yadav, P. (2019). Improving Supply Chain for Essential Drugs in Low-Income Countries. Health Systems & Reform 5(2), 158-177. https://doi.org/10.1080/23288604.2019.1596050
21. Baryannis, G., Validi, S., Dani, S., Antoniou, G. (2019). Supply chain risk management and artificial intelligence: state of the art and future research directions. International Journal of Production Research 57(7), 2179-2202. https://doi.org/10.1080/00207543.2018.1530476
22. Guo, C., Pleiss, G., Sun, Y., Weinberger, K.Q. (2017). On Calibration of Modern Neural Networks. ICML 70, 1321-1330.
23. Koenker, R., Bassett, G. (1978). Regression Quantiles. Econometrica 46(1), 33-50. https://doi.org/10.2307/1913643
24. Bertsimas, D., Kallus, N. (2020). From Predictive to Prescriptive Analytics. Management Science 66(3), 1025-1044. https://doi.org/10.1287/mnsc.2018.3253
25. USAID SCMS Project (2015). Supply Chain Management System: Final Program Report (2005-2015). U.S. Agency for International Development and Partnership for Supply Chain Management.
