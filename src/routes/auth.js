/**
 * SynapseAI Lab — Rutas de autenticación y registro
 *
 *  POST   /api/auth/register   Registro con formulario (validación estricta)
 *  POST   /api/auth/google     Verificación de identidad con Google (id_token)
 *  POST   /api/auth/logout     Cierre de sesión
 *  GET    /api/me               Datos de la sesión actual
 *  PATCH  /api/me/profile       Completa el perfil de las cuentas creadas con Google
 */
'use strict';

require('dotenv').config();

const express = require('express');
const { query, queryOne, transaction } = require('../../db');
const { asyncHandler } = require('../middleware');
const { verifyGoogleIdToken, AuthError } = require('../googleAuth');
const { sendAdminNewUserNotification, sendWelcomeToUser } = require('../mailer');
const V = require('../../shared/validators');

const router = express.Router();

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */
const BONUS_USD = Number.parseFloat(process.env.BONUS_USD || '1.00');

/** Proyecta una fila de `users` a la forma pública que consume el cliente. */
function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    nombre: row.nombre,
    apellido: row.apellido,
    cedula: row.cedula,
    telefono: row.telefono,
    ocupacion: row.ocupacion,
    email: row.email,
    emailVerified: !!row.email_verified,
    provider: row.provider,
    perfilCompleto: !!row.perfil_completo,
    saldo: Number(row.saldo),
    saldoFormateado: `$${Number(row.saldo).toFixed(2)} USD`,
    createdAt: row.created_at
  };
}

/** Comprueba email y cédula duplicados (prepared statement). */
async function findDuplicates(email, cedula) {
  const duplicados = {};
  if (email) {
    const found = await queryOne('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (found) duplicados.email = true;
  }
  if (cedula) {
    const found = await queryOne('SELECT id FROM users WHERE cedula = ? LIMIT 1', [cedula]);
    if (found) duplicados.cedula = true;
  }
  return duplicados;
}

/** Registra el movimiento de bono en el libro de saldo. */
async function registrarBono(conn, userId, monto, referencia) {
  await conn.execute(
    'INSERT INTO movimientos_saldo (user_id, tipo, monto, saldo_final, referencia) VALUES (?, ?, ?, ?, ?)',
    [userId, 'bono', monto, monto, referencia || 'Bono de bienvenida por registro']
  );
}

/** Guarda la traza del registro (éxito/fracaso del aviso al administrador). */
async function registrarBitacora(userId, email, origen, correoEnviado, error) {
  try {
    await query(
      'INSERT INTO bitacora_registro (user_id, email, origen, correo_enviado, correo_error) VALUES (?, ?, ?, ?, ?)',
      [userId, email, origen, correoEnviado ? 1 : 0, error ? String(error).slice(0, 1000) : null]
    );
  } catch (err) {
    console.error('[auth] No se pudo escribir la bitácora:', err.message);
  }
}

/**
 * Envía el aviso al administrador y la copia de bienvenida AL FONDO.
 *
 * Importante: NO se espera al servidor SMTP antes de responder al usuario.
 * Si el relay SMTP está lento, bloqueado por el firewall o sin configurar,
 * el registro (que ya está confirmado en la base de datos) no debe esperar.
 * El resultado (enviado o error) queda registrado en bitacora_registro.
 */
function notificarEnSegundoPlano(usuario, origen) {
  setImmediate(() => {
    (async () => {
      const notificacion = await sendAdminNewUserNotification(usuario, {
        origen,
        bonus: BONUS_USD.toFixed(2)
      });
      await registrarBitacora(usuario.id, usuario.email, origen, notificacion.sent, notificacion.error);
      await sendWelcomeToUser(usuario, BONUS_USD.toFixed(2));
    })().catch((err) => {
      console.error('[auth] Error en la notificación en segundo plano:', err.message);
    });
  });
}

/* ------------------------------------------------------------------ *
 * POST /api/auth/register — Registro con formulario
 * ------------------------------------------------------------------ */
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const check = V.validateRegistration(req.body);

    if (!check.valid) {
      return res.status(422).json({
        ok: false,
        error: 'Revisa los campos marcados en el formulario.',
        code: 'VALIDATION_ERROR',
        errors: check.errors
      });
    }

    const { nombre, apellido, cedula, telefono, ocupacion, email, password } = check.values;

    /* --- Verificación de duplicados (email / cédula) --- */
    const duplicados = await findDuplicates(email, cedula);
    if (duplicados.email || duplicados.cedula) {
      const campos = [];
      if (duplicados.email) campos.push('correo electrónico');
      if (duplicados.cedula) campos.push('cédula de identidad');
      return res.status(409).json({
        ok: false,
        error: `Ya existe una cuenta registrada con ${campos.join(' y ')}.`,
        code: 'DUPLICATE',
        errors: duplicados
      });
    }

    /* --- Alta del usuario (transacción + prepared statements) --- */
    let nuevoUsuario;
    try {
      nuevoUsuario = await transaction(async (conn) => {
        const [result] = await conn.execute(
          `INSERT INTO users
             (nombre, apellido, cedula, telefono, ocupacion, email, password,
              email_verified, provider, perfil_completo, saldo)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'local', 1, ?)`,
          [
            nombre,
            apellido,
            cedula,
            telefono,
            ocupacion,
            email,
            // ⚠️ PROTOTIPO ACADÉMICO — la contraseña se guarda en TEXTO PLANO
            //    tal y como solicita el enunciado del ejercicio.
            //    Para producción: reemplazar por hash bcrypt/argon2:
            //      const hash = await bcrypt.hash(password, 12);
            password,
            BONUS_USD
          ]
        );

        const userId = result.insertId;
        await registrarBono(conn, userId, BONUS_USD, 'Bono de bienvenida por registro');

        const [rows] = await conn.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
        return rows[0];
      });
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          ok: false,
          error: 'El correo o la cédula ya están registrados.',
          code: 'DUPLICATE'
        });
      }
      throw err;
    }

    /* --- Notificación al administrador (en segundo plano, no bloquea la respuesta) --- */
    notificarEnSegundoPlano(nuevoUsuario, 'local');

    /* --- Sesión --- */
    req.session.user = { id: nuevoUsuario.id, email: nuevoUsuario.email, provider: 'local' };

    return res.status(201).json({
      ok: true,
      message: 'Registro completado correctamente.',
      user: publicUser(nuevoUsuario),
      bonus: BONUS_USD,
      nuevo: true
    });
  })
);

