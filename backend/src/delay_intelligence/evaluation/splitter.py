import pandas as pd
import numpy as np
import yaml

class RollingOriginSplitter:
    def __init__(self, config_path: str = "configs/evaluation.yaml"):
        with open(config_path, "r", encoding="utf-8") as f:
            self.config = yaml.safe_load(f)['temporal_validation']
            
        self.n_folds = self.config['n_folds']
        self.gap_days = self.config['gap_days']
        self.holdout_days = self.config['holdout_duration_days']
        self.val_days = self.config['val_duration_days']
        self.min_train_days = self.config['min_train_days']

    def split(self, df: pd.DataFrame, t_pred_col: str = 'T_pred'):
        """
        Creates expanding-window rolling-origin temporal folds.
        Ensures strict chronological ordering and a temporal gap.
        Returns folds (list of dicts), holdout index, and manifest DataFrame.
        """
        df = df.copy()
        # Sort is critical for chronological integrity
        df = df.sort_values(t_pred_col)
        
        t_start = df[t_pred_col].min()
        t_end = df[t_pred_col].max()
        
        holdout_start = t_end - pd.Timedelta(days=self.holdout_days)
        
        holdout_idx = df[df[t_pred_col] >= holdout_start].index
        t_cv_end = holdout_start
        
        folds = []
        manifest = []
        
        # Calculate backwards but append forwards to keep chronological order
        for k in range(self.n_folds - 1, -1, -1):
            val_end = t_cv_end - pd.Timedelta(days=k * self.val_days)
            val_start = val_end - pd.Timedelta(days=self.val_days)
            train_end = val_start - pd.Timedelta(days=self.gap_days)
            train_start = t_start
            
            if (train_end - train_start).days < self.min_train_days:
                raise ValueError(f"Fold {self.n_folds - 1 - k} has insufficient training days (<{self.min_train_days}).")
                
            train_idx = df[(df[t_pred_col] >= train_start) & (df[t_pred_col] < train_end)].index
            val_idx = df[(df[t_pred_col] >= val_start) & (df[t_pred_col] < val_end)].index
            
            # Use normal fold_id ascending chronologically
            fold_id = self.n_folds - 1 - k
            
            folds.append({
                'fold_id': fold_id,
                'train': train_idx,
                'val': val_idx
            })
            
            manifest.append({
                'fold_id': fold_id,
                'train_start': str(train_start.date()),
                'train_end': str(train_end.date()),
                'val_start': str(val_start.date()),
                'val_end': str(val_end.date()),
                'train_rows': len(train_idx),
                'val_rows': len(val_idx),
                'gap_days': self.gap_days,
                'train_delay_rate': float(df.loc[train_idx, 'Delay_Flag'].mean()) if len(train_idx) > 0 else 0,
                'val_delay_rate': float(df.loc[val_idx, 'Delay_Flag'].mean()) if len(val_idx) > 0 else 0
            })
            
        manifest.append({
            'fold_id': 'holdout',
            'train_start': '-', 'train_end': '-',
            'val_start': str(holdout_start.date()), 'val_end': str(t_end.date()),
            'train_rows': 0, 'val_rows': len(holdout_idx),
            'gap_days': '-',
            'train_delay_rate': 0.0,
            'val_delay_rate': float(df.loc[holdout_idx, 'Delay_Flag'].mean()) if len(holdout_idx) > 0 else 0
        })
        
        manifest_df = pd.DataFrame(manifest)
        return folds, holdout_idx, manifest_df

    def save_manifest(self, manifest_df: pd.DataFrame, out_path: str = 'artifacts/evaluation/fold_manifest.csv'):
        manifest_df.to_csv(out_path, index=False)
        # Also save a markdown version
        manifest_df.to_markdown(out_path.replace('.csv', '.md'), index=False)
