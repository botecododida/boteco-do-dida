/* Boteco do Dida - service worker
   App (mesma origem): busca na rede primeiro, mas com prazo de 3 s. Com sinal fraco (comum
   no bar) a rede não falha, só demora: passado o prazo, abre com a cópia guardada, e a versão
   nova, quando chegar, fica guardada para a próxima abertura. Sem internet, abre na hora.
   Assim toda atualização publicada no GitHub chega na próxima vez que ela abrir com internet.
   Fontes do Google: cache primeiro (não mudam); sem cópia e com rede lenta, abre com a fonte
   do celular em vez de ficar esperando. */
var CACHE = "boteco-dida-v4";
var PRAZO = 3000;
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
      /* só apaga caches antigos deste app: outros apps publicados no mesmo
         endereço do GitHub Pages usam o mesmo armazenamento */
      return Promise.all(
        names.filter(function(n) { return n.indexOf("boteco-dida-") === 0 && n !== CACHE; })
             .map(function(n) { return caches.delete(n); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

function isFont(url) {
  return url.indexOf("fonts.googleapis.com") > -1 || url.indexOf("fonts.gstatic.com") > -1;
}

/* busca na rede e guarda a resposta boa (a cópia é feita assim que a resposta chega,
   antes de a página começar a ler) */
function fetchAndKeep(req, init) {
  var network = fetch(req, init).then(function(res) {
    return { res: res, copy: (res.ok || res.type === "opaque") ? res.clone() : null };
  });
  return {
    response: network.then(function(n) { return n.res; }),
    saved: network.then(function(n) {
      if (n.copy) return caches.open(CACHE).then(function(c) { return c.put(req, n.copy); });
    }).catch(function() {})
  };
}

/* responde com a rede; se ela não responder no prazo, com o plano B (a cópia guardada).
   Sem plano B, continua esperando a rede. */
function withDeadline(response, planB) {
  function tryB() { return Promise.resolve().then(planB).catch(function() {}); }
  return new Promise(function(resolve) {
    var done = false;
    function finish(r) { if (!done && r) { done = true; resolve(r); } }
    var timer = setTimeout(function() { tryB().then(finish); }, PRAZO);
    response.then(function(res) { clearTimeout(timer); finish(res); }, function() {
      clearTimeout(timer);
      tryB().then(function(r) { finish(r || Response.error()); });
    });
  });
}

function cached(req) {
  return caches.match(req, { ignoreSearch: true }).then(function(hit) {
    if (hit) return hit;
    if (req.mode === "navigate") return caches.match("./index.html");
  });
}

self.addEventListener("fetch", function(e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = req.url;

  // Fontes: cache primeiro. Sem cópia, rede com prazo: o CSS da fonte trava a tela até chegar
  if (isFont(url)) {
    e.respondWith(
      caches.match(req).then(function(hit) {
        if (hit) return hit;
        return withDeadline(fetchAndKeep(req).response, function() {
          return Promise.resolve(url.indexOf("fonts.googleapis.com") > -1
            ? new Response("", { headers: { "Content-Type": "text/css" } })
            : undefined);
        });
      })
    );
    return;
  }

  // Só cuida do próprio app
  if (!url.startsWith(self.location.origin)) return;

  // App: rede primeiro com prazo; a resposta da rede é guardada mesmo se chegar depois
  var net = fetchAndKeep(req, { cache: "no-store" });
  e.waitUntil(net.saved);
  e.respondWith(withDeadline(net.response, function() { return cached(req); }));
});
