"""Data ingestion, staging, schema, and adapter package."""

from delay_intelligence.data.adapters.base import BaseIngestionAdapter
from delay_intelligence.data.adapters.scms import SCMSAdapter
from delay_intelligence.data.loader import DataLoader, ingest_scms_pipeline
from delay_intelligence.data.schema import (
    COL_DELAY_DAYS,
    COL_DELAY_FLAG,
    COL_DELIVERED_TO_CLIENT_DATE,
    COL_DELIVERY_RECORDED_DATE,
    COL_ID,
    COL_PO_SENT_DATE,
    COL_PQ_FIRST_SENT_DATE,
    COL_SCHEDULED_DELIVERY_DATE,
    SCMS_CRITICAL_COLUMNS,
    SCMS_RAW_COLUMNS,
)

__all__ = [
    "BaseIngestionAdapter",
    "SCMSAdapter",
    "DataLoader",
    "ingest_scms_pipeline",
    "COL_ID",
    "COL_SCHEDULED_DELIVERY_DATE",
    "COL_DELIVERED_TO_CLIENT_DATE",
    "COL_DELIVERY_RECORDED_DATE",
    "COL_PO_SENT_DATE",
    "COL_PQ_FIRST_SENT_DATE",
    "COL_DELAY_FLAG",
    "COL_DELAY_DAYS",
    "SCMS_RAW_COLUMNS",
    "SCMS_CRITICAL_COLUMNS",
]
