#!/usr/bin/env node
/**
 * Wire the shared sign-in into Cluevoyance's Supabase Auth as the custom OIDC
 * provider `custom:platform`. Ported from Rainbow (puzzle-connect-daily,
 * e2e/scripts/workos-local.ts and workos-hosted-beta.ts), with the project
 * ref, application name and key names as parameters so game #3 can reuse it.
 *
 *   LOCAL stack (supabase/config.toml; Phase 1):
 *     npm run workos -- local register --authkit-domain <name>-staging.authkit.app
 *     npm run workos -- local wire
 *         a disposable WorkOS STAGING application for the local stack's callback (manual smoke only)
 *     npm run workos -- local status | remove
 *
 *   HOSTED project (Phase 2, owner-approved; never run in Phase 1):
 *     npm run workos -- hosted register --authkit-domain <name>-staging.authkit.app
 *     npm run workos -- hosted wire
 *     npm run workos -- hosted allow-callback --url https://cluevoyance.com/auth/callback
 *     npm run workos -- hosted status | remove
 *
 * Credentials, all from the shell, none written anywhere by this tool:
 *   WORKOS_STAGING_API_KEY              WorkOS Staging API key (register/remove); sk_…
 *   CLUEVOYANCE_PROJECT_REF             the hosted project ref (hosted commands only)
 *   CLUEVOYANCE_HOSTED_SERVICE_ROLE_KEY the hosted project's service-role key (hosted wire/status/remove)
 *   SUPABASE_ACCESS_TOKEN               Supabase personal access token (hosted allow-callback)
 *   CLUEVOYANCE_WORKOS_WRITE=yes        required by every command that creates/deletes anything in WorkOS
 *   CLUEVOYANCE_HOSTED_WRITE=yes        required by every command that changes the hosted project
 * State: .runtime/workos-<local|hosted>.json (git-ignored): application id, client id, client secret.
 *
 * Guards: the AuthKit domain must be *.authkit.app, must contain "staging" and must not be the
 * Production domain; the redirect is always exactly the target stack's GoTrue callback; the local
 * target must be a loopback address; the hosted target is named only by CLUEVOYANCE_PROJECT_REF.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_DIR = path.join(ROOT, ".runtime");
const WORKOS_API = "https://api.workos.com";
const SUPABASE_MANAGEMENT = "https://api.supabase.com";
const PROVIDER_ID = "custom:platform";
const APP_NAMES = { local: "cluevoyance-local", hosted: "cluevoyance-beta" };
const FORBIDDEN_DOMAINS = ["obedient-book-17.authkit.app"]; // the proof's Production environment

const stateFile = (target) => path.join(RUNTIME_DIR, `workos-${target}.json`);
const readState = (target) => (existsSync(stateFile(target)) ? JSON.parse(readFileSync(stateFile(target), "utf8")) : null);

function env(name, pattern, hint) {
  const v = (process.env[name] ?? "").trim();
  if (!pattern.test(v)) throw new Error(`${name} is missing or malformed (${hint}). Export it in this shell only.`);
  return v;
}
const requireWorkosWrite = () => { if (process.env.CLUEVOYANCE_WORKOS_WRITE !== "yes") throw new Error("REFUSING: this creates or deletes something in WorkOS; set CLUEVOYANCE_WORKOS_WRITE=yes."); };
const requireHostedWrite = () => { if (process.env.CLUEVOYANCE_HOSTED_WRITE !== "yes") throw new Error("REFUSING: this changes the hosted project; set CLUEVOYANCE_HOSTED_WRITE=yes."); };

function checkDomain(domain) {
  const d = (domain ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]+\.authkit\.app$/.test(d)) throw new Error(`"${domain}" is not an AuthKit domain.`);
  if (FORBIDDEN_DOMAINS.includes(d)) throw new Error(`REFUSING: ${d} is WorkOS Production. Staging only.`);
  if (!/staging/.test(d)) throw new Error(`REFUSING: ${d} does not look like the Staging environment's domain.`);
  return d;
}

/**
 * The Staging API key: from the shell (WORKOS_STAGING_API_KEY), or from the
 * git-ignored file .runtime/workos-staging-key.txt (the owner saves it there
 * for one command and deletes it again). Never printed, never written by this tool.
 */
