// A fetch that never lets an expired sign-in pass reach the player as an error.
//
// The library renews the pass on a timer driven by the device's clock. On a
// device whose clock is wrong (an hour slow is enough) it believes the pass is
// still fresh while the server answers "JWT expired", and every request fails:
// today's puzzle, saves and admin writes. So: when a database or storage
// request comes back refused with a JWT complaint, renew the pass once (renewal
// does not depend on the clock) and retry with the new one.
//
// Retried only when it is safe:
//   * database (/rest/) and storage (/storage/) requests; the sign-in endpoints
//     pass straight through, so a renewal can never loop;
//   * requests signed with a user's pass, never the public key;
//   * when the renewed pass belongs to the SAME user as the refused one, so a
//     write signed for one user (the player row) can never go out as another
//     (for example after another tab switched who is signed in).
// If renewal is impossible the original answer is returned unchanged.

function subjectOf(authorization) {
  const token = String(authorization || "").replace(/^Bearer\s+/i, "");
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    return JSON.parse(json).sub ?? null;
  } catch {
    return null;
  }
}

/**
 * @param renew  async () => ({ token, userId } | null): renew the stored session
 * @param base   the underlying fetch
 */
export function renewingFetch(renew, base = (...a) => fetch(...a)) {
  let pending = null;
  // Several requests failing at once share one renewal.
  const renewOnce = () => {
    pending ??= Promise.resolve()
      .then(renew)
      .finally(() => {
        pending = null;
      });
    return pending;
  };

  return async (input, init) => {
    const res = await base(input, init);
    if (res.status !== 401 && res.status !== 400 && res.status !== 403) return res;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!/\/(rest|storage)\/v1\//.test(url)) return res;
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const sub = subjectOf(headers.get("Authorization"));
    if (!sub) return res; // the public key, or no pass at all: nothing to renew
    // Storage often answers 400 with the real reason in the body, so the body decides.
    const body = await res.clone().text().catch(() => "");
    if (!/jwt|token (is )?expired|exp\W{0,3}claim|timestamp check failed/i.test(body)) return res;

    const renewed = await renewOnce().catch(() => null);
    if (!renewed?.token || renewed.userId !== sub) return res;
    headers.set("Authorization", `Bearer ${renewed.token}`);
    return base(input instanceof Request ? input.clone() : input, { ...init, headers });
  };
}
