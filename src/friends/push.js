// Optional web push for friend puzzles. Nothing here runs until the player
// chooses to turn notifications on, and nothing here can block play: every
// failure ends up as a state the settings card explains.
import { VAPID_PUBLIC_KEY } from "../game/config";
import { api } from "./client";

const isIOS = () => {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
};
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

// available | ios-home-screen | unsupported | denied | unconfigured
export function pushSupport() {
  if (!VAPID_PUBLIC_KEY) return "unconfigured";
  const hasApis = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // iPhone and iPad only allow web push for a site added to the Home Screen
  // (iOS 16.4+) and opened from there.
  if (isIOS() && !isStandalone()) return "ios-home-screen";
  if (!hasApis || !window.isSecureContext) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "available";
}

async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.getRegistration("/");
}

export async function currentSubscription() {
  try {
    const reg = await registration();
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

const toKey = (base64) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

async function saveSubscription(sub) {
  const json = sub.toJSON();
  await api.savePush({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
}

// Called only from the player's own tap on "Turn on notifications".
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "dismissed";
  const reg = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) }));
  await saveSubscription(sub);
  return "on";
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  try {
    await api.deletePush(sub.endpoint);
  } finally {
    await sub.unsubscribe().catch(() => {});
  }
}

// If this device already has permission and a subscription, make sure it is
// attached to whoever is signed in now (a shared iPad, a new account).
export async function refreshSubscription() {
  if (pushSupport() !== "available" || Notification.permission !== "granted") return false;
  const sub = await currentSubscription();
  if (!sub) return false;
  await saveSubscription(sub).catch(() => {});
  return true;
}
