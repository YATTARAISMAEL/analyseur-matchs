const CACHE = "analyseur-v9";
const SHELL = ["./", "index.html", "styles.css", "app.js", "teams.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.hostname.includes("api-sports.io")) return; // les résultats viennent toujours d'internet
  const mine = url.origin === location.origin;
  if (mine) {
    // fichiers de l'appli : d'abord internet (pour avoir les mises à jour), sinon la copie gardée
    e.respondWith(fetch(e.request).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return res; })
      .catch(() => caches.match(e.request).then(h => h || caches.match("index.html"))));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && (url.hostname.includes("fonts.") || url.hostname.includes("jsdelivr"))) { const c = res.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); }
    return res;
  })));
});
