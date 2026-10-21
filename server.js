/**
 * =====================================================================
 *  SynapseAI Lab — Servidor principal
 *  Plataforma global de entrenamiento de IA y etiquetado de datos
 * =====================================================================
 *
 *  Arranque:      npm install && npm run db:init && npm start
 *  Desarrollo:    npm run dev
 *
 */
'use strict';

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { testConnection, closePool, dbConfig } = require('./db');
const authRouter = require('./src/routes/auth');
const meRouter = require('./src/routes/me');
const { notFoundApi, errorHandler } = require('./src/middleware');

const app = express();

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
// Interfaz de escucha. Vacío = dual-stack por defecto de Node (`::`), que
// acepta tanto IPv4 como IPv6 y funciona igual en local y en contenedores.
// Se puede forzar con SERVER_HOST=0.0.0.0 si una plataforma lo exige.
// (No se usa la variable HOST: esa la usa db.js como alias del host de BD.)
const HOST = (process.env.SERVER_HOST || '').trim();
const IS_PROD = process.env.NODE_ENV === 'production';
const APP_NAME = 'SynapseAI Lab';
const SLOGAN = 'Plataforma global de entrenamiento de IA y etiquetado de datos';
const BONUS_USD = Number.parseFloat(process.env.BONUS_USD || '1.00');

/* ------------------------------------------------------------------ *
 * 1) Configuración de Express
 * ------------------------------------------------------------------ */
app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ------------------------------------------------------------------ *
 * 2) Cabeceras de seguridad (Helmet) con CSP compatible con
 *    Google Identity Services (accounts.google.com / gstatic.com)
 * ------------------------------------------------------------------ */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          'https://accounts.google.com',
          'https://accounts.gstatic.com',
          'https://ssl.gstatic.com'
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https://*.gstatic.com', 'https://lh3.googleusercontent.com'],
        connectSrc: ["'self'", 'https://accounts.google.com', 'https://oauth2.googleapis.com'],
        frameSrc: ['https://accounts.google.com', 'https://*.google.com'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'", 'https://accounts.google.com']
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  })
);

/* ------------------------------------------------------------------ *
 * 3) Parseo del cuerpo de las peticiones
 * ------------------------------------------------------------------ */
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

/* ------------------------------------------------------------------ *
 * 4) CORS opcional (para clientes externos / apps móviles)
 * ------------------------------------------------------------------ */
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (corsOrigins.length) {
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

/* ------------------------------------------------------------------ *
 * 5) Archivos estáticos (frontend) + validadores compartidos
 * ------------------------------------------------------------------ */
app.use(express.static(path.join(__dirname, 'public'), { maxAge: IS_PROD ? '1h' : 0, etag: true }));
app.use('/shared', express.static(path.join(__dirname, 'shared'), { maxAge: IS_PROD ? '1h' : 0 }));

/* ------------------------------------------------------------------ *
 * 6) Sesión (express-session)
 *
 *    SESSION_STORE=memory -> store en RAM (por defecto, ideal en local).
 *    SESSION_STORE=mysql  -> store en la misma base de datos MySQL.
 *
 *    El store de MySQL es OBLIGATORIO en despliegues gratuitos (Render,
 *    Koyeb, Vercel…): esas plataformas apagan la instancia tras unos
 *    minutos de inactividad, y con el store en memoria el usuario perdería
 *    la sesión en cada arranque en frío.
 * ------------------------------------------------------------------ */
if (!process.env.SESSION_SECRET) {
  console.warn('[server] SESSION_SECRET no definido: se generará uno temporal (las sesiones se pierden al reiniciar).');
}

const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_STORE = (process.env.SESSION_STORE || 'memory').toLowerCase();

let sessionStore = null;

if (SESSION_STORE === 'mysql') {
  try {
    const MySQLStore = require('connect-mysql2')(session);
    sessionStore = new MySQLStore({
      config: {
        ...dbConfig,
        // Pool pequeño: Aiven Free Tier limita el número de conexiones.
        connectionLimit: Number.parseInt(process.env.SESSION_POOL_SIZE || '3', 10)
      },
      table: 'sessions',
      secret: sessionSecret, // cifra el contenido de la sesión en la BD
      cleanup: true
    });
    console.log('[server] Store de sesión: MySQL (tabla `sessions`)');
  } catch (err) {
    console.error('[server] No se pudo iniciar el store de sesión en MySQL:', err.message);
    console.error('[server] Se usará el store en memoria (las sesiones se perderán al reiniciar).');
  }
} else {
  console.log('[server] Store de sesión: memoria (define SESSION_STORE=mysql para producción)');
}

app.use(
  session({
    name: 'synapse.sid',
    secret: sessionSecret,
    store: sessionStore || undefined,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // 'auto' = marca Secure solo si la petición llega por HTTPS.
      // Necesario porque Aiven Runtime / Render / Koyeb terminan el TLS fuera
      // del contenedor y reenvían HTTP: con `secure: true` fijo la cookie se
      // descartaría y el usuario parecería no haber iniciado sesión.
      secure: 'auto',
      maxAge: 1000 * 60 * 60 * 8 // 8 horas
    }
  })
);

