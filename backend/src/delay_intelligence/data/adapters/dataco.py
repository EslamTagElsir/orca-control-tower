import pandas as pd
import yaml

class DataCoAdapter:
    def __init__(self, config_path='configs/datasets/dataco.yaml'):
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)['dataset']
            
    def load_and_transform(self, nrows=None):
        df = pd.read_csv(self.config['raw_path'], encoding='latin1', nrows=nrows)
        
        # Enforce eligibility
        df = df[df['Delivery Status'] != 'Canceled'].copy()
        
        # Mapped Ontology
        df['T_pred'] = pd.to_datetime(df['order date (DateOrders)'])
        df['Delay_Flag'] = df['Late_delivery_risk'].astype(int)
        
        # Severity: Days for shipping (real) - Days for shipment (scheduled)
        df['Delay_Days'] = df['Days for shipping (real)'] - df['Days for shipment (scheduled)']
        
        # Common Features
        df['Shipment Mode'] = df['Shipping Mode']
        df['Country'] = df['Order Country']
        df['Line Item Value'] = df['Sales per customer']
        df['Line Item Quantity'] = df['Order Item Quantity']
        df['Product Group'] = df['Category Name']
        
        return df