function stagingApiKey() {
  const fromEnv = (process.env.WORKOS_STAGING_API_KEY ?? "").trim();
  if (fromEnv) {
    if (!/^sk_/.test(fromEnv)) throw new Error("WORKOS_STAGING_API_KEY is not a WorkOS API key (sk_…).");
    return fromEnv;
  }
  const file = path.join(RUNTIME_DIR, "workos-staging-key.txt");
  if (existsSync(file)) {
    const fromFile = readFileSync(file, "utf8").trim();
    if (!/^sk_/.test(fromFile)) throw new Error(`${path.relative(ROOT, file)} does not hold a WorkOS API key (sk_…).`);
    return fromFile;
  }
  throw new Error("No Staging API key: export WORKOS_STAGING_API_KEY in this shell, or save it to .runtime/workos-staging-key.txt (git-ignored).");
}

async function workos(method, urlPath, body) {
  const key = stagingApiKey();
  const res = await fetch(`${WORKOS_API}${urlPath}`, { method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json };
}

// ── targets ──
function localTarget() {
  const out = execSync("npx supabase status -o json", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const json = JSON.parse(out.slice(out.indexOf("{")));
  const host = new URL(json.API_URL).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error(`REFUSING: ${json.API_URL} is not a local stack.`);
  return { apiUrl: json.API_URL, serviceKey: json.SERVICE_ROLE_KEY };
}
function hostedTarget() {
  const ref = env("CLUEVOYANCE_PROJECT_REF", /^[a-z]{20}$/, "the 20-letter project ref");
  const key = env("CLUEVOYANCE_HOSTED_SERVICE_ROLE_KEY", /^(sb_secret_|eyJ)/, "the project's service-role key");
  return { ref, apiUrl: `https://${ref}.supabase.co`, serviceKey: key };
}
const target = (name) => (name === "local" ? localTarget() : hostedTarget());
const callbackOf = (t) => `${t.apiUrl}/auth/v1/callback`;

function providers(t) {
  const client = createClient(t.apiUrl, t.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return client.auth.admin.customProviders;
}

async function installProvider(t, { issuer, clientId, clientSecret }) {
  const p = providers(t);
  await p.deleteProvider(PROVIDER_ID).catch(() => undefined);
  const result = await p.createProvider({
    provider_type: "oidc",
    identifier: PROVIDER_ID,
    name: "Shared account",
    client_id: clientId,
    client_secret: clientSecret,
    issuer,
    scopes: ["openid", "email", "profile"],
    pkce_enabled: true,
  });
  if (result.error) throw new Error(`provider NOT installed: ${result.error.message}`);
}

// ── commands ──
async function register(name, domainArg) {
  const domain = checkDomain(domainArg);
  requireWorkosWrite();
  if (name === "hosted") requireHostedWrite();
  const t = target(name);
  const redirectUri = callbackOf(t);
  if (readState(name)) throw new Error(`${stateFile(name)} exists; run \`${name} remove\` first.`);
  const discovery = await fetch(`https://${domain}/.well-known/openid-configuration`).then((r) => r.json()).catch(() => null);
  if (!discovery?.issuer) throw new Error(`No OpenID discovery document at https://${domain}`);

  const created = await workos("POST", "/connect/applications", {
    name: APP_NAMES[name],
    application_type: "oauth",
    description: `Cluevoyance ${name === "local" ? "LOCAL smoke-test stack only. Safe to delete." : "hosted beta (WorkOS Staging)."}`,
    redirect_uris: [{ uri: redirectUri, default: true }],
    uses_pkce: false,
    is_first_party: true,
  });
  if (created.status >= 300 || !created.json?.id) throw new Error(`WorkOS refused the application: HTTP ${created.status} ${JSON.stringify(created.json).slice(0, 400)}`);
  const appId = created.json.id;
  const clientId = created.json.client_id ?? created.json.id;
  const secret = await workos("POST", `/connect/applications/${appId}/client_secrets`, {});
  const clientSecret = secret.json?.secret ?? secret.json?.client_secret ?? secret.json?.value;
  if (secret.status >= 300 || !clientSecret) throw new Error(`Application created (${appId}) but no secret was issued: HTTP ${secret.status}. Remove it in the dashboard.`);

  mkdirSync(RUNTIME_DIR, { recursive: true });
  writeFileSync(stateFile(name), JSON.stringify({ authkitDomain: domain, applicationId: appId, clientId, clientSecret, redirectUri, registeredAt: new Date().toISOString() }, null, 2));
  console.log(`registered ${APP_NAMES[name]} (${appId}) with redirect ${redirectUri}; state in ${path.relative(ROOT, stateFile(name))} (git-ignored)`);
}

async function wire(name) {
  const state = readState(name);
  if (!state) throw new Error("Nothing registered. Run `register` first.");
  if (name === "hosted") requireHostedWrite();
  const t = target(name);
  if (state.redirectUri !== callbackOf(t)) throw new Error(`The registered redirect ${state.redirectUri} is not this target's callback. STOPPING.`);
  await installProvider(t, { issuer: `https://${state.authkitDomain}`, clientId: state.clientId, clientSecret: state.clientSecret });
  console.log(`installed ${PROVIDER_ID} (issuer https://${state.authkitDomain}) in ${name === "local" ? t.apiUrl : t.ref}`);
  console.log(`Build-time value: VITE_PLATFORM_DISCOVERY_URL=https://${state.authkitDomain}/.well-known/openid-configuration`);
}

async function allowCallback(url) {
  if (!url || !/^https:\/\/[a-z0-9.-]+\/auth\/callback$/.test(url)) throw new Error("allow-callback needs --url https://<site>/auth/callback");
  requireHostedWrite();
  const { ref } = hostedTarget();
  const tokenFile = path.join(RUNTIME_DIR, "supabase-access-token.txt");
  const token = existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : env("SUPABASE_ACCESS_TOKEN", /^sbp_/, "sbp_…");
  if (!/^sbp_/.test(token)) throw new Error("the saved Supabase access token is malformed");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const current = await fetch(`${SUPABASE_MANAGEMENT}/v1/projects/${ref}/config/auth`, { headers }).then((r) => r.json());
  const list = (current.uri_allow_list ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.includes(url)) { console.log(`already allowed: ${url}`); return; }
  const next = [...list, url].join(",");
  const res = await fetch(`${SUPABASE_MANAGEMENT}/v1/projects/${ref}/config/auth`, { method: "PATCH", headers, body: JSON.stringify({ uri_allow_list: next }) });
  if (res.status >= 300) throw new Error(`PATCH refused: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  console.log(`redirect allow-list is now: ${next}`);
}

async function status(name) {
  const state = readState(name);
  console.log(state ? `registered: ${APP_NAMES[name]} ${state.applicationId} → ${state.redirectUri} (issuer https://${state.authkitDomain})` : "nothing registered");
  const t = target(name);
  const list = await providers(t).listProviders().catch((e) => ({ error: e }));
  console.log(`${name} custom providers: ${JSON.stringify(list.data?.providers?.map((p) => ({ identifier: p.identifier, issuer: p.issuer })) ?? list.error?.message ?? list.error)}`);
}

async function remove(name) {
  if (name === "hosted") requireHostedWrite();
  const t = target(name);
  await providers(t).deleteProvider(PROVIDER_ID).catch(() => undefined);
  console.log(`removed ${PROVIDER_ID} from ${name}`);
  const state = readState(name);
  if (state) {
    requireWorkosWrite();
    const del = await workos("DELETE", `/connect/applications/${state.applicationId}`);
    console.log(`WorkOS application ${state.applicationId}: HTTP ${del.status}`);
    unlinkSync(stateFile(name));
  }
}

async function main() {
  const [name, command, ...rest] = process.argv.slice(2);
  const arg = (flag) => { const i = rest.indexOf(flag); return i >= 0 ? rest[i + 1] : undefined; };
  if (!["local", "hosted"].includes(name)) throw new Error("usage: node tools/workos.mjs <local|hosted> <register|wire|allow-callback|status|remove> [--authkit-domain X] [--url X]");
  switch (command) {
    case "register": return register(name, arg("--authkit-domain"));
    case "wire": return wire(name);
    case "allow-callback": if (name !== "hosted") throw new Error("allow-callback is hosted only (local uses config.toml)"); return allowCallback(arg("--url"));
    case "status": return status(name);
    case "remove": return remove(name);
    default: throw new Error(`unknown command ${command}`);
  }
}

main().then(() => process.exit(0), (e) => { console.error(`\n${e instanceof Error ? e.message : String(e)}\n`); process.exit(1); });
