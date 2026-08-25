"""Canonical schema constants, column definitions, and type contracts for SCMS data."""

from typing import Dict, List, Set

# =============================================================================
# SCMS Raw 33 Column Constants
# =============================================================================
COL_ID = "ID"
COL_PROJECT_CODE = "Project Code"
COL_PQ_NUMBER = "PQ #"
COL_PO_SO_NUMBER = "PO / SO #"
COL_ASN_DN_NUMBER = "ASN/DN #"
COL_COUNTRY = "Country"
COL_MANAGED_BY = "Managed By"
COL_FULFILL_VIA = "Fulfill Via"
COL_VENDOR_INCO_TERM = "Vendor INCO Term"
COL_SHIPMENT_MODE = "Shipment Mode"
COL_PQ_FIRST_SENT_DATE = "PQ First Sent to Client Date"
COL_PO_SENT_DATE = "PO Sent to Vendor Date"
COL_SCHEDULED_DELIVERY_DATE = "Scheduled Delivery Date"
COL_DELIVERED_TO_CLIENT_DATE = "Delivered to Client Date"
COL_DELIVERY_RECORDED_DATE = "Delivery Recorded Date"
COL_PRODUCT_GROUP = "Product Group"
COL_SUB_CLASSIFICATION = "Sub Classification"
COL_VENDOR = "Vendor"
COL_ITEM_DESCRIPTION = "Item Description"
COL_MOLECULE_TEST_TYPE = "Molecule/Test Type"
COL_BRAND = "Brand"
COL_DOSAGE = "Dosage"
COL_DOSAGE_FORM = "Dosage Form"
COL_UNIT_OF_MEASURE = "Unit of Measure (Per Pack)"
COL_LINE_ITEM_QUANTITY = "Line Item Quantity"
COL_LINE_ITEM_VALUE = "Line Item Value"
COL_PACK_PRICE = "Pack Price"
COL_UNIT_PRICE = "Unit Price"
COL_MANUFACTURING_SITE = "Manufacturing Site"
COL_FIRST_LINE_DESIGNATION = "First Line Designation"
COL_WEIGHT_KG = "Weight (Kilograms)"
COL_FREIGHT_COST_USD = "Freight Cost (USD)"
COL_LINE_ITEM_INSURANCE_USD = "Line Item Insurance (USD)"

# =============================================================================
# Derived and Quality Flag Column Constants
# =============================================================================
COL_DELAY_FLAG = "Delay_Flag"
COL_DELAY_DAYS = "Delay_Days"
COL_SCHEDULED_TRANSIT_DAYS = "Scheduled_Transit_Days"
COL_PO_TO_SCHEDULED_DAYS = "PO_to_Scheduled_Days"
COL_IS_RDC_FULFILLMENT = "is_rdc_fulfillment"
COL_IS_PRE_PQ_PROCESS = "is_pre_pq_process"
COL_WEIGHT_IS_NUMERIC = "weight_is_numeric"
COL_FREIGHT_IS_NUMERIC = "freight_is_numeric"
COL_PO_SENT_IS_DATE = "po_sent_is_date"
COL_PQ_FIRST_SENT_IS_DATE = "pq_first_sent_is_date"
COL_IS_TEMPORAL_ANOMALY = "is_temporal_anomaly"

# =============================================================================
# Dataset Invariant Baselines
# =============================================================================
SCMS_EXPECTED_ROW_COUNT: int = 10324
SCMS_EXPECTED_COL_COUNT: int = 33
SCMS_EXPECTED_SHA256: str = "918b992dd3e8d4b64d2a727b2c4ea607603d0c58f19484e73f7b78528c6a8673"
SCMS_EXPECTED_BYTE_SIZE: int = 3785904
SCMS_PRIMARY_KEY: str = COL_ID

# =============================================================================
# Column Groupings
# =============================================================================
SCMS_RAW_COLUMNS: List[str] = [
    COL_ID,
    COL_PROJECT_CODE,
    COL_PQ_NUMBER,
    COL_PO_SO_NUMBER,
    COL_ASN_DN_NUMBER,
    COL_COUNTRY,
    COL_MANAGED_BY,
    COL_FULFILL_VIA,
    COL_VENDOR_INCO_TERM,
    COL_SHIPMENT_MODE,
    COL_PQ_FIRST_SENT_DATE,
    COL_PO_SENT_DATE,
    COL_SCHEDULED_DELIVERY_DATE,
    COL_DELIVERED_TO_CLIENT_DATE,
    COL_DELIVERY_RECORDED_DATE,
    COL_PRODUCT_GROUP,
    COL_SUB_CLASSIFICATION,
    COL_VENDOR,
    COL_ITEM_DESCRIPTION,
    COL_MOLECULE_TEST_TYPE,
    COL_BRAND,
    COL_DOSAGE,
    COL_DOSAGE_FORM,
    COL_UNIT_OF_MEASURE,
    COL_LINE_ITEM_QUANTITY,
    COL_LINE_ITEM_VALUE,
    COL_PACK_PRICE,
    COL_UNIT_PRICE,
    COL_MANUFACTURING_SITE,
    COL_FIRST_LINE_DESIGNATION,
    COL_WEIGHT_KG,
    COL_FREIGHT_COST_USD,
    COL_LINE_ITEM_INSURANCE_USD,
]

