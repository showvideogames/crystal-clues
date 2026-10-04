#!/usr/bin/env node
/**
 * Read and (when explicitly approved) change the HOSTED Cluevoyance Supabase
 * project through the Supabase Management API. Modelled on Rainbow's
 * e2e/scripts/hosted-phase2.ts, cut down to what Phase 2 needs.
 *
 *   node tools/hosted.mjs inventory --out <dir>       schema inventory (tables, columns, constraints, indexes,
 *                                                     functions, triggers, policies, grants, auth users, migration
 *                                                     ledger, storage) as JSON + a Markdown summary. READ-ONLY.
 *   node tools/hosted.mjs counts                      content row counts and a content fingerprint. READ-ONLY.
 *   node tools/hosted.mjs export --out <dir>          puzzles + wordbank as JSONL (the backup). READ-ONLY.
 *   node tools/hosted.mjs sql --file <f>              run a SQL file inside BEGIN … ROLLBACK (rehearsal). READ-ONLY.
 *   node tools/hosted.mjs sql --file <f> --apply      run it for real (COMMIT). Needs CLUEVOYANCE_HOSTED_WRITE=yes
 *                                                     and --i-mean-the-hosted-cluevoyance-project.
 *   node tools/hosted.mjs auth-config                 the project's auth configuration (site url, allow-list, flags). READ-ONLY.
 *
 * Credentials, shell only:
 *   SUPABASE_ACCESS_TOKEN     a personal access token (sbp_…) of an account that is a member of the
 *                             Cluevoyance project's organisation; or the git-ignored file
 *                             .runtime/supabase-access-token.txt (preferred, wins over the shell)
 *   CLUEVOYANCE_PROJECT_REF   the project ref; named here and nowhere in the repository
 *   CLUEVOYANCE_HOSTED_WRITE  must be "yes" for --apply
 *
 * Every command prints the project ref and name it is talking to before doing anything.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.supabase.com";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN_FILE = path.join(ROOT, ".runtime", "supabase-access-token.txt");

function env(name, pattern, hint) {
  const v = (process.env[name] ?? "").trim();
  if (!pattern.test(v)) throw new Error(`${name} is missing or malformed (${hint}). Export it in this shell only.`);
  return v;
}
/** The personal access token: from the shell, or from the git-ignored .runtime/supabase-access-token.txt. Never printed. */
function token() {
  const fromEnv = (process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
  const fromFile = existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, "utf8").trim() : "";
  // the file wins when present: it is the one the owner saved for this project
  const t = fromFile || fromEnv;
  if (!/^sbp_/.test(t)) throw new Error("No Supabase personal access token: save one to .runtime/supabase-access-token.txt (git-ignored) or export SUPABASE_ACCESS_TOKEN.");
  return t;
}
const ref = () => env("CLUEVOYANCE_PROJECT_REF", /^[a-z]{20}$/, "the 20-letter project ref");
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

async function api(method, p, body) {
  const res = await fetch(`${API}${p}`, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 500) }; }
  if (res.status >= 300) throw new Error(`${method} ${p} → HTTP ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

/** Run SQL through the Management API's query endpoint. Returns the rows of the LAST statement. */
async function query(sql) {
  return api("POST", `/v1/projects/${ref()}/database/query`, { query: sql });
}

async function identify() {
  const p = await api("GET", `/v1/projects/${ref()}`);
  console.log(`hosted project: ${p.name} (${p.id ?? ref()}), region ${p.region}, status ${p.status}`);
  if ((p.id ?? ref()) !== ref()) throw new Error("project ref mismatch; STOPPING");
  return p;
}

const INVENTORY_QUERIES = {
  tables: `select table_schema, table_name, table_type from information_schema.tables
            where table_schema in ('public','auth','storage') and table_type='BASE TABLE' order by 1,2`,
  columns: `select table_schema, table_name, column_name, data_type, is_nullable, column_default, ordinal_position
             from information_schema.columns where table_schema='public' order by table_name, ordinal_position`,
  constraints: `select conrelid::regclass::text as table_name, conname, contype, pg_get_constraintdef(oid) as definition
                 from pg_constraint where connamespace='public'::regnamespace order by 1,2`,
  indexes: `select tablename, indexname, indexdef from pg_indexes where schemaname='public' order by 1,2`,
  functions: `select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as result,
                     p.prosecdef as security_definer, l.lanname, left(pg_get_functiondef(p.oid), 4000) as definition
                from pg_proc p join pg_language l on l.oid=p.prolang
               where p.pronamespace='public'::regnamespace order by 1,2`,
  triggers: `select event_object_table as table_name, trigger_name, action_timing, event_manipulation, action_statement
               from information_schema.triggers where trigger_schema='public' order by 1,2`,
  event_triggers: `select evtname, evtevent, evtfoid::regproc::text as function from pg_event_trigger order by 1`,
  policies: `select tablename, policyname, permissive, roles::text, cmd, qual, with_check from pg_policies where schemaname='public' order by 1,2`,
  rls: `select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
          from pg_class where relnamespace='public'::regnamespace and relkind='r' order by 1`,
  table_grants: `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
                   from information_schema.role_table_grants where table_schema='public'
                  group by table_name, grantee order by 1,2`,
  function_grants: `select routine_name, grantee, privilege_type from information_schema.role_routine_grants
                      where specific_schema='public' order by 1,2`,
  extensions: `select extname, extversion from pg_extension order by 1`,
  migration_ledger: `select version, name from supabase_migrations.schema_migrations order by version`,
  auth_users: `select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null as confirmed,
                      u.raw_app_meta_data->>'provider' as provider,
                      (select string_agg(i.provider, ',') from auth.identities i where i.user_id=u.id) as identities,
                      u.is_anonymous
                 from auth.users u order by u.created_at`,
  storage_buckets: `select id, name, public, created_at from storage.buckets order by 1`,
  storage_objects_count: `select count(*) as objects from storage.objects`,
};

async function inventory(outDir) {
  if (!outDir) throw new Error("inventory needs --out <dir>");
  await identify();
  mkdirSync(outDir, { recursive: true });
  const result = {};
  for (const [name, sql] of Object.entries(INVENTORY_QUERIES)) {
    try {
      result[name] = await query(sql);
    } catch (e) {
      result[name] = { error: String(e.message) };
    }
    console.log(`${name}: ${Array.isArray(result[name]) ? result[name].length + " rows" : "error"}`);
  }
  writeFileSync(path.join(outDir, "inventory.json"), JSON.stringify(result, null, 2));
  const md = [];
  md.push(`# Hosted inventory ${ref()} — ${new Date().toISOString()}`, "");
  for (const [name, rows] of Object.entries(result)) {
    md.push(`## ${name}`, "");
    if (!Array.isArray(rows)) { md.push("```", JSON.stringify(rows), "```", ""); continue; }
    if (!rows.length) { md.push("_none_", ""); continue; }
    const cols = Object.keys(rows[0]);
    md.push(`| ${cols.join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`);
    for (const r of rows) md.push(`| ${cols.map((c) => String(r[c] ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 300)).join(" | ")} |`);
    md.push("");
  }
  writeFileSync(path.join(outDir, "inventory.md"), md.join("\n"));
  console.log(`written ${outDir}/inventory.json and inventory.md`);
}

