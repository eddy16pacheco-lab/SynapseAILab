/**
 * SynapseAI Lab — Capa de base de datos (Aiven MySQL Cloud)
 *
 * Usa `mysql2/promise` con un POOL de conexiones y PREPARED STATEMENTS
 * (`pool.execute`) para eliminar por completo el riesgo de inyección SQL.
 *
 * Los nombres de variable admiten alias para funcionar con los nombres
 * del enunciado (HOST / USER / PASSWORD / DATABASE) y los más comunes
 * (DB_HOST / DB_USER / DB_PASSWORD / DB_NAME).
 */
'use strict';

require('dotenv').config();

const fs = require('fs');
const mysql = require('mysql2/promise');

/* ------------------------------------------------------------------ *
 * Configuración del pool
 * ------------------------------------------------------------------ */
function pick(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return undefined;
}

function pickInt(names, fallback) {
  const raw = pick(...names);
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function pickBool(names, fallback = false) {
  const raw = pick(...names);
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

const dbConfig = {
  host: pick('DB_HOST', 'MYSQL_HOST', 'HOST') || 'localhost',
  port: pickInt(['DB_PORT', 'MYSQL_PORT'], 3306),
  user: pick('DB_USER', 'MYSQL_USER', 'USER') || 'root',
  password: pick('DB_PASSWORD', 'MYSQL_PASSWORD', 'PASSWORD') || '',
  database: pick('DB_NAME', 'MYSQL_DATABASE', 'DATABASE') || 'synapseai_lab',
  waitForConnections: true,
  connectionLimit: pickInt(['DB_POOL_SIZE'], 10),
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  timezone: 'Z',
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
  // DECIMAL(12,2) -> number de JS (saldo). Sin esto mysql2 devuelve string.
  decimalNumbers: true
};

/* ------------------------------------------------------------------ *
 * SSL (Aiven Cloud exige TLS)
 * ------------------------------------------------------------------ */
const useSsl = pickBool(['DB_SSL', 'MYSQL_SSL'], false);
const caPath = pick('DB_SSL_CA', 'MYSQL_SSL_CA', 'SSL_CA');

if (useSsl || caPath) {
  const ssl = {
    // Por defecto NO se rechaza el certificado autofirmado de Aiven.
    // Para validación estricta define DB_SSL_REJECT_UNAUTHORIZED=true
    // y apunta DB_SSL_CA al certificado CA descargado desde Aiven.
    rejectUnauthorized: pickBool(['DB_SSL_REJECT_UNAUTHORIZED'], false)
  };

  if (caPath) {
    try {
      ssl.ca = fs.readFileSync(caPath, 'utf8');
      ssl.rejectUnauthorized = pickBool(['DB_SSL_REJECT_UNAUTHORIZED'], true);
    } catch (err) {
      console.warn(`[db] No se pudo leer DB_SSL_CA (${caPath}): ${err.message}`);
      console.warn('[db] Se continúa sin CA personalizada.');
    }
  }

  dbConfig.ssl = ssl;
}

/* ------------------------------------------------------------------ *
 * Pool
 * ------------------------------------------------------------------ */
const pool = mysql.createPool(dbConfig);

/**
 * Ejecuta una consulta PREPARED (parámetros con ? / :named).
 * @param {string} sql
 * @param {Array|Object} params
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Igual que query() pero devuelve la primera fila o null. */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/**
 * Ejecuta varias consultas dentro de una TRANSACCIÓN.
 * @param {Function} fn  Recibe la conexión: async (conn) => { ... }
 */
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rollbackErr) {
      console.error('[db] Error en ROLLBACK:', rollbackErr.message);
    }
    throw err;
  } finally {
    conn.release();
  }
}

/** Comprueba la conectividad con la base de datos. */
async function testConnection() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT VERSION() AS version, DATABASE() AS db, NOW() AS now');
    return rows[0];
  } finally {
    conn.release();
  }
}

/** Cierra el pool de forma ordenada (al apagar el servidor). */
async function closePool() {
  await pool.end();
}

/** Identificadores de error de MySQL que tratamos de forma especial. */
const MYSQL_ERRORS = {
  DUPLICATE_ENTRY: 'ER_DUP_ENTRY',
  NO_SUCH_TABLE: 'ER_NO_SUCH_TABLE',
  ACCESS_DENIED: 'ER_ACCESS_DENIED_ERROR'
};

module.exports = {
  pool,
  dbConfig,
  query,
  queryOne,
  transaction,
  testConnection,
  closePool,
  MYSQL_ERRORS
};
