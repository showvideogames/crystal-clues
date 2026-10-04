# Hosted inventory qszqparrqyhegfznyaby — 2026-10-04T15:08:18.805Z

## tables

| table_schema | table_name | table_type |
| --- | --- | --- |
| auth | audit_log_entries | BASE TABLE |
| auth | custom_oauth_providers | BASE TABLE |
| auth | flow_state | BASE TABLE |
| auth | identities | BASE TABLE |
| auth | instances | BASE TABLE |
| auth | mfa_amr_claims | BASE TABLE |
| auth | mfa_challenges | BASE TABLE |
| auth | mfa_factors | BASE TABLE |
| auth | mfa_recovery_code_sets | BASE TABLE |
| auth | mfa_recovery_codes | BASE TABLE |
| auth | oauth_authorizations | BASE TABLE |
| auth | oauth_client_states | BASE TABLE |
| auth | oauth_clients | BASE TABLE |
| auth | oauth_consents | BASE TABLE |
| auth | one_time_tokens | BASE TABLE |
| auth | refresh_tokens | BASE TABLE |
| auth | saml_providers | BASE TABLE |
| auth | saml_relay_states | BASE TABLE |
| auth | schema_migrations | BASE TABLE |
| auth | scim_tokens | BASE TABLE |
| auth | scim_users | BASE TABLE |
| auth | sessions | BASE TABLE |
| auth | sso_domains | BASE TABLE |
| auth | sso_providers | BASE TABLE |
| auth | users | BASE TABLE |
| auth | webauthn_challenges | BASE TABLE |
| auth | webauthn_credentials | BASE TABLE |
| public | accounts | BASE TABLE |
| public | admins | BASE TABLE |
| public | plays | BASE TABLE |
| public | puzzles | BASE TABLE |
| public | wordbank | BASE TABLE |
| storage | buckets | BASE TABLE |
| storage | buckets_analytics | BASE TABLE |
| storage | buckets_vectors | BASE TABLE |
| storage | migrations | BASE TABLE |
| storage | objects | BASE TABLE |
| storage | s3_multipart_uploads | BASE TABLE |
| storage | s3_multipart_uploads_parts | BASE TABLE |
| storage | vector_indexes | BASE TABLE |

## columns

| table_schema | table_name | column_name | data_type | is_nullable | column_default | ordinal_position |
| --- | --- | --- | --- | --- | --- | --- |
| public | accounts | user_id | uuid | NO |  | 1 |
| public | accounts | global_user_id | text | NO |  | 2 |
| public | accounts | created_at | timestamp with time zone | NO | now() | 3 |
| public | accounts | last_seen_at | timestamp with time zone | NO | now() | 4 |
| public | accounts | imported_losses | integer | NO | 0 | 5 |
| public | admins | user_id | uuid | NO |  | 1 |
| public | admins | granted_at | timestamp with time zone | NO | now() | 2 |
| public | plays | user_id | uuid | NO |  | 1 |
| public | plays | puzzle_id | bigint | NO |  | 2 |
| public | plays | puzzle_date | date | NO |  | 3 |
| public | plays | solved | boolean | NO |  | 4 |
| public | plays | lives_used | smallint | NO |  | 5 |
| public | plays | difficulty | text | NO |  | 6 |
| public | plays | finished_at | timestamp with time zone | NO | now() | 7 |
| public | plays | source | text | NO | 'play'::text | 8 |
| public | puzzles | id | bigint | NO |  | 1 |
| public | puzzles | created_at | timestamp with time zone | NO | now() | 2 |
| public | puzzles | date | text | YES |  | 3 |
| public | puzzles | title | text | YES |  | 4 |
| public | puzzles | author | text | YES |  | 5 |
| public | puzzles | difficulty | text | YES |  | 6 |
| public | puzzles | status | text | YES |  | 7 |
| public | puzzles | clues | jsonb | YES |  | 8 |
| public | puzzles | cards | jsonb | YES |  | 9 |
| public | puzzles | solution | jsonb | YES |  | 10 |
| public | puzzles | theme | text | YES |  | 11 |
| public | wordbank | id | bigint | NO |  | 1 |
| public | wordbank | word | text | NO |  | 2 |

