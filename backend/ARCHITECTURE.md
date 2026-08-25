> **CURRENT POSITIONING: Research-validated Decision Intelligence Prototype with a Production Roadmap. See `docs/FINAL_RESULTS_SOURCE_OF_TRUTH.md` for authoritative evidence labels and metrics.**

# Supply Chain Delay Intelligence System — System Architecture Specification

## 1. System Mission & Core Paradigm

The **Supply Chain Delay Intelligence System** is a research-grade decision-intelligence prototype spanning predictive modeling, conformal uncertainty, scenario decision support, and exploratory causal analysis for complex multi-echelon supply chains.

### 1.1 Architectural Principles
- **Python-First**: Python is the single language for data ingestion, validation, feature engineering, temporal cross-validation, machine learning, deep learning, uncertainty quantification, causal inference, prescriptive optimization, API serving, dashboarding, and automated testing.
- **Local-First & Proportional on Windows**: The entire system is engineered to run locally and reproducibly on standard single-node Windows developer workstations (CPU-centric, with optional GPU acceleration). No cloud infrastructure, external databases, Kubernetes clusters, or distributed computing frameworks (e.g. Spark, BigQuery, Airflow) are required or permitted.
- **Research-Grade Modularity**: Strict separation of concerns across 13 lifecycle stages with clear interface contracts, immutable data staging (Bronze $\to$ Silver $\to$ Gold $\to$ Artifacts), and reproducible parameter tracking via YAML configs.
- **Strict Temporal Integrity**: Temporal causality invariants ($t_{\text{pred}} \le t_{\text{event}}$) are enforced across the pipeline. Post-event features (e.g., actual delivery date, recorded date, post-delivery reviews) are strictly quarantined to prevent data leakage.
- **Production-Oriented Extensibility**: Ingestion is decoupled via an Abstract Base Class (`BaseIngestionAdapter`), allowing pluggable support for multiple real-world logistics datasets (SCMS, Olist, DataCo) without modifying downstream modeling modules.

---

## 2. The 13-stage Research Pipeline

```
+----------------------------------------------------------------------------------------------------+
|                                  13-STAGE RESEARCH PIPELINE                                       |
+----------------------------------------------------------------------------------------------------+
|  [Stage 1: Ingestion & Adapters] (SCMS / DataCo / Olist)                                            |
|       |                                                                                            |
|       v                                                                                            |
|  [Stage 2: Schema & Data Integrity Validation] (Pandera / Pydantic Contracts)                      |
|       |                                                                                            |
|       v                                                                                            |
|  [Stage 3: Leakage Audit & Temporal Horizon Gate] (Strict t_pred <= t_event Enforcement)           |
|       |                                                                                            |
|       v                                                                                            |
|  [Stage 4: Feature Engineering & Preprocessing] (Temporal, Lag, Route, Vendor, Commodity)          |
|       |                                                                                            |
|       v                                                                                            |
|  [Stage 5: Temporal Rolling-Origin Cross-Validation] (Purged / Embargoed Rolling Window Splits)   |
|       |                                                                                            |
|       v                                                                                            |
|  [Stage 6: Multi-Task Modeling Engine]                                                              |
|       +---> Sub-task A: Binary Delay Classification (P(Delay=1))                                   |
|       +---> Sub-task B: Continuous Delay Magnitude Regression (E[Delay_Days])                       |
|       |     (Baselines -> LightGBM / CatBoost / XGBoost -> PyTorch Tabular)                        |
|       |                                                                                            |
|       v                                                                                            |
|  [Stage 7: Uncertainty Quantification] (Split Conformal Prediction & CQR Prediction Intervals)   |
|       |                                                                                            |
|       v                                                                                            |
|  [Stage 8: Causal Inference & Attribution] (Structural Causal Models, DoWhy / DML, TreeSHAP)      |
|       |                                                                                            |
|       v                                                                                            |
|  [Stage 9: Prescriptive Decision Engine] (Asymmetric Cost Optimization & Buffer Allocation)       |
|       |                                                                                            |
|       v                                                                                            |
|  [Stage 10: Operationalization & Delivery]                                                         |
|       +---> REST API Service (FastAPI + Pydantic)                                                  |
|       +---> Interactive Analytics & What-If Dashboard (Streamlit + Plotly)                         |
+----------------------------------------------------------------------------------------------------+
```

### Stage Summary Matrix

