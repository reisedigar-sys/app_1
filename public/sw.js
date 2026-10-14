// Service worker do Hora do Pet: avisos por push (semana 7). Não guarda páginas em cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = { corpo: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(dados.titulo || "Hora do Pet", {
      body: dados.corpo || "",
      icon: dados.icone || "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: dados.url || "/conta/agendamentos" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url === url && "focus" in j) return j.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
