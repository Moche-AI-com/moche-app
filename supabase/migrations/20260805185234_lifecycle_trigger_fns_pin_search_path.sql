-- Advisor 0011 (function_search_path_mutable). Both functions are SECURITY
-- INVOKER, so the escalation risk is small, but an empty search_path removes
-- the class of attack entirely and costs nothing here: the bodies only call
-- now() (pg_catalog, always implicitly searched) and compare enum literals
-- against an already-typed NEW column, so no schema resolution is required.
alter function public.tg_service_request_archived_at() set search_path = '';
alter function public.tg_stay_archived_at() set search_path = '';
