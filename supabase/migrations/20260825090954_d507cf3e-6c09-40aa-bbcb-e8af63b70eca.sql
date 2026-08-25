GRANT ALL ON public.orca_simulation_runs TO service_role;
GRANT ALL ON public.orca_simulation_shipments TO service_role;
GRANT ALL ON public.orca_simulation_events TO service_role;
GRANT ALL ON public.orca_state_snapshots TO service_role;
GRANT ALL ON public.orca_model_inferences TO service_role;
GRANT ALL ON public.orca_model_explanations TO service_role;
GRANT ALL ON public.orca_model_recommendations TO service_role;
GRANT ALL ON public.orca_decision_episodes TO service_role;
GRANT ALL ON public.orca_human_decisions TO service_role;
GRANT ALL ON public.orca_simulation_interventions TO service_role;
GRANT ALL ON public.orca_simulation_outcomes TO service_role;
GRANT ALL ON public.orca_learning_dataset_versions TO service_role;
GRANT ALL ON public.orca_learning_training_runs TO service_role;

CREATE INDEX IF NOT EXISTS idx_orca_decision_episodes_run ON public.orca_decision_episodes (run_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_orca_human_decisions_episode ON public.orca_human_decisions (episode_id);
CREATE INDEX IF NOT EXISTS idx_orca_simulation_events_run ON public.orca_simulation_events (run_id, sim_clock_ms DESC);
CREATE INDEX IF NOT EXISTS idx_orca_simulation_outcomes_run ON public.orca_simulation_outcomes (run_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_orca_model_inferences_run ON public.orca_model_inferences (run_id, created_at DESC);