SCMS_CRITICAL_COLUMNS: List[str] = [
    COL_ID,
    COL_PROJECT_CODE,
    COL_COUNTRY,
    COL_SCHEDULED_DELIVERY_DATE,
    COL_DELIVERED_TO_CLIENT_DATE,
    COL_DELIVERY_RECORDED_DATE,
    COL_LINE_ITEM_QUANTITY,
    COL_LINE_ITEM_VALUE,
]

SCMS_DATE_COLUMNS: List[str] = [
    COL_PQ_FIRST_SENT_DATE,
    COL_PO_SENT_DATE,
    COL_SCHEDULED_DELIVERY_DATE,
    COL_DELIVERED_TO_CLIENT_DATE,
    COL_DELIVERY_RECORDED_DATE,
]

SCMS_DELIVERY_MILESTONE_COLUMNS: List[str] = [
    COL_SCHEDULED_DELIVERY_DATE,
    COL_DELIVERED_TO_CLIENT_DATE,
    COL_DELIVERY_RECORDED_DATE,
]

SCMS_PROCUREMENT_DATE_COLUMNS: List[str] = [
    COL_PQ_FIRST_SENT_DATE,
    COL_PO_SENT_DATE,
]

SCMS_POST_EVENT_COLUMNS: List[str] = [
    COL_DELIVERED_TO_CLIENT_DATE,
    COL_DELIVERY_RECORDED_DATE,
]

SCMS_NUMERIC_COLUMNS: List[str] = [
    COL_UNIT_OF_MEASURE,
    COL_LINE_ITEM_QUANTITY,
    COL_LINE_ITEM_VALUE,
    COL_PACK_PRICE,
    COL_UNIT_PRICE,
    COL_WEIGHT_KG,
    COL_FREIGHT_COST_USD,
    COL_LINE_ITEM_INSURANCE_USD,
]

SCMS_CATEGORICAL_COLUMNS: List[str] = [
    COL_PROJECT_CODE,
    COL_PQ_NUMBER,
    COL_PO_SO_NUMBER,
    COL_ASN_DN_NUMBER,
    COL_COUNTRY,
    COL_MANAGED_BY,
    COL_FULFILL_VIA,
    COL_VENDOR_INCO_TERM,
    COL_SHIPMENT_MODE,
    COL_PRODUCT_GROUP,
    COL_SUB_CLASSIFICATION,
    COL_VENDOR,
    COL_ITEM_DESCRIPTION,
    COL_MOLECULE_TEST_TYPE,
    COL_BRAND,
    COL_DOSAGE,
    COL_DOSAGE_FORM,
    COL_MANUFACTURING_SITE,
    COL_FIRST_LINE_DESIGNATION,
]

# =============================================================================
# Categorical Allowed Domains
# =============================================================================
SCMS_ALLOWED_DOMAINS: Dict[str, Set[str]] = {
    COL_FULFILL_VIA: {"From RDC", "Direct Drop"},
    COL_SHIPMENT_MODE: {"Air", "Truck", "Air Charter", "Ocean"},
    COL_PRODUCT_GROUP: {"ARV", "HRDT", "ANTM", "ACT", "MRDT"},
    COL_FIRST_LINE_DESIGNATION: {"Yes", "No"},
    COL_MANAGED_BY: {
        "PMO - US",
        "South Africa Field Office",
        "Haiti Field Office",
        "Ethiopia Field Office",
    },
}

# =============================================================================
# Canonical Data Type Mappings (Pandas & Arrow)
# =============================================================================
SCMS_CANONICAL_DTYPES: Dict[str, str] = {
    COL_ID: "int64",
    COL_PROJECT_CODE: "string",
    COL_PQ_NUMBER: "string",
    COL_PO_SO_NUMBER: "string",
    COL_ASN_DN_NUMBER: "string",
    COL_COUNTRY: "string",
    COL_MANAGED_BY: "string",
    COL_FULFILL_VIA: "string",
    COL_VENDOR_INCO_TERM: "string",
    COL_SHIPMENT_MODE: "string",
    COL_PQ_FIRST_SENT_DATE: "datetime64[ns]",
    COL_PO_SENT_DATE: "datetime64[ns]",
    COL_SCHEDULED_DELIVERY_DATE: "datetime64[ns]",
    COL_DELIVERED_TO_CLIENT_DATE: "datetime64[ns]",
    COL_DELIVERY_RECORDED_DATE: "datetime64[ns]",
    COL_PRODUCT_GROUP: "string",
    COL_SUB_CLASSIFICATION: "string",
    COL_VENDOR: "string",
    COL_ITEM_DESCRIPTION: "string",
    COL_MOLECULE_TEST_TYPE: "string",
    COL_BRAND: "string",
    COL_DOSAGE: "string",
    COL_DOSAGE_FORM: "string",
    COL_UNIT_OF_MEASURE: "int64",
    COL_LINE_ITEM_QUANTITY: "int64",
    COL_LINE_ITEM_VALUE: "float64",
    COL_PACK_PRICE: "float64",
    COL_UNIT_PRICE: "float64",
    COL_MANUFACTURING_SITE: "string",
    COL_FIRST_LINE_DESIGNATION: "string",
    COL_WEIGHT_KG: "float64",
    COL_FREIGHT_COST_USD: "float64",
    COL_LINE_ITEM_INSURANCE_USD: "float64",
}
