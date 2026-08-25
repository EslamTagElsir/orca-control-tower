import pandas as pd
import yaml

class OlistAdapter:
    def __init__(self, config_path='configs/datasets/olist.yaml'):
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)['dataset']
            
    def load_and_transform(self, nrows=None):
        df = pd.read_csv(self.config['raw_path'], nrows=nrows)
        
        # Enforce eligibility
        df = df[df['order_status'] == 'delivered'].copy()
        
        df['T_pred'] = pd.to_datetime(df['order_purchase_timestamp'])
        df['Delivered'] = pd.to_datetime(df['order_delivered_customer_date'])
        df['Estimated'] = pd.to_datetime(df['order_estimated_delivery_date'])
        
        # Severity
        df['Delay_Days'] = (df['Delivered'] - df['Estimated']).dt.total_seconds() / 86400.0
        df['Delay_Flag'] = (df['Delay_Days'] > 0).astype(int)
        
        # Common Features (Olist orders table is sparse, requires joins for product/value)
        # Mocking or leaving empty for this research POC, unless we want to join items
        # For this prototype we map what we have:
        df['Shipment Mode'] = 'Standard' # Olist doesn't explicitly have it in the orders table
        df['Country'] = 'Brazil'
        df['Line Item Value'] = 0.0 # Would need join with order_items
        df['Line Item Quantity'] = 1
        df['Product Group'] = 'Unknown' # Would need join
        
        return df