/* ------------------------------------------------------------------ *
 * 7) Rate limiting (protege el registro y el envío de correos)
 * ------------------------------------------------------------------ */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.', code: 'RATE_LIMIT' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    ok: false,
    error: 'Demasiados intentos de registro desde esta conexión. Inténtalo más tarde.',
    code: 'RATE_LIMIT'
  }
});

app.use('/api', globalLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/google', authLimiter);

/* ------------------------------------------------------------------ *
 * 8) API
 * ------------------------------------------------------------------ */

/** Configuración pública que necesita el frontend. */
app.get('/api/config', (req, res) => {
  res.json({
    ok: true,
    appName: APP_NAME,
    slogan: SLOGAN,
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    bonusUsd: BONUS_USD,
    bonusTexto: `$${BONUS_USD.toFixed(2)} USD`
  });
});

/** Health check. */
app.get('/api/health', async (req, res) => {
  let db = 'down';
  try {
    await testConnection();
    db = 'up';
  } catch (err) {
    db = 'down: ' + err.message;
  }
  // `port` y `host` permiten detectar desajustes entre el puerto que escucha
  // el contenedor y el puerto que la plataforma publica (EXPOSE / ports).
  res.json({
    ok: true,
    app: APP_NAME,
    uptime: process.uptime(),
    db,
    port: PORT,
    host: HOST,
    env: IS_PROD ? 'production' : 'development',
    sessionStore: SESSION_STORE
  });
});

/** Rutas de autenticación y registro. */
app.use('/api/auth', authRouter);

/** Rutas del usuario en sesión (perfil, movimientos de saldo). */
app.use('/api/me', meRouter);

/** Cualquier ruta /api desconocida devuelve JSON, no HTML. */
app.use('/api', notFoundApi);

/* ------------------------------------------------------------------ *
 * 9) Frontend (SPA: cualquier ruta no-API sirve index.html)
 * ------------------------------------------------------------------ */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ------------------------------------------------------------------ *
 * 10) Manejo global de errores
 * ------------------------------------------------------------------ */
app.use(errorHandler);

/* ------------------------------------------------------------------ *
 * 11) Arranque
 * ------------------------------------------------------------------ */
async function start() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║   SynapseAI Lab                                       ║');
  console.log('  ║   ' + SLOGAN + '           ║');
  console.log('  ╚══════════════════════════════════════════════════════╝');
  console.log('');

  try {
    const info = await testConnection();
    console.log(`[db] Conectado a ${info.db} (MySQL ${info.version})`);
  } catch (err) {
    console.error('[db] No se pudo conectar con la base de datos:', err.message);
    console.error('[db] Revisa las variables DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME en .env');
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    console.warn('[google] GOOGLE_CLIENT_ID no definido: el botón de Google no podrá renderizarse.');
  }

  const onListening = () => {
    const addr = server.address();
    console.log(
      `[server] SynapseAI Lab escuchando en http://${HOST || '[::]'}:${PORT} ` +
        `(puerto real: ${addr ? addr.port : PORT})  (${IS_PROD ? 'producción' : 'desarrollo'})`
    );
    console.log(`[server] Bono de bienvenida: $${BONUS_USD.toFixed(2)} USD`);
    console.log(`[server] Store de sesión: ${SESSION_STORE}`);
  };

  // Sin SERVER_HOST se deja el bind por defecto de Node (dual-stack).
  const server = HOST ? app.listen(PORT, HOST, onListening) : app.listen(PORT, onListening);

  const shutdown = async (signal) => {
    console.log(`\n[server] Señal ${signal} recibida. Cerrando...`);
    server.close(async () => {
      try {
        await closePool();
      } catch (err) {
        /* ignorado */
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 8000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  start();
}

module.exports = app;