/* ------------------------------------------------------------------ *
 * POST /api/auth/google — Verificación estricta con Google Identity
 * ------------------------------------------------------------------ */
router.post(
  '/google',
  asyncHandler(async (req, res) => {
    const credential = req.body && (req.body.credential || req.body.id_token || req.body.idToken);

    /* --- Verificación criptográfica del id_token --- */
    let googleUser;
    try {
      googleUser = await verifyGoogleIdToken(credential);
    } catch (err) {
      if (err instanceof AuthError) {
        return res.status(err.status).json({ ok: false, error: err.message, code: err.code });
      }
      throw err;
    }

    const email = googleUser.email;

    /* --- ¿La cuenta ya existe? --- */
    const existente = await queryOne('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);

    let usuario;
    let nuevo = false;

    if (existente) {
      if (existente.google_sub && existente.google_sub !== googleUser.sub) {
        return res.status(409).json({
          ok: false,
          error: 'Este correo ya está vinculado a otra cuenta de Google.',
          code: 'GOOGLE_SUB_MISMATCH'
        });
      }

      const result = await transaction(async (conn) => {
        const [rows] = await conn.execute(
          `UPDATE users
              SET email_verified = 1,
                  google_sub     = COALESCE(google_sub, ?),
                  provider       = IF(provider = 'local', 'google', provider),
                  perfil_completo = IF(perfil_completo = 0 AND cedula IS NOT NULL AND telefono IS NOT NULL AND ocupacion IS NOT NULL, 1, perfil_completo)
            WHERE id = ?`,
          [googleUser.sub, existente.id]
        );
        const [sel] = await conn.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [existente.id]);
        return sel[0];
      });

      usuario = result;
    } else {
      /* --- Cuenta nueva creada con la identidad verificada por Google --- */
      const nombre = (googleUser.givenName || googleUser.name || 'Usuario').slice(0, 80);
      const apellido = (googleUser.familyName || 'Google').slice(0, 80);

      try {
        usuario = await transaction(async (conn) => {
          const [result] = await conn.execute(
            `INSERT INTO users
               (nombre, apellido, cedula, telefono, ocupacion, email, password,
                email_verified, google_sub, provider, perfil_completo, saldo)
             VALUES (?, ?, NULL, NULL, NULL, ?, NULL, 1, ?, 'google', 0, ?)`,
            [nombre, apellido, email, googleUser.sub, BONUS_USD]
          );

          const userId = result.insertId;
          await registrarBono(conn, userId, BONUS_USD, 'Bono de bienvenida por registro con Google');

          const [rows] = await conn.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
          return rows[0];
        });
      } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({
            ok: false,
            error: 'El correo ya está registrado. Inicia sesión con Google.',
            code: 'DUPLICATE'
          });
        }
        throw err;
      }

      nuevo = true;

      /* --- Notificación al administrador (en segundo plano) --- */
      notificarEnSegundoPlano(usuario, 'google');
    }

    req.session.user = { id: usuario.id, email: usuario.email, provider: 'google' };

    return res.status(nuevo ? 201 : 200).json({
      ok: true,
      message: nuevo
        ? 'Registro completado correctamente con tu cuenta de Google verificada.'
        : 'Sesión iniciada con tu cuenta de Google verificada.',
      user: publicUser(usuario),
      bonus: nuevo ? BONUS_USD : 0,
      nuevo
    });
  })
);

/* ------------------------------------------------------------------ *
 * POST /api/auth/logout
 * ------------------------------------------------------------------ */
router.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie('synapse.sid');
      res.json({ ok: true, message: 'Sesión cerrada correctamente.' });
    });
  } else {
    res.json({ ok: true, message: 'Sesión cerrada correctamente.' });
  }
});


module.exports = router;
module.exports.publicUser = publicUser;
module.exports.BONUS_USD = BONUS_USD;
