// Viltrum — resolver GIF→MP4 (v11). Carica media/manifest.json (generato da
// scripts/convert-gifs.mjs) e traduce gli URL GIF del foglio nel video MP4
// locale quando esiste: 30-50x meno banda, preload quasi istantaneo.
// Se il manifest manca o l'URL non è convertito → si usa la GIF originale.
// Nessuna modifica ai dati del coach: la mappa vive solo qui.
(function () {
  var manifest = null;
  var base = window.location.pathname.includes('/pages/') ? '../' : './';

  fetch(base + 'media/manifest.json')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (m) { manifest = m || {}; })
    .catch(function () { manifest = {}; });

  window.ViltrumMedia = {
    // URL originale → { type: 'video'|'gif', src }
    resolve: function (url) {
      if (manifest && url && manifest[url]) {
        return { type: 'video', src: base + manifest[url] };
      }
      return { type: 'gif', src: url };
    },
    isReady: function () { return manifest !== null; },
  };
})();
