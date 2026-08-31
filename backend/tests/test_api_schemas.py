import pytest
from pydantic import ValidationError

from delay_intelligence.api.schemas import PredictRequest


@pytest.mark.parametrize(
    "forbidden_field",
    [
        "Delay_Days",
        "Delay_Flag",
        "Delivered to Client Date",
        "Delivery Recorded Date",
        "is_temporal_anomaly",
    ],
)
def test_predict_request_rejects_post_outcome_leakage(forbidden_field: str) -> None:
    with pytest.raises(ValidationError, match="Forbidden post-outcome feature included"):
        PredictRequest(features={forbidden_field: 1})


def test_predict_request_accepts_pre_outcome_features() -> None:
    request = PredictRequest(
        features={
            "Line Item Value": 125.0,
            "Fulfill Via": "Air",
            "Vendor INCO Term": "EXW",
        }
    )

    assert request.features["Line Item Value"] == 125.0
    assert request.features["Fulfill Via"] == "Air"
