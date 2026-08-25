import pandas as pd
import numpy as np

def build_features(raw_features: dict, feature_schema: dict) -> pd.DataFrame:
    df = pd.DataFrame([raw_features])
    
    num_cols = feature_schema['num_cols']
    cat_cols = feature_schema['cat_cols']
    all_features = feature_schema['all_features']
    
    # Fill missing expected features with defaults
    for c in num_cols:
        if c not in df.columns:
            df[c] = 0.0
        else:
            df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0.0).astype(float)
            
    for c in cat_cols:
        if c not in df.columns:
            df[c] = 'missing'
        else:
            df[c] = df[c].fillna('missing').astype(str).replace({'nan': 'missing', '<NA>': 'missing', 'None': 'missing'})
            
    # Ensure exact column order for model
    return df[all_features]
