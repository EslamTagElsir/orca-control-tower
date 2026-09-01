# Research Tests

Automated regression and invariant verification tests:

- `test_research_contract.py`: Validates that research configs adhere to prediction contracts and quarantine rules.
- `test_temporal_leakage_guards.py`: Verifies no future data leakage across temporal folds.
- `test_metrics_invariants.py`: Ensures metric calculations and bootstrap procedures produce consistent results.
