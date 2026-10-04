# Hosted inventory qszqparrqyhegfznyaby — 2026-10-04T15:03:27.828Z

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
| puzzles | puzzles_pkey | p | PRIMARY KEY (id) |
| wordbank | wordbank_pkey | p | PRIMARY KEY (id) |
| wordbank | wordbank_word_key | u | UNIQUE (word) |

## indexes

| tablename | indexname | indexdef |
| --- | --- | --- |
| puzzles | puzzles_pkey | CREATE UNIQUE INDEX puzzles_pkey ON public.puzzles USING btree (id) |
| wordbank | wordbank_pkey | CREATE UNIQUE INDEX wordbank_pkey ON public.wordbank USING btree (id) |
| wordbank | wordbank_word_key | CREATE UNIQUE INDEX wordbank_word_key ON public.wordbank USING btree (word) |

## functions

_none_

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
| puzzles | Anyone can delete puzzles | PERMISSIVE | {anon} | DELETE | true |  |
| puzzles | Anyone can insert puzzles | PERMISSIVE | {anon} | INSERT |  | true |
| puzzles | Anyone can read puzzles | PERMISSIVE | {anon} | SELECT | true |  |
| puzzles | Anyone can update puzzles | PERMISSIVE | {anon} | UPDATE | true |  |
| wordbank | Anyone can delete wordbank | PERMISSIVE | {anon} | DELETE | true |  |
| wordbank | Anyone can insert wordbank | PERMISSIVE | {anon} | INSERT |  | true |
| wordbank | Anyone can read wordbank | PERMISSIVE | {anon} | SELECT | true |  |

## rls

| table_name | rls_enabled | rls_forced |
| --- | --- | --- |
| puzzles | true | false |
| wordbank | true | false |

## table_grants

| table_name | grantee | privileges |
| --- | --- | --- |
| puzzles | anon | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |
| puzzles | authenticated | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |
| puzzles | postgres | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |
| puzzles | service_role | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |
| wordbank | anon | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |
| wordbank | authenticated | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |
| wordbank | postgres | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |
| wordbank | service_role | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE |

## function_grants

_none_

## extensions

| extname | extversion |
| --- | --- |
| pg_stat_statements | 1.11 |
| pgcrypto | 1.3 |
| plpgsql | 1.0 |
| supabase_vault | 0.3.1 |
| uuid-ossp | 1.1 |

## migration_ledger

```
{"error":"POST /v1/projects/qszqparrqyhegfznyaby/database/query → HTTP 400 {\"message\":\"Failed to run sql query: ERROR:  42P01: relation \\\"supabase_migrations.schema_migrations\\\" does not exist\\nLINE 1: select version, name from supabase_migrations.schema_migrations order by version\\n                                  ^\\n\"}"}
```

## auth_users

_none_

## storage_buckets

_none_

## storage_objects_count

| objects |
| --- |
| 0 |
