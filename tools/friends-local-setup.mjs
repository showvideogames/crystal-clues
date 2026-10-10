// One-time local setup for trying Friends on this computer. Writes two
// git-ignored files if they don't exist yet:
//   supabase/.env        VAPID keys for the local push-dispatch function (optional push)
//   .env.friends-local   Vite settings pointing the app at the LOCAL stack, Friends on
// Then: npm run db:start && npm run db:reset && npm run friends:dev
//
// Sign-in: the shared sign-in only completes against a stack wired to WorkOS
// Staging (docs/WORKOS-SMOKE.md). Without that, the browser tests sign their
// test accounts in directly (tests/friends/browser.mjs); the Sign in button
// itself then reports that sign-in is unavailable.
import fs from "node:fs";
import webpush from "web-push";
import { stack } from "../tests/db/helpers.mjs";

let publicKey;
if (fs.existsSync("supabase/.env")) {
  publicKey = fs.readFileSync("supabase/.env", "utf8").match(/^VAPID_PUBLIC_KEY=(.+)$/m)?.[1];
  console.log("supabase/.env already exists — keeping its keys.");
} else {
  const keys = webpush.generateVAPIDKeys();
  publicKey = keys.publicKey;
  fs.writeFileSync("supabase/.env",
    `VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=mailto:local-dev@cluevoyance.test\n`);
  console.log("Wrote supabase/.env with fresh local VAPID keys.");
}

if (fs.existsSync(".env.friends-local")) {
  console.log(".env.friends-local already exists — leaving it alone.");
} else {
  const local = stack(); // refuses anything but a local stack
  const fromDotEnv = fs.existsSync(".env")
    ? fs.readFileSync(".env", "utf8").match(/^VITE_PLATFORM_DISCOVERY_URL=(.+)$/m)?.[1]?.trim()
    : "";
  fs.writeFileSync(".env.friends-local", [
    "# Friends on this computer. Points EVERYTHING (daily game, admin, friends)",
    "# at the local Supabase stack — never a hosted project.",
    `VITE_SUPABASE_URL=${local.apiUrl}`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${local.anonKey}`,
    "# The shared sign-in. A local stack is only wired to it after `npm run workos -- local wire`.",
    `VITE_PLATFORM_DISCOVERY_URL=${fromDotEnv || "http://127.0.0.1:9/not-wired/.well-known/openid-configuration"}`,
    "VITE_FRIENDS=1",
    `VITE_VAPID_PUBLIC_KEY=${publicKey}`,
    "",
  ].join("\n"));
  console.log("Wrote .env.friends-local.");
}
