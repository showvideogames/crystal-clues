// Sends queued friend-puzzle notifications (see dispatch.js).
//
// Woken only by the database (migration 20261012090000_friend_push_wakeup):
// right after a notification is queued, and hourly for retries and the
// optional streak reminder. Every call must carry the shared secret in
// x-dispatch-secret; anything else is refused, so no browser can run it.
// Deployed without Supabase's JWT check for that reason (config.toml).
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: URL),
//          PUSH_DISPATCH_SECRET (the same value as the Vault's push_dispatch_secret).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { dispatchPush } from "./dispatch.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Compares without leaking how much of the secret matched.
function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("PUSH_DISPATCH_SECRET");
  if (req.method !== "POST" || !secret || !sameSecret(req.headers.get("x-dispatch-secret") ?? "", secret)) {
    return json({ error: "forbidden" }, 403);
  }

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return json({ skipped: "web push is not configured" });
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "https://cluevoyance.com", publicKey, privateKey);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const summary = await dispatchPush({
      db,
      sendNotification: (sub: unknown, payload: string, options: unknown) =>
        webpush.sendNotification(sub as webpush.PushSubscription, payload, options as webpush.RequestOptions),
    });
    return json(summary);
  } catch (err) {
    console.error("push-dispatch failed", err);
    return json({ error: "dispatch failed" }, 500);
  }
});
