// expo-sqlite en web: Metro debe servir el SQLite compilado a WebAssembly (.wasm) y el
// navegador necesita SharedArrayBuffer, que exige dos headers de aislamiento de origen
// en TODAS las respuestas, empezando por el HTML.
const http = require('http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// Servidor de desarrollo (npx expo start). La configuración que sugiere la documentación
// (server.enhanceMiddleware) solo envuelve el middleware de Metro: el HTML lo sirve otro
// middleware de Expo que va antes y quedaba sin los headers, así que se agregan a cada
// respuesta de este proceso. En producción los manda el hosting (en EAS Hosting, el plugin
// expo-router de app.json).
const AISLAMIENTO = {
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
const writeHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (...args) {
  if (!this.headersSent) {
    for (const [nombre, valor] of Object.entries(AISLAMIENTO)) {
      if (!this.hasHeader(nombre)) this.setHeader(nombre, valor);
    }
  }
  return writeHead.apply(this, args);
};

module.exports = config;
