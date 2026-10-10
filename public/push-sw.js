// Cluevoyance push service worker. It only shows friend-puzzle
// notifications and opens the app when one is tapped — no caching, no
// fetch handling, so it never changes how the game itself loads.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(self.registration.showNotification(data.title || "Cluevoyance", {
    body: data.body || "Something new in Friends.",
    // Same tag replaces the older notice on the device instead of stacking.
    tag: data.tag || "cluevoyance-friends",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/?friends=1" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/?friends=1", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      try {
        await client.focus();
        await client.navigate(url);
        return;
      } catch {
        // Not controlled by this worker yet — open a fresh window instead.
      }
    }
    await self.clients.openWindow(url);
  })());
});