async function counts() {
  await identify();
  const rows = await query(`
    select 'puzzles' as t, count(*)::int as rows, count(*) filter (where status='published')::int as published,
           min(date)::text as min_date, max(date)::text as max_date, md5(string_agg(id::text||'|'||coalesce(date::text,'')||'|'||coalesce(status,'')||'|'||coalesce(title,''), ',' order by id)) as fingerprint
      from public.puzzles
    union all
    select 'wordbank', count(*)::int, null, null, null, md5(string_agg(word, ',' order by word)) from public.wordbank`);
  console.log(JSON.stringify(rows, null, 1));
  return rows;
}

async function exportContent(outDir) {
  if (!outDir) throw new Error("export needs --out <dir>");
  await identify();
  mkdirSync(outDir, { recursive: true });
  const puzzles = await query("select * from public.puzzles order by id");
  const words = await query("select * from public.wordbank order by word");
  writeFileSync(path.join(outDir, "puzzles.jsonl"), puzzles.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(path.join(outDir, "wordbank.jsonl"), words.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`exported ${puzzles.length} puzzles and ${words.length} words to ${outDir}`);
}

async function runSql(file, apply, confirmed) {
  if (!file) throw new Error("sql needs --file <f>");
  await identify();
  const text = readFileSync(file, "utf8");
  if (apply) {
    if (process.env.CLUEVOYANCE_HOSTED_WRITE !== "yes") throw new Error("REFUSING: --apply needs CLUEVOYANCE_HOSTED_WRITE=yes");
    if (!confirmed) throw new Error("REFUSING: --apply needs --i-mean-the-hosted-cluevoyance-project");
    console.log(`APPLYING ${file} (${text.length} chars) to ${ref()} inside one transaction…`);
    const out = await query(`begin;\n${text}\ncommit;`);
    console.log(JSON.stringify(out, null, 1).slice(0, 4000));
    console.log("applied.");
  } else {
    console.log(`rehearsing ${file} (${text.length} chars) inside BEGIN … ROLLBACK on ${ref()}…`);
    const out = await query(`begin;\n${text}\nrollback;`);
    console.log(JSON.stringify(out, null, 1).slice(0, 4000));
    console.log("rehearsal complete; nothing was kept.");
  }
}

async function authConfig() {
  await identify();
  const c = await api("GET", `/v1/projects/${ref()}/config/auth`);
  const keep = ["site_url", "uri_allow_list", "mailer_autoconfirm", "external_email_enabled", "external_anonymous_users_enabled",
    "security_manual_linking_enabled", "disable_signup", "jwt_exp", "mailer_secure_email_change_enabled", "smtp_host", "smtp_sender_name"];
  console.log(JSON.stringify(Object.fromEntries(keep.map((k) => [k, c[k]])), null, 1));
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const arg = (f) => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : undefined; };
  switch (command) {
    case "inventory": return inventory(arg("--out"));
    case "counts": return counts();
    case "export": return exportContent(arg("--out"));
    case "sql": return runSql(arg("--file"), rest.includes("--apply"), rest.includes("--i-mean-the-hosted-cluevoyance-project"));
    case "auth-config": return authConfig();
    default: throw new Error("usage: node tools/hosted.mjs <inventory --out d | counts | export --out d | sql --file f [--apply --i-mean-the-hosted-cluevoyance-project] | auth-config>");
  }
}
main().then(() => process.exit(0), (e) => { console.error(`\n${e.message}\n`); process.exit(1); });