| Stage | Name | Input Contract | Output Contract | Invariant / Quality Gate |
|---|---|---|---|---|
| **Stage 1** | Ingestion & Adapters | Read-only raw CSVs (`scms/`, `olist/`, `dataco/`) | Bronze DataFrames (`artifacts/data/bronze_*.parquet`) | Raw data remains strictly read-only; source hashes verified. |
| **Stage 2** | Schema & Data Integrity | Bronze Parquet | Silver DataFrames (`artifacts/data/silver_*.parquet`) | Typed schema conformance, nullness thresholds, bounds checking. |
| **Stage 3** | Leakage Audit & Horizon Gate | Silver DataFrames | Pre-dispatch Feature Subsets, `leakage_report.json` | Zero post-receipt columns permitted ($t_{\text{pred}} \le t_{\text{dispatch}}$). |
| **Stage 4** | Feature Engineering | Validated Silver Data | Gold Feature Matrices (`artifacts/data/gold_features.parquet`) | Stateful encoders fit strictly on historical training splits. |
| **Stage 5** | Temporal Rolling-Origin CV | Gold Feature Matrices | CV Split Indices (`artifacts/data/cv_splits.json`) | Chronological order $t_{\text{train}} < t_{\text{val}} < t_{\text{test}}$; purge/embargo windows. |
| **Stage 6** | Multi-Task Modeling | Train/Val Folds | Model Artifacts (`artifacts/models/*.joblib`, `*.pt`) | Multi-task metrics logged; baseline comparisons required. |
| **Stage 7** | Uncertainty Quantification | Fitted Models, Calibration Split | Conformal Predictors (`artifacts/uncertainty/*.joblib`) | Finite-sample valid coverage at nominal $(1-\alpha)$ levels. |
| **Stage 8** | Causal Inference | Gold Features, SCM DAG | Causal Effects, Refutations (`artifacts/causal/`) | Refutation p-values > 0.05; unconfoundedness documented. |
| **Stage 9** | Prescriptive Decision Engine | Predictions, Intervals, CATE | Optimal Actions & Thresholds (`artifacts/decision/`) | Expected net utility non-negative under asymmetric loss. |
| **Stage 10** | Operational Serving | Serialized Models & Engines | FastAPI Service & Streamlit Control Tower | Pydantic validation, sub-50ms inference latency. |

---

## 3. Data Tiering & Ingestion Architecture

### 3.1 Data Staging Pipeline (Medallion Architecture)
1. **Bronze Layer (`artifacts/data/bronze_*.parquet`)**: Raw ingestion with standardized column naming conventions, correct character encodings (`utf-8` or `latin1`), and initial type casting.
2. **Silver Layer (`artifacts/data/silver_*.parquet`)**: Cleaned and validated data passing all schema assertions, outlier boundaries, and missing-value filters. Quarantined records are isolated.
3. **Gold Layer (`artifacts/data/gold_features.parquet`)**: Pre-dispatch feature-engineered matrices ready for model consumption ($X, y_{\text{class}}, y_{\text{reg}}$).

### 3.2 Multi-Dataset Adapter Contract (`BaseIngestionAdapter`)
All dataset loaders adhere to the abstract interface defined in `src/delay_intelligence/data/adapters/base.py`:
- `load_raw() -> pd.DataFrame`: Reads raw data in a strictly read-only fashion.
- `standardize_schema(df) -> pd.DataFrame`: Normalizes headers, handles composite fields (e.g. SCMS freight notes), and standardizes date representations.
- `extract_temporal_features(df) -> pd.DataFrame`: Computes schedule milestones, lead times, and target labels (`Delay_Flag`, `Delay_Days`).
- `get_dataset_metadata() -> dict`: Returns row/col counts, key identifiers, and schema metadata.

---

## 4. Temporal Integrity & Causality Safeguards

Supply chain delays are longitudinal events with distinct operational milestones. The timeline of an order progresses sequentially:
$$t_{\text{PQ First Sent}} \le t_{\text{PO Sent}} \le t_{\text{Scheduled Delivery}} \le t_{\text{Delivered to Client}} \le t_{\text{Delivery Recorded}}$$

To prevent data leakage, we explicitly define the following temporal parameters:
- **Prediction Timestamp ($t_{\text{pred}}$)**: The moment in time when the prediction is generated. For pre-dispatch delay prediction, this is anchored at $t_{\text{pred}} = t_{\text{PO Sent}}$ (or equivalent order dispatch date).
- **Outcome/Event Timestamp ($t_{\text{event}}$)**: The moment in time when the target outcome actually occurs (e.g., $t_{\text{Delivered to Client}}$).
- **Prediction Horizon ($h$)**: The duration between the prediction and the scheduled event, $h = t_{\text{Scheduled Delivery}} - t_{\text{pred}}$.
- **Allowed Information Cutoff**: All input features $X$ must satisfy $t_{\text{feature\_generation}} \le t_{\text{pred}}$.

### 4.1 Prohibited Features (Target Leakage)
Any feature generated or updated after the allowed information cutoff ($t > t_{\text{pred}}$) is strictly forbidden in model training:
- `Delivered to Client Date`
- `Delivery Recorded Date`
- `Actual Transit Duration`
- `Post-Delivery Customer Reviews` / `Review Scores`
- `Post-Hoc Invoiced Freight Costs` (unless contracted upfront)

### 4.3 Purged & Embargoed Rolling-Origin Evaluation
Standard random k-fold cross-validation is strictly forbidden because future observations leak into the past. The system employs **Purged Rolling-Origin Cross-Validation**:
- Expanding or rolling historical training windows: $[t_0, t_k]$
- Validation window: $[t_{k} + \text{purge}, t_{k} + \text{purge} + \Delta t]$
- Embargo period: Prevents overlapping transit intervals between training and evaluation folds.

