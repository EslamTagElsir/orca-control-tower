import pandas as pd
from delay_intelligence.validation.contract_validator import PredictionContractValidator
from delay_intelligence.features.builder import TemporalFeatureBuilder
import time
import os

def run_feature_pipeline():
    print("Loading Bronze Dataset...")
    df = pd.read_parquet('artifacts/data/bronze_scms.parquet')
    
    validator = PredictionContractValidator()
    
    print("Validating Base Eligibility & Anchoring...")
    # 1. Base eligibility
    base_eligible = validator.evaluate_base_eligibility(df)
    df = df[base_eligible].copy()
    
    # 2. Add T_pred
    df['T_pred'] = validator.compute_prediction_timestamp(df, use_fallback=False)
    
    # 3. Restrict to Modeling Population (Anchored + T_pred <= Deliv + Not anomaly)
    deliv = pd.to_datetime(df['Delivered to Client Date'])
    anomaly = df['is_temporal_anomaly'] == 0
    strict_cohort = df['T_pred'].notna() & (df['T_pred'] <= deliv) & anomaly
    
    df_model = df[strict_cohort].copy()
    print(f"Modeling Population Size: {len(df_model)}")
    
    # 4. Feature Engineering
    print("Building Features (Point-in-Time, Transformations)...")
    builder = TemporalFeatureBuilder()
    
    start = time.time()
    df_features = builder.build_features(df_model)
    print(f"Feature Building completed in {time.time() - start:.2f} seconds.")
    
    # 5. Sanity Check / Missingness
    print("\nFeature Matrix Shape:", df_features.shape)
    
    # 6. Save Artifact
    out_path = 'artifacts/data/scms_modeling_features.parquet'
    df_features.to_parquet(out_path, index=False)
    print(f"Artifact saved to {out_path}")

if __name__ == '__main__':
    run_feature_pipeline()
