CREATE OR REPLACE FUNCTION public.orca_block_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
begin
  raise exception 'ORCA audit records are append-only; % is not allowed on %', TG_OP, TG_TABLE_NAME;
end;
$function$;