---

## 5. Multi-Task Predictive Modeling Engine

The system formulates supply chain risk as a dual-target prediction problem:
1. **Sub-Task A: Binary Delay Classification**:
   $$P(\text{Delay} = 1 \mid X) \in [0, 1]$$
   - Target: `Delay_Flag` ($\mathbb{I}(\text{Delivered Date} > \text{Scheduled Date})$).
   - Core Models: Logistic Regression (Baseline), LightGBM Classifier, CatBoost Classifier, XGBoost Classifier, PyTorch Tabular Neural Net.
   - Primary Metrics: ROC-AUC, PR-AUC, F1-Macro, Brier Score, Expected Calibration Error (ECE).

2. **Sub-Task B: Continuous Delay Magnitude Regression**:
   $$E[\text{Delay\_Days} \mid X] \in \mathbb{R}$$
   - Target: `Delay_Days` ($\max(0, \text{Delivered Date} - \text{Scheduled Date})$).
   - Core Models: Ridge Regression (Baseline), LightGBM Regressor, CatBoost Regressor, PyTorch Tabular MLP.
   - Primary Metrics: MAE, RMSE, Median Absolute Error, Pinball Loss (Quantiles 0.1, 0.5, 0.9).

---

## 6. Conformal Uncertainty Quantification

Point predictions are insufficient for high-stakes logistics decisions. The system integrates **Inductive Split Conformal Prediction** to generate distribution-free, finite-sample valid prediction intervals:
$$P(y_{n+1} \in \hat{C}(x_{n+1})) \ge 1 - \alpha$$

### 6.1 Methodologies
- **Conformalized Quantile Regression (CQR)**: Produces adaptive-width prediction intervals $\hat{C}(x) = [\hat{q}_{\alpha/2}(x) - E_{1-\alpha}, \hat{q}_{1-\alpha/2}(x) + E_{1-\alpha}]$ that expand during volatile operational regimes (e.g. port congestion, extreme transit distances) and contract during routine shipments.
- **Classification Prediction Sets**: Targets nominal conformal coverage under the method assumptions; empirical coverage must be reported together with interval width and distribution-shift conditions.

---

## 7. Causal Inference & Attribution Framework

Predictive correlation does not guarantee intervention efficacy. The system employs **Structural Causal Models (SCMs)** to evaluate treatment interventions:
- **Treatment Variables ($T$)**: `Shipment Mode` (Air vs. Ocean/Truck), `Vendor INCO Term` (EXW vs. CIP/DDU), `Expedited Priority Flag`.
- **Outcome Variables ($Y$)**: `Delay_Days`, `Delay_Flag`.
- **Confounders ($W, X$)**: `Line Item Value`, `Weight (Kg)`, `Origin/Destination Country`, `Commodity Class`.

### 7.1 Identification & Estimation
- **Double Machine Learning (DML)**: Orthogonalized Neyman estimation using gradient boosting for nuisance parameters $E[Y|X]$ and $E[T|X]$ to estimate Average Treatment Effects (ATE) and Conditional Average Treatment Effects (CATE).
- **Refutation Battery**: Placebo treatment refutation, random common cause addition, and data subset sensitivity tests. Claims require refutation $p > 0.05$.

---

## 8. Prescriptive Decision Engine

The prescriptive engine translates predictions, uncertainty bands, and causal treatment estimates into optimal operational actions under asymmetric loss:

### 8.1 Asymmetric Cost-Loss Formulation
In supply chain logistics, the cost of an unpredicted delay (line shutdown, healthcare stockout: $C_{\text{FN}}$) drastically exceeds the cost of a false alarm (unnecessary expedited freight: $C_{\text{FP}}$):
$$p^* = \frac{C_{\text{FP}}}{C_{\text{FP}} + C_{\text{FN}}}$$

### 8.2 Action Policies
1. **Standard Monitoring**: Expected delay risk within acceptable buffer limits.
2. **Buffer Inventory Reallocation**: Intermediate risk with high uncertainty; allocate local stock.
3. **Expedited Air Freight Intervention**: High delay probability and high causal treatment responsiveness ($\text{CATE} < 0$).

---

## 9. Operational Serving & User Interface

1. **FastAPI REST Service (`src/delay_intelligence/api/`)**:
   - `POST /predict`: Real-time multi-task delay probability, magnitude, and conformal interval.
   - `POST /prescribe`: Prescriptive action recommendation with cost-loss utility breakdown.
   - `GET /health`: Subsystem health and model version metadata.
2. **Streamlit Control Tower Dashboard (`src/delay_intelligence/dashboard/`)**:
   - Interactive shipment inspection, what-if causal simulation sliders, and enterprise risk overview.

---

## 10. Non-Functional Requirements & Invariants

1. **Data Immutability**: `scms/`, `olist/`, and `dataco/` remain 100% read-only.
2. **Zero External Cloud Dependencies**: Local single-node execution on Windows.
3. **Reproducibility**: Global deterministic random seeds (`seed: 42`).
4. **Latency Budget**: Single-order inference latency $< 50$ ms.
