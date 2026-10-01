/* Cut service worker — receives Web Push and shows the reminder, even when the
   app is fully closed.

   Payloads use the Declarative Web Push shape ({ web_push: 8030, notification:
   { title, body, navigate, app_badge } }). On iOS 18.4+ Home Screen apps the OS
   shows those itself and this handler doesn't run; everywhere else it does. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { body: event.data ? event.data.text() : "" };
  }
  // declarative shape, or the older flat { title, body }
  const n = payload.notification || payload;
  const url = n.navigate || n.url || "/";
  const badge = n.app_badge != null ? Number(n.app_badge) : null;

  const work = [
    self.registration.showNotification(n.title || "Cut", {
      body: n.body || "Time to log.",
      icon: "/icon",
      badge: "/icon",
      tag: n.tag || "cut-reminder",
      renotify: true,
      data: { url },
    }),
  ];
  if (badge != null && self.navigator && self.navigator.setAppBadge) {
    work.push((badge > 0 ? self.navigator.setAppBadge(badge) : self.navigator.clearAppBadge()).catch(() => {}));
  }
  event.waitUntil(Promise.all(work));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      // iOS sometimes cold-launches the app at the start page instead of `url`;
      // stash it so the app can route itself once it boots (see NavBridge).
      try {
        const cache = await caches.open("cut-nav");
        await cache.put("/__pending-nav", new Response(JSON.stringify({ url, at: Date.now() })));
      } catch (_) {}
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          client.postMessage({ type: "cut-navigate", url });
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
