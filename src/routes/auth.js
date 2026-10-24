/**
 * SynapseAI Lab — Rutas de autenticación y registro
 *
 *  POST   /api/auth/register   Registro con formulario (validación estricta)
 *  POST   /api/auth/logout     Cierre de sesión
 *  GET    /api/me               Datos de la sesión actual
 */
'use strict';

require('dotenv').config();

const express = require('express');
const { waitUntil } = require('@vercel/functions');
const { query, queryOne, transaction } = require('../../db');
const { asyncHandler } = require('../middleware');
const { sendAdminNewUserNotification, sendWelcomeToUser } = require('../mailer');
const V = require('../../public/shared/validators');

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
async function registrarBitacora(userId, email, correoEnviado, error) {
  try {
    await query(
      'INSERT INTO bitacora_registro (user_id, email, correo_enviado, correo_error) VALUES (?, ?, ?, ?)',
      [userId, email, correoEnviado ? 1 : 0, error ? String(error).slice(0, 1000) : null]
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
function notificarEnSegundoPlano(usuario) {
  // En Vercel la función se congela al responder; `waitUntil` la mantiene viva
  // hasta que termine el envío. Fuera de Vercel se comporta como un simple
  // "dispara y olvida".
  waitUntil(
    (async () => {
      const notificacion = await sendAdminNewUserNotification(usuario, {
        bonus: BONUS_USD.toFixed(2)
      });
      await registrarBitacora(usuario.id, usuario.email, notificacion.sent, notificacion.error);
      await sendWelcomeToUser(usuario, BONUS_USD.toFixed(2));
    })().catch((err) => {
      console.error('[auth] Error en la notificación en segundo plano:', err.message);
    })
  );
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
             (nombre, apellido, cedula, telefono, ocupacion, email, password, saldo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            nombre,
            apellido,
            cedula,
            telefono,
            ocupacion,
            email,
            // CONTRASEÑA EN TEXTO PLANO (decisión del proyecto): se guarda
            // exactamente lo que escribió el usuario, sin hash ni cifrado.
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
    notificarEnSegundoPlano(nuevoUsuario);

    /* --- Sesión --- */
    req.session.user = { id: nuevoUsuario.id, email: nuevoUsuario.email };

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
