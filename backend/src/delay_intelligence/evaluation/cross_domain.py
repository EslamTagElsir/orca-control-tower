"""Cross-domain portability protocol.

No DataCo or Olist external-validation results are shipped in this repository.
The original demo contained hard-coded illustrative metrics; those values have
been retired because they were simulation, not empirical evaluation.
"""
from __future__ import annotations


class ExternalValidationNotPerformed(RuntimeError):
    pass


class CrossDomainEvaluator:
    evidence_label = "NOT VALIDATED"

    def evaluate_zero_shot(self, *args, **kwargs):
        raise ExternalValidationNotPerformed(
            "Zero-shot external validation on DataCo/Olist has not been performed in this repository. "
            "Adapters are portability prototypes only; provide real target-domain data and run a leakage-safe evaluation before reporting metrics."
        )

    def evaluate_recalibration(self, *args, **kwargs):
        raise ExternalValidationNotPerformed(
            "Target-domain recalibration has not been empirically evaluated on DataCo/Olist in this repository."
        )

    def protocol(self):
        return {
            "evidence_label": self.evidence_label,
            "status": "protocol_only",
            "required_steps": [
                "obtain licensed/authorized target-domain data",
                "freeze target-specific prediction contract and leakage exclusions",
                "map only semantically compatible pre-outcome features",
                "evaluate the frozen source model zero-shot on a chronological target holdout",
                "if recalibration is tested, use a target calibration window separate from the target holdout",
                "report PR-AUC against target prevalence, calibration, subgroup performance, and uncertainty coverage",
            ],
        }
