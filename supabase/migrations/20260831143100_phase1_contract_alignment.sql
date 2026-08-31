-- Phase 1 Human-in-the-Loop runtime contract alignment.
-- Keep run status canonical in PostgreSQL even if the client sends uppercase
-- lifecycle values, and preserve backwards compatibility for inference kinds.

create or replace function public.orca_normalize_run_status()
returns trigger
language plpgsql
as $$
begin
  new.status := lower(new.status);
  return new;
end;
$$;

drop trigger if exists trg_orca_simulation_runs_normalize_status
  on public.orca_simulation_runs;

create trigger trg_orca_simulation_runs_normalize_status
before insert or update of status on public.orca_simulation_runs
for each row execute function public.orca_normalize_run_status();

alter table public.orca_model_inferences
  drop constraint if exists orca_model_inferences_inference_kind_check;

alter table public.orca_model_inferences
  add constraint orca_model_inferences_inference_kind_check
  check (
    inference_kind = any (
      array[
        'INITIAL'::text,
        'RESCORE'::text,
        'COUNTERFACTUAL'::text,
        'POST_INTERVENTION'::text
      ]
    )
  );
