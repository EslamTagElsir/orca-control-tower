"""Generate and validate expanding temporal development folds."""

import hashlib
import json
import os
import sys
from pathlib import Path
import pandas as pd
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend" / "src"))
from delay_intelligence.data.adapters.scms import SCMSAdapter
from delay_intelligence.validation.contract_validator import PredictionContractValidator
from delay_intelligence.features.builder import TemporalFeatureBuilder

def generate_folds():
    raw_path = Path("E:/delay_intelligence_system/data/raw/SCMS_Delivery_History_Dataset.csv")
    adapter = SCMSAdapter(data_path=raw_path)
    df_raw = adapter.load_raw()
    df_std = adapter.standardize_schema(df_raw)
    df_temp = adapter.extract_temporal_features(df_std)

    validator = PredictionContractValidator()
    base_eligible = validator.evaluate_base_eligibility(df_temp)
    df_eligible = df_temp[base_eligible].copy()
    df_eligible['T_pred'] = validator.compute_prediction_timestamp(df_eligible, use_fallback=False)

    deliv = pd.to_datetime(df_eligible['Delivered to Client Date'])
    anomaly = df_eligible['is_temporal_anomaly'] == 0
    strict_cohort = df_eligible['T_pred'].notna() & (df_eligible['T_pred'] <= deliv) & anomaly

    df_model = df_eligible[strict_cohort].copy().sort_values('T_pred')
    
    # Development data: strictly before 2014-08-24
    dev_end = pd.Timestamp('2014-08-24')
    df_dev = df_model[df_model['T_pred'] < dev_end].copy()

    val_days = 180
    embargo_days = 90
    n_folds = 5
    t_start = df_dev['T_pred'].min()
    data_hash = adapter.raw_sha256 or adapter._compute_sha256()

    manifest_rows = []
    for k in range(n_folds - 1, -1, -1):
        val_end = dev_end - pd.Timedelta(days=k * val_days)
        val_start = val_end - pd.Timedelta(days=val_days)
        train_end = val_start - pd.Timedelta(days=embargo_days)
        train_start = t_start
        
        train_mask = (df_dev['T_pred'] >= train_start) & (df_dev['T_pred'] < train_end)
        val_mask = (df_dev['T_pred'] >= val_start) & (df_dev['T_pred'] < val_end)
        
        train_df = df_dev[train_mask]
        val_df = df_dev[val_mask]
        
        fold_id = n_folds - 1 - k
        split_sig = f"fold_{fold_id}:{train_start.date()}_{train_end.date()}->{val_start.date()}_{val_end.date()}"
        split_hash = hashlib.sha256(split_sig.encode('utf-8')).hexdigest()[:16]

        manifest_rows.append({
            'fold_id': fold_id,
            'train_start': str(train_start.date()),
            'train_end': str(train_end.date()),
            'validation_start': str(val_start.date()),
            'validation_end': str(val_end.date()),
            'embargo_days': embargo_days,
            'train_rows': len(train_df),
            'train_positive_rows': int((train_df['Delay_Flag'] == 1).sum()),
            'validation_rows': len(val_df),
            'validation_positive_rows': int((val_df['Delay_Flag'] == 1).sum()),
            'data_hash': data_hash,
            'split_hash': split_hash
        })

    manifest_df = pd.DataFrame(manifest_rows)
    out_dir = Path("research/outputs/metrics")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "temporal_fold_manifest.csv"
    manifest_df.to_csv(out_file, index=False)
    print(f"Saved temporal fold manifest to {out_file}")
    print(manifest_df.to_string(index=False))

if __name__ == "__main__":
    generate_folds()
