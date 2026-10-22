/**
 * =====================================================================
 *  SynapseAI Lab — Punto de entrada para Vercel (Serverless)
 *
 *  Vercel detecta los archivos de la carpeta `api/` como funciones.
 *  Este archivo exporta la app de Express, de modo que TODAS las rutas
 *  (/, /api/*, /css/*, /js/*) se resuelven en una única función.
 *
 *  El enrutado se define en vercel.json:
 *      rewrites: [{ "source": "/(.*)", "destination": "/api" }]
 *  Vercel entrega a la función la ruta ORIGINAL de la petición.
 * =====================================================================
 */
'use strict';

const app = require('../server');

module.exports = app;
module.exports.default = app;
