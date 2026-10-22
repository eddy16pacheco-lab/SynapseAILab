/**
 * Crea el esquema de la base de datos SynapseAI Lab en Aiven MySQL.
 *   npm run db:init
 */
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { dbConfig } = require('../db');

const SCHEMA_FILE = path.join(__dirname, '..', 'sql', 'schema.sql');

/**
 * Divide un script SQL en sentencias individuales, respetando:
 *  - literales entre comillas simples, dobles y acentos graves
 *  - comentarios de línea (`--`, `#`) y de bloque (`/* ... *\/`)
 *
 * Evita depender de `multipleStatements`, que no es portable entre
 * versiones de MySQL/MariaDB y clientes.
 */
function splitStatements(sql) {
  const statements = [];
  let buffer = '';
  let quote = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      buffer += ch;
      if (ch === '\\' && next) {
        buffer += next;
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '-' && next === '-') {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === '#') {
      inLineComment = true;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      buffer += ch;
      continue;
    }
    if (ch === ';') {
      if (buffer.trim()) statements.push(buffer.trim());
      buffer = '';
      continue;
    }
    buffer += ch;
  }

  if (buffer.trim()) statements.push(buffer.trim());
  return statements;
}

async function main() {
  if (!fs.existsSync(SCHEMA_FILE)) {
    console.error(`[db:init] No se encontró el archivo ${SCHEMA_FILE}`);
    process.exit(1);
  }

  const fullSql = fs.readFileSync(SCHEMA_FILE, 'utf8');

  // Se separa el "CREATE DATABASE"/"USE" porque en Aiven el usuario suele
  // tener permisos restrictedos: la base ya existe y se crea sola.
  const tableSql = fullSql
    .replace(/CREATE\s+DATABASE[\s\S]*?;/i, '')
    .replace(/^\s*USE\s+`?[A-Za-z0-9_]+`?\s*;/im, '');

  const dbName = dbConfig.database;

  console.log(`[db:init] Conectando a ${dbConfig.host}:${dbConfig.port} ...`);

  // --- Paso 1: asegurar que la base existe (puede fallar por permisos) ---
  const adminConfig = { ...dbConfig };
  delete adminConfig.database;

  const admin = await mysql.createConnection(adminConfig);
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci`
    );
    console.log(`[db:init] Base de datos "${dbName}" disponible.`);
  } catch (err) {
    console.log(`[db:init] La base "${dbName}" ya existe o no se puede crear (${err.code}). Se continúa.`);
  } finally {
    await admin.end();
  }

  // --- Paso 2: crear las tablas ---
  const conn = await mysql.createConnection(dbConfig);
  try {
    console.log('[db:init] Aplicando sql/schema.sql ...');
    const statements = splitStatements(tableSql);
    for (const statement of statements) {
      const label = statement.split('\n').filter((l) => l.trim())[0].slice(0, 60);
      await conn.query(statement);
      console.log('   ✔ ' + label);
    }
    console.log(`[db:init] ${statements.length} sentencias aplicadas correctamente.`);
  } finally {
    await conn.end();
  }

  // --- Paso 2b: migraciones (idempotentes) ---
  const MIGRATIONS_FILE = path.join(__dirname, '..', 'sql', 'migrations.sql');
  if (fs.existsSync(MIGRATIONS_FILE)) {
    const conn2 = await mysql.createConnection(dbConfig);
    try {
      const migraciones = splitStatements(fs.readFileSync(MIGRATIONS_FILE, 'utf8'));
      let aplicadas = 0;
      for (const st of migraciones) {
        try {
          await conn2.query(st);
          aplicadas += 1;
        } catch (err) {
          // "Duplicate column" / "Duplicate key name" = ya estaba aplicado.
          if (!/Duplicate column name|Duplicate key name/i.test(err.message)) throw err;
        }
      }
      if (aplicadas) console.log(`[db:init] ${aplicadas} migraciones aplicadas.`);
    } finally {
      await conn2.end();
    }
  }

  // --- Paso 3: verificación final ---
  const check = await mysql.createConnection(dbConfig);
  try {
    const [tables] = await check.query('SHOW TABLES');
    console.log('[db:init] Tablas en ' + dbName + ':');
    tables.forEach((t) => console.log('   - ' + Object.values(t)[0]));

    const [cols] = await check.query("SHOW COLUMNS FROM users LIKE 'saldo'");
    console.log('[db:init] Columna users.saldo ->', cols[0] ? `${cols[0].Type} (default ${cols[0].Default})` : 'NO ENCONTRADA');
  } finally {
    await check.end();
  }
}

main()
  .then(() => {
    console.log('[db:init] Listo.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[db:init] Error:', err.message);
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('        Revisa DB_USER / DB_PASSWORD en tu archivo .env');
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
      console.error('        No hay conexión con el servidor. Revisa DB_HOST / DB_PORT y el firewall de Aiven.');
    }
    process.exit(1);
  });
