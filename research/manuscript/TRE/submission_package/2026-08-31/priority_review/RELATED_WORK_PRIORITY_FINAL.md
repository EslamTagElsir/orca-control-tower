# Final Related-Work Priority Synthesis

Recent work establishes several important precedents that narrow the scope of ORCA's novelty. Pharmaceutical lead-time forecasting with machine learning predates the present study, and later work has examined both pharmaceutical disruption risk and global-health shipment-delay classification. Most closely in domain, Pathak et al. (2025) proposed SCaLDR, a two-stage framework for HIV-medicine shipment delay occurrence and duration. In broader logistics, Yang (2026) jointly modeled risk classification and delay duration using a chronological split, while Faulkner et al. (2026, preprint) combined delay classification, quantile delay-duration prediction, and conformalized quantile regression on a large industrial shipment dataset. Other adjacent work links predictive uncertainty or risk estimates to downstream logistics decisions: Makhado et al. (2026) propagated split-conformal intervals into capacity-constrained container-terminal scheduling, Zaghdoudi et al. (2024) coupled delay classification with supplier-selection and order-allocation optimization, and Liang et al. (2026) optimized risk-based container inspection under resource and waiting-time constraints.

These studies rule out broad claims that the present work is the first application of machine learning to pharmaceutical logistics delays, the first use of conformal prediction in logistics, or the first combination of delay classification and delay-duration estimation. The narrower contribution lies in the joint evaluation of prediction-time leakage control, calibrated delay-risk probabilities, conditional delay severity, conformalized quantile uncertainty, and explicit capacity-constrained shipment prioritization within pharmaceutical shipment logistics.

## Approved Level-2 priority sentence

> **To the best of our knowledge, this is the first study to jointly evaluate, in pharmaceutical shipment logistics, a leakage-aware temporally ordered delay-risk pipeline with post-delivery embargoes, post-hoc probability calibration, conditional delay-severity modeling, conformalized quantile uncertainty, and capacity-constrained shipment prioritization.**

## Lower-risk alternative

> **In the literature reviewed through 31 August 2026, we did not identify prior work that jointly combines post-delivery embargoed temporal evaluation, calibrated delay-risk probabilities, conditional conformal delay-severity estimation, and capacity-constrained shipment prioritization in pharmaceutical logistics.**

The Level-2 wording is a qualified literature-priority statement, not an absolute proof of worldwide priority. It should appear only after the closest prior art is explicitly discussed, especially SCaLDR, Faulkner et al. (2026), Yang (2026), Makhado et al. (2026), Zaghdoudi et al. (2024), and Liang et al. (2026).