## constraints

| table_name | conname | contype | definition |
| --- | --- | --- | --- |
| accounts | accounts_global_user_id_format | c | CHECK ((global_user_id ~ '^user_[0-9A-Za-z]{10,64}$'::text)) |
| accounts | accounts_global_user_id_key | u | UNIQUE (global_user_id) |
| accounts | accounts_imported_losses_check | c | CHECK ((imported_losses >= 0)) |
| accounts | accounts_pkey | p | PRIMARY KEY (user_id) |
| accounts | accounts_user_id_fkey | f | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| admins | admins_pkey | p | PRIMARY KEY (user_id) |
| admins | admins_user_id_fkey | f | FOREIGN KEY (user_id) REFERENCES accounts(user_id) ON DELETE CASCADE |
| plays | plays_difficulty_check | c | CHECK ((difficulty = ANY (ARRAY['easy'::text, 'standard'::text, 'expert'::text, 'hardcore'::text]))) |
| plays | plays_lives_used_check | c | CHECK (((lives_used >= 0) AND (lives_used <= 3))) |
| plays | plays_pkey | p | PRIMARY KEY (user_id, puzzle_id) |
| plays | plays_puzzle_id_fkey | f | FOREIGN KEY (puzzle_id) REFERENCES puzzles(id) ON DELETE CASCADE |
| plays | plays_source_check | c | CHECK ((source = ANY (ARRAY['play'::text, 'import'::text]))) |
| plays | plays_user_id_fkey | f | FOREIGN KEY (user_id) REFERENCES accounts(user_id) ON DELETE CASCADE |
| puzzles | puzzles_pkey | p | PRIMARY KEY (id) |
| wordbank | wordbank_pkey | p | PRIMARY KEY (id) |
| wordbank | wordbank_word_key | u | UNIQUE (word) |

## indexes

| tablename | indexname | indexdef |
| --- | --- | --- |
| accounts | accounts_global_user_id_key | CREATE UNIQUE INDEX accounts_global_user_id_key ON public.accounts USING btree (global_user_id) |
| accounts | accounts_pkey | CREATE UNIQUE INDEX accounts_pkey ON public.accounts USING btree (user_id) |
| admins | admins_pkey | CREATE UNIQUE INDEX admins_pkey ON public.admins USING btree (user_id) |
| plays | plays_pkey | CREATE UNIQUE INDEX plays_pkey ON public.plays USING btree (user_id, puzzle_id) |
| plays | plays_user_date_idx | CREATE INDEX plays_user_date_idx ON public.plays USING btree (user_id, puzzle_date) |
| puzzles | puzzles_pkey | CREATE UNIQUE INDEX puzzles_pkey ON public.puzzles USING btree (id) |
| wordbank | wordbank_pkey | CREATE UNIQUE INDEX wordbank_pkey ON public.wordbank USING btree (id) |
| wordbank | wordbank_word_key | CREATE UNIQUE INDEX wordbank_word_key ON public.wordbank USING btree (word) |

## functions

