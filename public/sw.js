// Service worker minimal : requis par Chrome pour rendre l application installable.
// Volontairement sans cache : les donnees viennent de Convex en temps reel, un cache
// servirait des soldes ou des courts perimes.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
