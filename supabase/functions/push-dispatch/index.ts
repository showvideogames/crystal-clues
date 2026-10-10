// Sends queued friend-puzzle notifications (see dispatch.js).
//
// Called fire-and-forget by the app right after a puzzle is sent or
// finished, and on a schedule (pg_cron, every few minutes) so streak
// reminders go out and failed sends are retried. It reads only the outbox,
// so letting any signed-in player nudge it is harmless.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: URL).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { dispatchPush } from "./dispatch.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return json({ skipped: "web push is not configured" });
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:hello@example.com", publicKey, privateKey);

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
