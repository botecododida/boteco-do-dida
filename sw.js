/* Boteco do Dida - service worker
   App (mesma origem): busca na rede primeiro, cai no cache se estiver offline.
   Assim toda atualização publicada no GitHub chega na próxima vez que ela abrir com internet.
   Fontes do Google: cache primeiro (não mudam). */
var CACHE = "boteco-dida-v4";
var ASSETS = ["./", "./index.html", "./manifest.json",
  "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png",
  "./icon-maskable-192.png", "./icon-maskable-512.png"];

self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) { return cache.addAll(ASSETS); })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE; })
             .map(function(n) { return caches.delete(n); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

function isFont(url) {
  return url.indexOf("fonts.googleapis.com") > -1 || url.indexOf("fonts.gstatic.com") > -1;
}

self.addEventListener("fetch", function(e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = req.url;

  // Fontes: cache primeiro
  if (isFont(url)) {
    e.respondWith(
      caches.match(req).then(function(cached) {
        return cached || fetch(req).then(function(res) {
          if (res.ok || res.type === "opaque") {
            var copy = res.clone();
            caches.open(CACHE).then(function(c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
    return;
  }

  // Só cuida do próprio app
  if (!url.startsWith(self.location.origin)) return;

  // App: rede primeiro, cache se offline
  e.respondWith(
    fetch(req, { cache: "no-store" }).then(function(res) {
      if (res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function(c) { c.put(req, copy); });
      }
      return res;
    }).catch(function() {
      return caches.match(req, { ignoreSearch: true }).then(function(cached) {
        if (cached) return cached;
        if (req.mode === "navigate") return caches.match("./index.html");
      });
    })
  );
});
