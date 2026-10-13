-- Undo of result-summary-install.sql: the function and its ledger row.
drop function if exists public.puzzle_result_summary(bigint, text);
delete from supabase_migrations.schema_migrations where version = '20261016090000';
