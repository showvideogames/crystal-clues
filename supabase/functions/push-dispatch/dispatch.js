// Web-push dispatcher for the friend-puzzle notification outbox.
// Plain JavaScript so the Edge Function (Deno) and the Node tests share it.
//
//   db               a Supabase client created with the service-role key
//   sendNotification web-push's sendNotification (or a stand-in in tests)
//
// Each run queues any due streak reminders, then claims pending rows in
// small batches. The database retires stale rows before handing them out,
// drops device subscriptions the push service reports as gone (404/410),
// and retries other failures a few times before giving up.

const NEW_SUBSCRIPTION_GRACE_MS = 10 * 60 * 1000;

export async function dispatchPush({ db, sendNotification, maxRounds = 4, batchSize = 25 }) {
  const summary = { reminders: 0, sent: 0, skipped: 0, retry: 0, gone: 0 };

  const reminders = await db.rpc("enqueue_deadline_reminders");
  if (reminders.error) throw reminders.error;
  summary.reminders = reminders.data ?? 0;

  for (let round = 0; round < maxRounds; round++) {
    const { data: batch, error } = await db.rpc("claim_push_batch", { p_limit: batchSize });
    if (error) throw error;
    if (!batch?.length) break;

    for (const item of batch) {
      const payload = JSON.stringify({ title: item.title, body: item.body, url: item.url, tag: item.tag });
      let delivered = false;
      let live = 0;
      let lastError = null;

      for (const sub of item.subscriptions || []) {
        try {
          await sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 60 * 60 * 24, urgency: item.kind === "reminder" ? "high" : "normal" },
          );
          delivered = true;
          live++;
          await db.rpc("push_endpoint_result", { p_endpoint: sub.endpoint, p_gone: false });
        } catch (err) {
          const status = err?.statusCode;
          // 410 means the device unsubscribed. A 404 can also come back for a
          // few moments after a brand-new subscription, so only trust it for
          // subscriptions older than a few minutes; before that, retry.
          const ageMs = Date.now() - new Date(sub.created_at || 0).getTime();
          if (status === 410 || (status === 404 && ageMs > NEW_SUBSCRIPTION_GRACE_MS)) {
            summary.gone++;
            await db.rpc("push_endpoint_result", { p_endpoint: sub.endpoint, p_gone: true });
          } else {
            live++;
          }
          lastError = `${status ?? "error"}: ${String(err?.body || err?.message || err).slice(0, 300)}`;
        }
      }

      // Nothing left to send to: retire it, keeping the push service's last reply.
      if (!delivered && live === 0) lastError = lastError ? `no_subscriptions (${lastError})` : "no_subscriptions";
      await db.rpc("finish_push", { p_id: item.id, p_ok: delivered, p_error: delivered ? null : lastError });
      if (delivered) summary.sent++;
      else if (lastError.startsWith("no_subscriptions")) summary.skipped++;
      else summary.retry++;
    }
  }
  return summary;
}
