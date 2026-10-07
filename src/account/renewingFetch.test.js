import { describe, expect, it, vi } from "vitest";
import { renewingFetch } from "./renewingFetch.js";

const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const pass = (sub) => `${b64({ alg: "ES256" })}.${b64({ sub, role: "authenticated" })}.sig`;
const REST = "https://p.supabase.co/rest/v1/puzzles?date=eq.2026-10-07";
const UPLOAD = "https://p.supabase.co/storage/v1/object/images/a.png";
const expiredRest = () => new Response('{"code":"PGRST303","message":"JWT expired"}', { status: 401 });
// Storage's way: HTTP 400, the real reason in the body.
const expiredStorage = () => new Response('{"statusCode":"403","error":"InvalidJWT","message":"\\"exp\\" claim timestamp check failed"}', { status: 400 });
const ok = () => new Response("[]", { status: 200 });
const authOf = (init) => new Headers(init?.headers).get("Authorization");

describe("renewingFetch", () => {
  it("passes a normal answer straight through", async () => {
    const base = vi.fn(async () => ok());
    const renew = vi.fn();
    expect((await renewingFetch(renew, base)(REST, { headers: { Authorization: `Bearer ${pass("u1")}` } })).status).toBe(200);
    expect(renew).not.toHaveBeenCalled();
  });

  it("renews an expired pass and retries once, as the same user", async () => {
    const base = vi.fn().mockResolvedValueOnce(expiredRest()).mockResolvedValueOnce(ok());
    const renew = vi.fn(async () => ({ token: pass("u1") + "new", userId: "u1" }));
    const res = await renewingFetch(renew, base)(REST, { method: "PATCH", body: "{}", headers: { Authorization: `Bearer ${pass("u1")}`, apikey: "k" } });
    expect(res.status).toBe(200);
    expect(authOf(base.mock.calls[1][1])).toBe(`Bearer ${pass("u1")}new`);
    expect(new Headers(base.mock.calls[1][1].headers).get("apikey")).toBe("k");
    expect(base.mock.calls[1][1].body).toBe("{}");
  });

  it("retries an admin image upload that storage refused for an expired pass (its 400-with-the-reason-inside answer)", async () => {
    const image = new Blob(["png"]);
    const base = vi.fn().mockResolvedValueOnce(expiredStorage()).mockResolvedValueOnce(ok());
    const res = await renewingFetch(async () => ({ token: "fresh", userId: "admin" }), base)(UPLOAD, { method: "POST", body: image, headers: { Authorization: `Bearer ${pass("admin")}` } });
    expect(res.status).toBe(200);
    expect(base.mock.calls[1][1].body).toBe(image);
  });

  it("never retries as a different user (another tab switched who is signed in)", async () => {
    const base = vi.fn().mockResolvedValueOnce(expiredRest());
    const res = await renewingFetch(async () => ({ token: "other", userId: "u2" }), base)(REST, { headers: { Authorization: `Bearer ${pass("u1")}` } });
    expect(res.status).toBe(401);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("never touches a request signed with the public key", async () => {
    const base = vi.fn(async () => expiredRest());
    const renew = vi.fn();
    await renewingFetch(renew, base)(REST, { headers: { Authorization: "Bearer sb_publishable_x" } });
    expect(renew).not.toHaveBeenCalled();
  });

  it("leaves a refusal that is not about the pass alone (row-level security stays refused)", async () => {
    const base = vi.fn(async () => new Response('{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy"}', { status: 400 }));
    const renew = vi.fn();
    expect((await renewingFetch(renew, base)(UPLOAD, { headers: { Authorization: `Bearer ${pass("u1")}` } })).status).toBe(400);
    expect(renew).not.toHaveBeenCalled();
  });

  it("never retries the sign-in endpoints, so a renewal cannot loop", async () => {
    const base = vi.fn(async () => expiredRest());
    const renew = vi.fn();
    await renewingFetch(renew, base)("https://p.supabase.co/auth/v1/token?grant_type=refresh_token", { headers: { Authorization: `Bearer ${pass("u1")}` } });
    expect(renew).not.toHaveBeenCalled();
  });

  it("hands back the original answer when renewal is impossible", async () => {
    const base = vi.fn().mockResolvedValueOnce(expiredRest());
    expect((await renewingFetch(async () => null, base)(REST, { headers: { Authorization: `Bearer ${pass("u1")}` } })).status).toBe(401);
    const base2 = vi.fn().mockResolvedValueOnce(expiredRest());
    const failing = async () => {
      throw new Error("offline");
    };
    expect((await renewingFetch(failing, base2)(REST, { headers: { Authorization: `Bearer ${pass("u1")}` } })).status).toBe(401);
  });

  it("shares one renewal between requests that fail together", async () => {
    const base = vi.fn(async (_u, init) => (authOf(init) === "Bearer fresh" ? ok() : expiredRest()));
    let release;
    const renew = vi.fn(() => new Promise((r) => (release = r)));
    const f = renewingFetch(renew, base);
    const both = Promise.all([1, 2].map(() => f(REST, { headers: { Authorization: `Bearer ${pass("u1")}` } })));
    await vi.waitFor(() => expect(renew).toHaveBeenCalled());
    release({ token: "fresh", userId: "u1" });
    expect((await both).map((r) => r.status)).toEqual([200, 200]);
    expect(renew).toHaveBeenCalledTimes(1);
  });
});

describe("renewingFetch recognises the expiry wording alone", () => {
  it("retries on storage's message even without the word JWT", async () => {
    const body = '{"statusCode":"403","error":"Unauthorized","message":"\\"exp\\" claim timestamp check failed"}';
    const base = vi.fn().mockResolvedValueOnce(new Response(body, { status: 400 })).mockResolvedValueOnce(ok());
    const res = await renewingFetch(async () => ({ token: "fresh", userId: "u1" }), base)(UPLOAD, { method: "POST", headers: { Authorization: `Bearer ${pass("u1")}` } });
    expect(res.status).toBe(200);
  });
});
