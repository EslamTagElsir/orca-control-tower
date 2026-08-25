import pandas as pd
import numpy as np
from typing import Dict, List, Any
import yaml
from pathlib import Path

class TemporalFeatureBuilder:
    def __init__(self, config_path: str = "configs/features.yaml"):
        with open(config_path, "r", encoding="utf-8") as f:
            self.config = yaml.safe_load(f)
            
    def compute_point_in_time_aggregates(self, df: pd.DataFrame, pit_config: dict, t_pred_col: str = 'T_pred', 
                                         t_outcome_col: str = 'Delivered to Client Date') -> pd.DataFrame:
        group_col = pit_config['entity_col']
        hist_df = df[[group_col, t_outcome_col, 'Delay_Flag', 'Delay_Days']].copy()
        hist_df = hist_df.dropna(subset=[t_outcome_col])
        hist_df = hist_df.sort_values(t_outcome_col)
        
        results = {feat['name']: np.zeros(len(df)) for feat in pit_config['features']}
        
        t_preds = df[t_pred_col].values
        groups = df[group_col].values
        
        hist_grouped = {k: v for k, v in hist_df.groupby(group_col)}
        
        for i in range(len(df)):
            t_p = t_preds[i]
            g = groups[i]
            
            if pd.isna(t_p) or g not in hist_grouped:
                for feat in pit_config['features']:
                    results[feat['name']][i] = np.nan if feat['agg'] in ['mean', 'median'] else 0
                continue
                
            g_df = hist_grouped[g]
            valid_hist = g_df[g_df[t_outcome_col] < t_p]
            
            if len(valid_hist) > 0:
                for feat in pit_config['features']:
                    target = feat['target']
                    agg = feat['agg']
                    if agg == 'mean':
                        results[feat['name']][i] = valid_hist[target].mean()
                    elif agg == 'median':
                        results[feat['name']][i] = valid_hist[target].median()
                    elif agg == 'count':
                        results[feat['name']][i] = len(valid_hist)
            else:
                for feat in pit_config['features']:
                    results[feat['name']][i] = np.nan if feat['agg'] in ['mean', 'median'] else 0
                
        return pd.DataFrame(results, index=df.index)

    def apply_global_cold_start(self, df: pd.DataFrame, feature_col: str, agg: str, target: str, t_pred_col: str = 'T_pred', t_outcome_col: str = 'Delivered to Client Date') -> pd.Series:
        hist_df = df[[t_outcome_col, target]].dropna(subset=[t_outcome_col]).sort_values(t_outcome_col)
        t_preds = df[t_pred_col].values
        
        global_vals = np.zeros(len(df))
        
        for i in range(len(df)):
            t_p = t_preds[i]
            if pd.isna(t_p):
                global_vals[i] = np.nan
                continue
                
            valid_hist = hist_df[hist_df[t_outcome_col] < t_p]
            if len(valid_hist) > 0:
                if agg == 'mean':
                    global_vals[i] = valid_hist[target].mean()
                elif agg == 'median':
                    global_vals[i] = valid_hist[target].median()
            else:
                global_vals[i] = 0.0
                
        s = df[feature_col].copy()
        s = s.fillna(pd.Series(global_vals, index=df.index))
        return s

    def build_features(self, df: pd.DataFrame) -> pd.DataFrame:
        df_out = df.copy()
        
        df_out['T_pred_year'] = df_out['T_pred'].dt.year
        df_out['T_pred_month'] = df_out['T_pred'].dt.month
        df_out['T_pred_quarter'] = df_out['T_pred'].dt.quarter
        df_out['T_pred_dayofweek'] = df_out['T_pred'].dt.dayofweek
        
        sched = pd.to_datetime(df_out['Scheduled Delivery Date'])
        df_out['Forecast_Horizon_Days'] = (sched - df_out['T_pred']).dt.days
        df_out['Scheduled_Transit_Days'] = df_out['Forecast_Horizon_Days']

        # Ensure PQ_to_PO_Days is calculated if not present
        if 'PQ_to_PO_Days' not in df_out.columns:
            po = pd.to_datetime(df_out.get('PO Sent to Vendor Date', pd.Series(pd.NaT, index=df_out.index)), errors='coerce')
            pq = pd.to_datetime(df_out.get('PQ First Sent to Client Date', pd.Series(pd.NaT, index=df_out.index)), errors='coerce')
            df_out['PQ_to_PO_Days'] = (po - pq).dt.days

        for group, features in self.config.get('feature_groups', {}).items():
            for feat in features:
                col = feat['name']
                if col not in df_out.columns and col not in ['T_pred_year', 'T_pred_month', 'T_pred_quarter', 'T_pred_dayofweek']:
                    continue
                if 'fill_na' in feat:
                    df_out[col] = df_out[col].fillna(feat['fill_na'])
                if feat.get('transform') == 'log1p':
                    # Ensure dtype is numeric before log1p
                    df_out[col] = pd.to_numeric(df_out[col], errors='coerce')
                    df_out[col] = np.log1p(df_out[col].clip(lower=0))
                    
        for pit_group in self.config['historical_aggregates']['point_in_time']:
            entity = pit_group['entity_col']
            print(f"Building PIT features for {entity}...")
            pit_features = self.compute_point_in_time_aggregates(df, pit_group)
            df_out = pd.concat([df_out, pit_features], axis=1)
            
            for f in pit_group['features']:
                fname = f['name']
                agg = f['agg']
                target = f['target']
                if agg in ['mean', 'median']:
                    print(f"Applying cold-start for {fname}...")
                    df_out[fname] = self.apply_global_cold_start(df_out, fname, agg, target)
                elif agg == 'count':
                    df_out[fname] = df_out[fname].fillna(0)

        allowed_cols = ['T_pred', 'Forecast_Horizon_Days']
        for group, features in self.config.get('feature_groups', {}).items():
            allowed_cols.extend([f['name'] for f in features])
            
        for pit_group in self.config['historical_aggregates']['point_in_time']:
            allowed_cols.extend([f['name'] for f in pit_group['features']])
            
        target_cols = ['ID', 'Delivered to Client Date', 'Delivery Recorded Date', 'Delay_Days', 'Delay_Flag', 'is_temporal_anomaly']
        
        final_cols = list(set(allowed_cols + target_cols))
        final_cols = [c for c in final_cols if c in df_out.columns]
        
        return df_out[final_cols]
