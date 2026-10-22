/**
 * SynapseAI Lab — Verificación de propiedad del correo (código OTP)
 *
 * No se pide NUNCA la contraseña real del correo (Gmail/Outlook nunca la
 * exponen y almacenarla sería un riesgo enorme). Lo que demuestra que una
 * persona controla su buzón es un CÓDIGO DE UN SOLO USO enviado por email.
 *
 * El código se almacena SOLO como hash SHA-256: si alguien lee la base de
 * datos no puede reutilizar los códigos.
 */
'use strict';

require('dotenv').config();

const crypto = require('crypto');
const { query, queryOne } = require('../db');

/** Duración de validez del código (10 minutos). */
const TTL_MINUTOS = Number.parseInt(process.env.OTP_TTL_MINUTOS || '10', 10);
/** Máximos intentos por código antes de invalidarlo. */
const MAX_INTENTOS = Number.parseInt(process.env.OTP_MAX_INTENTOS || '5', 10);
/** Longitud del código. */
const CODIGO_LONGITUD = 6;

/** Sal para el hash. Si no se define, se usa el SESSION_SECRET. */
function salt() {
  return process.env.OTP_SALT || process.env.SESSION_SECRET || 'synapseai-lab-otp';
}

/** Genera un código numérico aleatorio criptográficamente seguro. */
function generarCodigo() {
  const max = 10 ** CODIGO_LONGITUD;
  return String(crypto.randomInt(0, max)).padStart(CODIGO_LONGITUD, '0');
}

/** Hash del código. Nunca se guarda el código en claro. */
function hashCodigo(email, codigo) {
  return crypto
    .createHash('sha256')
    .update(`${String(email).toLowerCase()}:${codigo}:${salt()}`)
    .digest('hex');
}

/**
 * Invalida los códigos anteriores del email y guarda uno nuevo.
 * @returns {Promise<{codigo:string, expiraEn:Date}>}
 */
async function crearCodigo(email) {
  const codigo = generarCodigo();
  const expiraEn = new Date(Date.now() + TTL_MINUTOS * 60 * 1000);

  // Los códigos previos dejan de servir.
  await query('UPDATE codigos_verificacion SET usado = 1 WHERE email = ? AND usado = 0', [email]);

  await query(
    'INSERT INTO codigos_verificacion (email, codigo_hash, expira_at, intentos, usado) VALUES (?, ?, ?, 0, 0)',
    [email, hashCodigo(email, codigo), expiraEn]
  );

  return { codigo, expiraEn };
}

/**
 * Comprueba un código introducido por el usuario.
 * @returns {Promise<{ok:boolean, error?:string, codigo?:string}>}
 */
async function verificarCodigo(email, codigoIngresado) {
  const codigo = String(codigoIngresado || '').trim();
  if (!/^\d{6}$/.test(codigo)) {
    return { ok: false, error: 'El código debe tener 6 dígitos.' };
  }

  const registro = await queryOne(
    `SELECT id, codigo_hash, expira_at, intentos, usado
       FROM codigos_verificacion
      WHERE email = ? AND usado = 0
      ORDER BY id DESC
      LIMIT 1`,
    [email]
  );

  if (!registro) {
    return { ok: false, error: 'No hay ningún código pendiente. Solicita uno nuevo.' };
  }

  if (new Date(registro.expira_at).getTime() < Date.now()) {
    await query('UPDATE codigos_verificacion SET usado = 1 WHERE id = ?', [registro.id]);
    return { ok: false, error: 'El código ha caducado. Solicita uno nuevo.' };
  }

  if (registro.intentos >= MAX_INTENTOS) {
    await query('UPDATE codigos_verificacion SET usado = 1 WHERE id = ?', [registro.id]);
    return { ok: false, error: 'Demasiados intentos. Solicita un código nuevo.' };
  }

  const esperado = hashCodigo(email, codigo);
  const coincide =
    esperado.length === registro.codigo_hash.length &&
    crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(registro.codigo_hash));

  if (!coincide) {
    await query('UPDATE codigos_verificacion SET intentos = intentos + 1 WHERE id = ?', [registro.id]);
    const restantes = MAX_INTENTOS - (registro.intentos + 1);
    return {
      ok: false,
      error:
        restantes > 0
          ? `El código no es correcto. Te ${restantes === 1 ? 'queda' : 'quedan'} ${restantes} ${restantes === 1 ? 'intento' : 'intentos'}.`
          : 'Demasiados intentos. Solicita un código nuevo.'
    };
  }

  await query('UPDATE codigos_verificacion SET usado = 1 WHERE id = ?', [registro.id]);
  return { ok: true };
}

/** ¿Cuántos códigos válidos (sin usar y sin caducar) hay para un email? */
async function tieneCodigoPendiente(email) {
  const fila = await queryOne(
    `SELECT COUNT(*) AS total
       FROM codigos_verificacion
      WHERE email = ? AND usado = 0 AND expira_at > NOW()`,
    [email]
  );
  return fila && fila.total > 0;
}

/** Limpieza periódica de códigos caducados (llámala desde un cron si quieres). */
async function limpiarCodigos() {
  const resultado = await query('DELETE FROM codigos_verificacion WHERE expira_at < NOW() - INTERVAL 1 DAY');
  return resultado.affectedRows || 0;
}

module.exports = {
  generarCodigo,
  hashCodigo,
  crearCodigo,
  verificarCodigo,
  tieneCodigoPendiente,
  limpiarCodigos,
  TTL_MINUTOS,
  MAX_INTENTOS
};
