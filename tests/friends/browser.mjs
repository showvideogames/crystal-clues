// Browser-test helpers shared by the Friends and daily smoke runs.
//
// Signing a test account into a real browser: the hosted sign-in page refuses
// automated browsers by design (docs/WORKOS-SMOKE.md), so the account is
// minted exactly as the account tests do (auth user + custom:platform
// identity + ensure_account, tests/db/helpers.mjs) and its session is put
// where the app's one Supabase client keeps it (cv-auth), which is what the
// /auth/callback page leaves behind after a real sign-in. Test code only;
// the app has no such path.
import fs from "node:fs";
import { makeAccount, signIn } from "../db/helpers.mjs";

export const APP_URL = process.env.FRIENDS_E2E_URL || "http://127.0.0.1:5186";
export const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p));

export { makeAccount };

/** A fresh session for an account (as a new sign-in would give). */
export async function freshSession(acct) {
  const client = await signIn(acct);
  const { data } = await client.auth.getSession();
  return data.session;
}

/** Leaves `page` signed in as `acct`, landing on `path` the way the callback returns a player. */
export async function signInBrowser(page, acct, path = "/") {
  const session = await freshSession(acct);
  if (!page.url().startsWith(APP_URL)) await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => localStorage.setItem("cv-auth", JSON.stringify(s)), session);
  await page.goto(`${APP_URL}${path}`, { waitUntil: "networkidle0" });
  await page.waitForSelector('[data-testid="account-menu-button"]', { timeout: 15000 });
}

/** The header's account menu → Sign out. */
export async function signOutBrowser(page) {
  await page.locator('[data-testid="account-menu-button"]').click();
  await page.locator('[data-testid="sign-out"]').click();
  await page.waitForSelector('[data-testid="platform-sign-in"]', { timeout: 15000 });
}
