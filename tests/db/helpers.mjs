// Shared setup for the database/API tests. Talks ONLY to the local Supabase
// stack from supabase/config.toml (started with `npm run db:start`, reset
// with `npm run db:reset`) and refuses anything else. Keys are read from
// `supabase status`, never from a committed file.
//
// Signing in without the shared sign-in service (Rainbow's technique,
// e2e/scripts/lib/seed-supabase.ts): an auth user is minted with the service
// key, a `custom:platform` identity row is inserted into auth.identities the
// way GoTrue would after a real OIDC round trip, and a session comes from the
// local GoTrue's password grant. The hosted sign-in page is never automated.

import { execFileSync, execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

let cfg = null;
export function stack() {
  if (cfg) return cfg;
  const out = execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const json = JSON.parse(out.slice(out.indexOf("{")));
  const apiUrl = json.API_URL;
  const host = new URL(apiUrl).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(`Refusing to run database tests against ${apiUrl}: local stack only.`);
  }
  cfg = { apiUrl, anonKey: json.ANON_KEY, serviceKey: json.SERVICE_ROLE_KEY, dbUrl: json.DB_URL };
  return cfg;
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const admin = () => createClient(stack().apiUrl, stack().serviceKey, opts);
export const anon = () => createClient(stack().apiUrl, stack().anonKey, opts);

/** Run SQL as postgres inside the local database container; returns stdout (rows as text, one per line). */
export function sql(text) {
  return execFileSync(
    "docker",
    ["exec", "-i", "supabase_db_cluevoyance", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", text],
    { encoding: "utf8" },
  ).trim();
}

const runId = Date.now().toString(36);
let seq = 0;
export const uniqueEmail = (name) => `${name.toLowerCase()}.${runId}.${++seq}@cluevoyance.test`;
export const uniqueGlobalId = () => `user_${runId.toUpperCase().padEnd(8, "0")}${String(++seq).padStart(18, "0")}`.slice(0, 31);

/** An auth user with a password (so the local GoTrue can mint a session). NOT yet a Cluevoyance account. */
export async function createAuthUser(email = uniqueEmail("person")) {
  const password = `pw-${runId}-${seq}`;
  const created = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  return { id: created.data.user.id, email, password };
}

/** Exactly what GoTrue writes after a real custom:platform sign-in: the identity row with the provider's subject. */
export function attachPlatformIdentity(userId, globalId, email) {
  const data = JSON.stringify({ sub: globalId, email, email_verified: true });
  sql(`insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
       values (gen_random_uuid(), '${userId}', '${data.replace(/'/g, "''")}'::jsonb, 'custom:platform', '${globalId}', now(), now(), now())`);
}

/** Change the email the provider reports (what a later sign-in after an email change at WorkOS does). */
export function setPlatformIdentityEmail(userId, email) {
  sql(`update auth.identities set identity_data = identity_data || '{"email":"${email}"}'::jsonb, updated_at = now()
        where user_id = '${userId}' and provider = 'custom:platform'`);
}

export async function signIn(user) {
  const client = anon();
  const res = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (res.error) throw res.error;
  return client;
}

/** Calls an RPC; throws on transport/SQL error; returns the first row (or scalar). */
export async function rpc(client, fn, args = {}) {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    const e = new Error(error.message);
    e.code = error.code;
    throw e;
  }
  return Array.isArray(data) ? data[0] : data;
}

/** Calls an RPC expecting an error; returns the error (or throws if it succeeded). */
export async function rpcError(client, fn, args = {}) {
  const { error } = await client.rpc(fn, args);
  if (!error) throw new Error(`${fn} unexpectedly succeeded`);
  return error;
}

/** A full Cluevoyance account: auth user + custom:platform identity + ensure_account(). */
export async function makeAccount(name = "player", globalId = uniqueGlobalId()) {
  const user = await createAuthUser(uniqueEmail(name));
  attachPlatformIdentity(user.id, globalId, user.email);
  const client = await signIn(user);
  const row = await rpc(client, "ensure_account");
  if (row.outcome !== "ok") throw new Error(`ensure_account: ${row.outcome}`);
  return { ...user, globalId, client, account: row };
}

export function puzzleIds() {
  return sql("select id from public.puzzles order by date desc").split("\n").filter(Boolean).map(Number);
}

export function grantAdmin(userId) {
  sql(`insert into public.admins (user_id) values ('${userId}') on conflict do nothing`);
}

export function count(table, where = "true") {
  return Number(sql(`select count(*) from ${table} where ${where}`));
}