| proname | args | result | security_definer | lanname | definition |
| --- | --- | --- | --- | --- | --- |
| account_email | _user_id uuid | text | true | sql | CREATE OR REPLACE FUNCTION public.account_email(_user_id uuid)  RETURNS text  LANGUAGE sql  STABLE SECURITY DEFINER  SET search_path TO 'public' AS $function$   select coalesce(     (select nullif(btrim(i.identity_data ->> 'email'), '')        from public.accounts a        join auth.identities i on  |
| cluevoyance_uid |  | uuid | true | sql | CREATE OR REPLACE FUNCTION public.cluevoyance_uid()  RETURNS uuid  LANGUAGE sql  STABLE SECURITY DEFINER  SET search_path TO 'public' AS $function$   select a.user_id     from public.accounts a    where a.user_id = auth.uid() $function$  |
| delete_local_account | _user_id uuid | void | true | plpgsql | CREATE OR REPLACE FUNCTION public.delete_local_account(_user_id uuid)  RETURNS void  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public' AS $function$ begin   if _user_id is null then     return;   end if;   -- Cluevoyance keeps no site-wide aggregates, so personal rows are simply   -- d |
| delete_my_account |  | boolean | true | plpgsql | CREATE OR REPLACE FUNCTION public.delete_my_account()  RETURNS boolean  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public' AS $function$ declare   _uid uuid := public.cluevoyance_uid(); begin   if _uid is null then     return false;   end if;   perform public.delete_local_account(_uid); |
| ensure_account |  | TABLE(outcome text, user_id uuid, global_user_id text, email text, created_at timestamp with time zone, imported_losses integer) | true | plpgsql | CREATE OR REPLACE FUNCTION public.ensure_account()  RETURNS TABLE(outcome text, user_id uuid, global_user_id text, email text, created_at timestamp with time zone, imported_losses integer)  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public' AS $function$ #variable_conflict use_column de |
| import_plays | _plays jsonb, _losses integer | TABLE(outcome text, imported integer, skipped integer) | true | plpgsql | CREATE OR REPLACE FUNCTION public.import_plays(_plays jsonb, _losses integer DEFAULT 0)  RETURNS TABLE(outcome text, imported integer, skipped integer)  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public' AS $function$ declare   _uid uuid := public.cluevoyance_uid();   _el jsonb;   _res  |
| is_cluevoyance_admin |  | boolean | true | sql | CREATE OR REPLACE FUNCTION public.is_cluevoyance_admin()  RETURNS boolean  LANGUAGE sql  STABLE SECURITY DEFINER  SET search_path TO 'public' AS $function$   select exists (select 1 from public.admins ad where ad.user_id = public.cluevoyance_uid()) $function$  |
| my_account |  | TABLE(user_id uuid, global_user_id text, email text, created_at timestamp with time zone, imported_losses integer) | true | sql | CREATE OR REPLACE FUNCTION public.my_account()  RETURNS TABLE(user_id uuid, global_user_id text, email text, created_at timestamp with time zone, imported_losses integer)  LANGUAGE sql  STABLE SECURITY DEFINER  SET search_path TO 'public' AS $function$   select a.user_id, a.global_user_id, public.ac |
| ping |  | boolean | false | sql | CREATE OR REPLACE FUNCTION public.ping()  RETURNS boolean  LANGUAGE sql  STABLE  SET search_path TO 'public' AS $function$ select true $function$  |
| record_play | _puzzle_id bigint, _solved boolean, _lives_used integer, _difficulty text | TABLE(outcome text) | true | plpgsql | CREATE OR REPLACE FUNCTION public.record_play(_puzzle_id bigint, _solved boolean, _lives_used integer, _difficulty text)  RETURNS TABLE(outcome text)  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public' AS $function$ declare   _uid uuid := public.cluevoyance_uid(); begin   if _uid is nul |
| upsert_play | _uid uuid, _puzzle_id bigint, _solved boolean, _lives_used integer, _difficulty text, _finished_at timestamp with time zone, _source text | text | true | plpgsql | CREATE OR REPLACE FUNCTION public.upsert_play(_uid uuid, _puzzle_id bigint, _solved boolean, _lives_used integer, _difficulty text, _finished_at timestamp with time zone, _source text)  RETURNS text  LANGUAGE plpgsql  SECURITY DEFINER  SET search_path TO 'public' AS $function$ declare   _date date;  |

## triggers

_none_

## event_triggers

| evtname | evtevent | function |
| --- | --- | --- |
| issue_graphql_placeholder | sql_drop | set_graphql_placeholder |
| issue_pg_cron_access | ddl_command_end | grant_pg_cron_access |
| issue_pg_graphql_access | ddl_command_end | grant_pg_graphql_access |
| issue_pg_net_access | ddl_command_end | grant_pg_net_access |
| pgrst_ddl_watch | ddl_command_end | pgrst_ddl_watch |
| pgrst_drop_watch | sql_drop | pgrst_drop_watch |

## policies

| tablename | policyname | permissive | roles | cmd | qual | with_check |
| --- | --- | --- | --- | --- | --- | --- |
| plays | plays_read_own | PERMISSIVE | {authenticated} | SELECT | (user_id = cluevoyance_uid()) |  |
| puzzles | puzzles_admin_delete | PERMISSIVE | {authenticated} | DELETE | is_cluevoyance_admin() |  |
| puzzles | puzzles_admin_insert | PERMISSIVE | {authenticated} | INSERT |  | is_cluevoyance_admin() |
| puzzles | puzzles_admin_update | PERMISSIVE | {authenticated} | UPDATE | is_cluevoyance_admin() | is_cluevoyance_admin() |
| puzzles | puzzles_read_all | PERMISSIVE | {anon,authenticated} | SELECT | true |  |
| wordbank | wordbank_admin_delete | PERMISSIVE | {authenticated} | DELETE | is_cluevoyance_admin() |  |
| wordbank | wordbank_admin_insert | PERMISSIVE | {authenticated} | INSERT |  | is_cluevoyance_admin() |
| wordbank | wordbank_admin_update | PERMISSIVE | {authenticated} | UPDATE | is_cluevoyance_admin() | is_cluevoyance_admin() |
| wordbank | wordbank_read_all | PERMISSIVE | {anon,authenticated} | SELECT | true |  |

## rls

| table_name | rls_enabled | rls_forced |
| --- | --- | --- |
| accounts | true | false |
| admins | true | false |
| plays | true | false |
| puzzles | true | false |
| wordbank | true | false |

## table_grants

| table_name | grantee | privileges |
| --- | --- | --- |
| accounts | postgres | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |
| accounts | service_role | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |
| admins | postgres | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |
| admins | service_role | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |
| plays | authenticated | SELECT |
| plays | postgres | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |
| plays | service_role | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |
| puzzles | anon | SELECT |
| puzzles | authenticated | DELETE,INSERT,SELECT,UPDATE |
| puzzles | postgres | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |
| puzzles | service_role | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |
| wordbank | anon | SELECT |
| wordbank | authenticated | DELETE,INSERT,SELECT,UPDATE |
| wordbank | postgres | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |
| wordbank | service_role | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |

## function_grants

| routine_name | grantee | privilege_type |
| --- | --- | --- |
| account_email | postgres | EXECUTE |
| account_email | service_role | EXECUTE |
| cluevoyance_uid | anon | EXECUTE |
| cluevoyance_uid | authenticated | EXECUTE |
| cluevoyance_uid | postgres | EXECUTE |
| cluevoyance_uid | service_role | EXECUTE |
| delete_local_account | postgres | EXECUTE |
| delete_local_account | service_role | EXECUTE |
| delete_my_account | authenticated | EXECUTE |
| delete_my_account | postgres | EXECUTE |
| delete_my_account | service_role | EXECUTE |
| ensure_account | authenticated | EXECUTE |
| ensure_account | postgres | EXECUTE |
| ensure_account | service_role | EXECUTE |
| import_plays | authenticated | EXECUTE |
| import_plays | postgres | EXECUTE |
| import_plays | service_role | EXECUTE |
| is_cluevoyance_admin | anon | EXECUTE |
| is_cluevoyance_admin | authenticated | EXECUTE |
| is_cluevoyance_admin | postgres | EXECUTE |
| is_cluevoyance_admin | service_role | EXECUTE |
| my_account | authenticated | EXECUTE |
| my_account | postgres | EXECUTE |
| my_account | service_role | EXECUTE |
| ping | anon | EXECUTE |
| ping | authenticated | EXECUTE |
| ping | postgres | EXECUTE |
| ping | service_role | EXECUTE |
| record_play | authenticated | EXECUTE |
| record_play | postgres | EXECUTE |
| record_play | service_role | EXECUTE |
| upsert_play | postgres | EXECUTE |
| upsert_play | service_role | EXECUTE |

## extensions

| extname | extversion |
| --- | --- |
| pg_stat_statements | 1.11 |
| pgcrypto | 1.3 |
| plpgsql | 1.0 |
| supabase_vault | 0.3.1 |
| uuid-ossp | 1.1 |

## migration_ledger

| version | name |
| --- | --- |
| 0001 | 0001_cluevoyance_baseline |

## auth_users

_none_

## storage_buckets

_none_

## storage_objects_count

| objects |
| --- |
| 0 |
