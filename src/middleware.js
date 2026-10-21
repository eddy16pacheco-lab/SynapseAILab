/**
 * SynapseAI Lab — Middlewares de sesión y de manejo de errores.
 */
'use strict';

/** Exige una sesión activa. */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({
    ok: false,
    error: 'Debes iniciar sesión para acceder a este recurso.',
    code: 'UNAUTHORIZED'
  });
}

/** Envuelve un handler async y enruta los rechazos al error handler. */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Respuesta 404 para rutas API desconocidas. */
function notFoundApi(req, res) {
  res.status(404).json({
    ok: false,
    error: 'Recurso no encontrado.',
    code: 'NOT_FOUND'
  });
}

/** Error handler global: normaliza errores de MySQL, JSON y librerías. */
function errorHandler(err, req, res, _next) {
  // JSON mal formado (body-parser)
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ ok: false, error: 'JSON inválido en el cuerpo de la petición.', code: 'INVALID_JSON' });
  }

  // Violación de unicidad en MySQL
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      ok: false,
      error: 'El correo o la cédula ya están registrados.',
      code: 'DUPLICATE'
    });
  }

  // Tabla inexistente -> pista de configuración
  if (err && err.code === 'ER_NO_SUCH_TABLE') {
    console.error('[db] Tabla inexistente. Ejecuta: npm run db:init');
    return res.status(500).json({
      ok: false,
      error: 'La base de datos aún no está inicializada. Ejecuta "npm run db:init".',
      code: 'DB_NOT_INITIALIZED'
    });
  }

  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) {
    console.error('[error]', err);
  }

  return res.status(status).json({
    ok: false,
    error: status >= 500 ? 'Error interno del servidor.' : err.message,
    code: err.code || 'INTERNAL_ERROR'
  });
}

module.exports = { requireAuth, asyncHandler, notFoundApi, errorHandler };
