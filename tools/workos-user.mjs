#!/usr/bin/env node
/**
 * Look at, and (when explicitly approved) change, ONE user in the WorkOS
 * STAGING environment through the User Management API. Used once, to move
 * the beta test identity to its final email address without creating a
 * second global user.
 *
 *   node tools/workos-user.mjs find --email <address>        who (if anyone) holds this address; READ-ONLY
 *   node tools/workos-user.mjs show --id user_…               one user; READ-ONLY
 *   node tools/workos-user.mjs set-email --id user_… --email <address> [--verified]
 *         changes the email of that user (same user id, no new user). Needs CLUEVOYANCE_WORKOS_WRITE=yes.
 *         --verified marks the address verified (only when the owner has confirmed it is theirs).
 *
 * Credentials: the Staging API key from WORKOS_STAGING_API_KEY or the git-ignored
 * .runtime/workos-staging-key.txt. Never printed, never written.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.workos.com";

function apiKey() {
  const fromEnv = (process.env.WORKOS_STAGING_API_KEY ?? "").trim();
  const file = path.join(ROOT, ".runtime", "workos-staging-key.txt");
  const key = fromEnv || (existsSync(file) ? readFileSync(file, "utf8").trim() : "");
  if (!/^sk_/.test(key)) throw new Error("No Staging API key (WORKOS_STAGING_API_KEY or .runtime/workos-staging-key.txt).");
  return key;
}
async function workos(method, p, body) {
  const res = await fetch(`${API}${p}`, { method, headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json };
}
const brief = (u) => ({ id: u.id, email: u.email, email_verified: u.email_verified, first_name: u.first_name, last_name: u.last_name, created_at: u.created_at, updated_at: u.updated_at });

async function find(email) {
  if (!email) throw new Error("find needs --email");
  const r = await workos("GET", `/user_management/users?email=${encodeURIComponent(email)}&limit=10`);
  if (r.status >= 300) throw new Error(`HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  const users = r.json?.data ?? [];
  console.log(JSON.stringify({ email, matches: users.map(brief) }, null, 1));
}
async function show(id) {
  if (!/^user_/.test(id || "")) throw new Error("show needs --id user_…");
  const r = await workos("GET", `/user_management/users/${id}`);
  if (r.status >= 300) throw new Error(`HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  console.log(JSON.stringify(brief(r.json), null, 1));
}
async function setEmail(id, email, verified) {
  if (!/^user_/.test(id || "")) throw new Error("set-email needs --id user_…");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || "")) throw new Error("set-email needs --email <address>");
  if (process.env.CLUEVOYANCE_WORKOS_WRITE !== "yes") throw new Error("REFUSING: set-email changes a WorkOS user; set CLUEVOYANCE_WORKOS_WRITE=yes.");
  const taken = await workos("GET", `/user_management/users?email=${encodeURIComponent(email)}&limit=2`);
  const other = (taken.json?.data ?? []).find((u) => u.id !== id);
  if (other) throw new Error(`REFUSING: ${email} already belongs to ${other.id}.`);
  const before = await workos("GET", `/user_management/users/${id}`);
  if (before.status >= 300) throw new Error(`user ${id}: HTTP ${before.status}`);
  const body = { email };
  if (verified) body.email_verified = true;
  const r = await workos("PUT", `/user_management/users/${id}`, body);
  if (r.status >= 300) throw new Error(`PUT refused: HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
  console.log(JSON.stringify({ before: brief(before.json), after: brief(r.json) }, null, 1));
}

const [cmd, ...rest] = process.argv.slice(2);
const arg = (f) => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : undefined; };
const run = { find: () => find(arg("--email")), show: () => show(arg("--id")), "set-email": () => setEmail(arg("--id"), arg("--email"), rest.includes("--verified")) }[cmd];
if (!run) { console.error("usage: node tools/workos-user.mjs <find --email X | show --id user_… | set-email --id user_… --email X [--verified]>"); process.exit(2); }
run().then(() => process.exit(0), (e) => { console.error(`\n${e.message}\n`); process.exit(1); });
