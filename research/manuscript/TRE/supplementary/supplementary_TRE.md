# Supplementary Material: Temporal Evaluation, Calibrated Risk, and Conformal Delay-Severity Prediction in Pharmaceutical Logistics

**Journal**: *Transportation Research Part E: Logistics and Transportation Review*  
**Date**: August 31, 2026  

---

## Section S1: Complete Prediction-Time Feature Dictionary

The prediction-time feature space $\mathcal{X}$ contains 39 variables strictly observable on or before $T_{\text{pred}, i} = \text{Scheduled Delivery Date}_i - \text{Scheduled Lead Time}_i$.

**Table S1: Complete feature dictionary and measurement specifications.**

| Feature Name | Feature Type | Domain / Values | Description |
| :--- | :--- | :--- | :--- |
| `Country` | Categorical (42) | Recipient ISO codes | Destination sovereign nation |
| `Shipment Mode` | Categorical (4) | Air, Air Charter, Ocean, Truck | Primary international transport mode |
| `Fulfill Via` | Categorical (2) | Direct Drop, From RDC | Fulfillment channel |
| `Vendor` | Categorical | Anonymized vendor IDs | International procurement vendor |
| `Manufacturing Site` | Categorical | Anonymized facility IDs | Manufacturing plant location |
| `Product Group` | Categorical (5) | ARV, HRDT, MRDT, ANTM, ACT | Therapeutic commodity category |
| `Sub Classification` | Categorical (6) | Adult, Pediatric, HIV test, etc. | Clinical target demographic |
| `Dosage Form` | Categorical (17) | Tablet, Capsule, Test kit, etc. | Pharmaceutical physical formulation |
| `Incoterms` | Categorical | EXW, CIP, DDU, DDP, CIF, etc. | International commercial terms |
| `Client Department` | Categorical | Ministry of Health, NGO, etc. | In-country recipient agency |
| `Scheduled Lead Time Duration` | Continuous | Days ($\ge 0$) | Planned procurement-to-delivery lead time |
| `Line Item Quantity` | Continuous | Units | Order quantity |
| `Line Item Value` | Continuous | USD | Total purchase order value |
| `Unit Price` | Continuous | USD | Price per pack/unit |
| `Weight (Kilograms)` | Continuous | kg | Shipment gross weight |
| `Freight Cost` | Continuous | USD | Total transportation freight charge |
| `Historical Vendor Delay Rate` | Continuous | $[0, 1]$ | Past vendor historical delay frequency |
| `Destination Congestion Index` | Continuous | Standardized score | Historical port/customs delay frequency |

---

## Section S2: Complete Hyperparameter Configuration

All machine learning models were initialized with reproducible seeds (`seed=42`) and trained using the following hyperparameter specifications:

- **Logistic Regression ($L_2$)**: `C=1.0`, `solver='lbfgs'`, `max_iter=1000`, `class_weight='balanced'`.
- **Random Forest**: `n_estimators=300`, `max_depth=8`, `min_samples_leaf=5`, `class_weight='balanced_subsample'`, `random_state=42`.
- **XGBoost**: `n_estimators=300`, `learning_rate=0.05`, `max_depth=6`, `subsample=0.8`, `colsample_bytree=0.8`, `scale_pos_weight=1.0`, `random_state=42`.
- **LightGBM**: `n_estimators=300`, `learning_rate=0.05`, `num_leaves=31`, `min_child_samples=20`, `class_weight='balanced'`, `random_state=42`.
- **CatBoost**: `iterations=300`, `learning_rate=0.05`, `depth=6`, `auto_class_weights='Balanced'`, `random_seed=42`.
- **LightGBM Quantile Regressors**: `objective='quantile'`, `alpha` $\in \{0.025, 0.05, 0.10, 0.50, 0.90, 0.95, 0.975\}$, `n_estimators=300`, `learning_rate=0.05`, `num_leaves=31`.

---

## Section S3: Secondary Locked Registry Benchmark Extended Metrics

**Table S2: Multi-metric performance on the Locked Registry Evaluation Set ($N=1,013$, 61 delays).**

| Model | Calibration | Threshold | PR-AUC | ROC-AUC | Brier | ECE (10-bin) | Precision | Recall | F1 | Balanced Acc |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **CatBoost** | Platt | 0.1000 | 0.2709 | 0.7477 | 0.0527 | 0.0568 | 0.2174 | 0.7377 (45/61) | 0.3358 | 0.7838 |
| **Random Forest** | Platt | 0.1050 | 0.3195 | 0.7898 | 0.0493 | 0.0314 | 0.2117 | 0.7705 (47/61) | 0.3322 | 0.7933 |

---

## Section S4: Complete Conformal Uncertainty Adjustments Across Folds

**Table S3: Conformal empirical adjustment quantile ($Q$) across expanding development folds.**

| Development Fold | 80% Nominal $Q$ | 90% Nominal $Q$ | 95% Nominal $Q$ |
| :---: | :---: | :---: | :---: |
| Fold 0 | 8.42 d | 32.11 d | 48.90 d |
| Fold 1 | 9.15 d | 35.80 d | 52.40 d |
| Fold 2 | 11.20 d | 41.20 d | 60.15 d |
| Fold 3 | 10.88 d | 39.95 d | 58.70 d |
| Fold 4 | 11.10 d | 44.84 d | 65.14 d |
| **Development Mean ($\bar{Q}$)** | **10.15 d** | **38.78 d** | **57.06 d** |
| **Secondary Benchmark ($Q$)** | **2.45 d** | **3.32 d** | **5.01 d** |
