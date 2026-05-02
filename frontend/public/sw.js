// JobRocket Service Worker — PWA notifications

const CACHE_NAME = "jobrocket-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  const { type, id, title, body, delay } = event.data ?? {};

  if (type === "SCHEDULE") {
    const fireAt = Date.now() + (delay ?? 0);
    setTimeout(() => {
      self.registration.showNotification(title ?? "JobRocket", {
        body: body ?? "",
        icon: "/next.svg",
        badge: "/next.svg",
        tag: id ?? "jobrocket",
        data: { url: "/scoring" },
      });
    }, Math.max(0, fireAt - Date.now()));
  }

  if (type === "SHOW_NOW") {
    self.registration.showNotification(title ?? "JobRocket", {
      body: body ?? "",
      icon: "/next.svg",
      badge: "/next.svg",
      tag: id ?? "jobrocket",
      data: { url: "/scoring" },
    });
  }

  if (type === "CANCEL") {
    self.registration.getNotifications({ tag: id }).then((list) =>
      list.forEach((n) => n.close())
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/scoring";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
