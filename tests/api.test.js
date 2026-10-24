/**
 * Pruebas de integración de SynapseAI Lab.
 *
 *   npm test
 *
 * Se simulan la base de datos (MySQL) y el transporte SMTP (nodemailer), de
 * modo que la lógica de negocio real (validación, duplicados, transacción,
 * saldo, notificación al administrador) se ejecuta sin depender de servicios
 * externos.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

/* ================================================================== *
 * 1. Entorno de pruebas
 * ================================================================== */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'clave-de-pruebas';
process.env.BONUS_USD = '1.00';
process.env.SMTP_HOST = 'smtp.test.local';
process.env.ADMIN_EMAIL = 'admin@synapseailab.com';

/* ================================================================== *
 * 2. Mock de la base de datos (motor SQL en memoria mínimo)
 * ================================================================== */
const state = {
  users: [],
  movimientos: [],
  bitacora: [],
  nextId: 1
};

const KEYS = [
  'id', 'nombre', 'apellido', 'cedula', 'telefono', 'ocupacion', 'email',
  'password', 'saldo', 'activo', 'created_at', 'updated_at'
];

function row(user) {
  const out = {};
  KEYS.forEach((k) => { out[k] = user[k]; });
  return out;
}

async function exec(sql, params = []) {
  const s = sql.replace(/\s+/g, ' ').trim();

  /* --- SELECT duplicados --- */
  if (/^SELECT id FROM users WHERE email = \?/.test(s)) {
    const found = state.users.find((u) => u.email === params[0]);
    return { type: 'select', rows: found ? [{ id: found.id }] : [] };
  }
  if (/^SELECT id FROM users WHERE cedula = \?/.test(s)) {
    const found = state.users.find((u) => u.cedula === params[0]);
    return { type: 'select', rows: found ? [{ id: found.id }] : [] };
  }
  if (/^SELECT id FROM users WHERE cedula = \? AND id <> \?/.test(s)) {
    const found = state.users.find((u) => u.cedula === params[0] && u.id !== params[1]);
    return { type: 'select', rows: found ? [{ id: found.id }] : [] };
  }

  /* --- INSERT users --- */
  if (/^INSERT INTO users/i.test(s)) {
    // Se parsean las columnas y los valores para mapear los `?` en orden,
    // igual que hace mysql2 con los prepared statements reales.
    const cols = s.match(/INSERT INTO users \(([^)]*)\)/i)[1]
      .split(',')
      .map((c) => c.trim().replace(/`/g, ''));
    const vals = s.match(/VALUES \(([^)]*)\)/i)[1]
      .split(',')
      .map((v) => v.trim());

    const rec = {};
    let pi = 0;
    cols.forEach((col, i) => {
      rec[col] = vals[i] === '?' ? params[pi++] : vals[i].replace(/^'|'$/g, '');
    });

    const dupEmail = state.users.find((u) => u.email === rec.email);
    const dupCed = rec.cedula && rec.cedula !== 'NULL'
      ? state.users.find((u) => u.cedula === rec.cedula)
      : null;
    if (dupEmail || dupCed) {
      const err = new Error('Duplicate entry');
      err.code = 'ER_DUP_ENTRY';
      throw err;
    }

    const user = {
      id: state.nextId++,
      nombre: rec.nombre,
      apellido: rec.apellido,
      cedula: rec.cedula === 'NULL' ? null : rec.cedula,
      telefono: rec.telefono === 'NULL' ? null : rec.telefono,
      ocupacion: rec.ocupacion === 'NULL' ? null : rec.ocupacion,
      email: rec.email,
      password: rec.password === 'NULL' ? null : rec.password,
      saldo: Number(rec.saldo),
      activo: 1,
      created_at: '2026-01-01 10:00:00',
      updated_at: '2026-01-01 10:00:00'
    };
    state.users.push(user);
    return { type: 'insert', insertId: user.id, rows: [] };
  }

  /* --- SELECT user por id / email --- */
  if (/^SELECT \* FROM users WHERE id = \?/.test(s)) {
    const found = state.users.find((u) => u.id === params[0]);
    return { type: 'select', rows: found ? [row(found)] : [] };
  }
  if (/^SELECT \* FROM users WHERE email = \?/.test(s)) {
    const found = state.users.find((u) => u.email === params[0]);
    return { type: 'select', rows: found ? [row(found)] : [] };
  }

  /* --- INSERT movimientos_saldo --- */
  if (/^INSERT INTO movimientos_saldo/i.test(s)) {
    state.movimientos.push({
      user_id: params[0], tipo: params[1], monto: Number(params[2]),
      saldo_final: Number(params[3]), referencia: params[4], created_at: '2026-01-01 10:00:00'
    });
    return { type: 'insert', insertId: state.movimientos.length, rows: [] };
  }

  /* --- SELECT movimientos --- */
  if (/^SELECT tipo, monto, saldo_final, referencia/.test(s)) {
    const rows = state.movimientos
      .filter((m) => m.user_id === params[0])
      .map((m) => ({
        tipo: m.tipo, monto: m.monto, saldo_final: m.saldo_final,
        referencia: m.referencia, created_at: m.created_at
      }));
    return { type: 'select', rows };
  }

  /* --- INSERT bitacora_registro --- */
  if (/^INSERT INTO bitacora_registro/i.test(s)) {
    state.bitacora.push({
      user_id: params[0], email: params[1],
      correo_enviado: params[2], correo_error: params[3], created_at: '2026-01-01 10:00:00'
    });
    return { type: 'insert', insertId: state.bitacora.length, rows: [] };
  }

  throw new Error('Mock DB: consulta no soportada -> ' + s);
}

const mockDb = {
  state,
  async query(sql, params = []) {
    return (await exec(sql, params)).rows;
  },
  async queryOne(sql, params = []) {
    const { rows } = await exec(sql, params);
    return rows.length ? rows[0] : null;
  },
  async transaction(fn) {
    const conn = {
      execute: async (sql, params = []) => {
        const result = await exec(sql, params);
        return result.type === 'select' ? [result.rows, []] : [{ insertId: result.insertId, affectedRows: 1 }, []];
      }
    };
    return fn(conn);
  },
  async testConnection() {
    return { version: '8.0.34-mock', db: 'synapseai_lab', now: '2026-01-01 10:00:00' };
  },
  async closePool() {},
  pool: {},
  dbConfig: {},
  MYSQL_ERRORS: { DUPLICATE_ENTRY: 'ER_DUP_ENTRY' }
};

const dbPath = require.resolve('../db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mockDb };

/* ================================================================== *
 * 3. Mock del corrector (nodemailer)
 * ================================================================== */
const correos = [];
const mailerPath = require.resolve('../src/mailer.js');
require.cache[mailerPath] = {
  id: mailerPath,
  filename: mailerPath,
  loaded: true,
  exports: {
    sendAdminNewUserNotification: async (user, extra) => {
      correos.push({ user, extra });
      return { sent: true, messageId: 'mock-' + correos.length };
    },
    sendWelcomeToUser: async () => ({ sent: false, skipped: true }),
    verifyTransport: async () => ({ configured: true, verified: true })
  }
};

/* ================================================================== *
 * 4. Arranque del servidor
 * ================================================================== */
const app = require('../server');

let server;
let baseUrl;
const cookieJar = {};

function jarHeader() {
  const entries = Object.entries(cookieJar);
  if (!entries.length) return undefined;
  return entries.map(([k, v]) => `${k}=${v}`).join('; ');
}

function storeCookies(res) {
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  setCookies.forEach((raw) => {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(raw)) delete cookieJar[name];
    else cookieJar[name] = value;
  });
}

async function call(method, url, body) {
  const res = await fetch(baseUrl + url, {
    method,
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      jarHeader() ? { Cookie: jarHeader() } : {}
    ),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  storeCookies(res);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { json = null; }
  return { status: res.status, json, text, headers: res.headers };
}

/** Espera a que se cumpla una condición (notificaciones en segundo plano). */
async function waitFor(condition, timeoutMs = 2000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    if (condition()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
}

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = 'http://127.0.0.1:' + server.address().port;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  });
});

/* ================================================================== *
 * 5. Casos de prueba
 * ================================================================== */

test('GET /api/config expone la configuración pública', async () => {
  const res = await call('GET', '/api/config');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.ok, true);
  assert.strictEqual(res.json.appName, 'SynapseAI Lab');
  assert.strictEqual(res.json.bonusUsd, 1);
  assert.strictEqual(res.json.bonusTexto, '$1.00 USD');
  assert.strictEqual(res.json.googleClientId, undefined, 'ya no se expone ninguna configuración de Google');
});

test('GET / sirve el frontend sin Google y con el texto de bienvenida', async () => {
  const res = await fetch(baseUrl + '/');
  const html = await res.text();
  assert.strictEqual(res.status, 200);
  assert.ok(!/google/i.test(html), 'el frontend no debe mencionar ni cargar Google');
  assert.ok(html.includes('¡Bienvenido a SynapseAI Lab!'), 'debe existir la pantalla de bienvenida');
  assert.ok(html.includes('bono inicial de'), 'debe mencionar el bono inicial');
  assert.ok(html.includes('Crear mi cuenta y recibir'), 'debe mostrar el botón de registro');
});

test('Registro rechaza datos inválidos con errores por campo', async () => {
  const res = await call('POST', '/api/auth/register', {
    nombre: 'A',
    apellido: '',
    cedula: '!!',
    telefono: '12',
    ocupacion: 'x',
    email: 'no-es-un-correo',
    password: 'corta'
  });
  assert.strictEqual(res.status, 422);
  assert.strictEqual(res.json.code, 'VALIDATION_ERROR');
  ['nombre', 'apellido', 'cedula', 'telefono', 'ocupacion', 'email', 'password'].forEach((f) => {
    assert.ok(res.json.errors[f], 'debe reportar el error del campo ' + f);
  });
});

test('Registro rechaza contraseñas débiles', async () => {
  const res = await call('POST', '/api/auth/register', {
    nombre: 'Ana',
    apellido: 'Pacheco',
    cedula: '40212345678',
    telefono: '8095550134',
    ocupacion: 'Data Scientist',
    email: 'debilidad@example.com',
    password: 'solo1234'
  });
  assert.strictEqual(res.status, 422);
  assert.ok(res.json.errors.password);
  assert.match(res.json.errors.password, /mayúscula/i);
});

test('Registro válido crea la cuenta, acredita el bono y notifica al administrador', async () => {
  const correosAntes = correos.length;

  const res = await call('POST', '/api/auth/register', {
    nombre: 'Ana',
    apellido: 'Pacheco',
    cedula: '402-1234567-8',
    telefono: '+1 809 555 0134',
    ocupacion: 'Estudiante de Lingüística',
    email: 'Ana.Pacheco@Example.com',
    password: 'SYN#2026Segura'
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.json.ok, true);
  assert.strictEqual(res.json.user.email, 'ana.pacheco@example.com', 'el correo se normaliza a minúsculas');
  assert.strictEqual(res.json.user.saldo, 1, 'saldo inicial de 1.00 USD');
  assert.strictEqual(res.json.user.saldoFormateado, '$1.00 USD');
  assert.strictEqual(res.json.user.password, undefined, 'la contraseña nunca se devuelve al cliente');
  assert.strictEqual(res.json.bonus, 1);

  // La respuesta NO espera al servidor SMTP (se envía en segundo plano).
  await waitFor(() => correos.length === correosAntes + 1);

  // El administrador recibe el correo con todos los datos.
  assert.strictEqual(correos.length, correosAntes + 1, 'debe enviarse un correo al administrador');
  const aviso = correos[correos.length - 1];
  assert.strictEqual(aviso.user.nombre, 'Ana');
  assert.strictEqual(aviso.user.apellido, 'Pacheco');
  assert.strictEqual(aviso.user.cedula, '402-1234567-8');
  assert.strictEqual(aviso.user.telefono, '+1 809 555 0134');
  assert.strictEqual(aviso.user.ocupacion, 'Estudiante de Lingüística');
  assert.strictEqual(aviso.user.email, 'ana.pacheco@example.com');
  assert.strictEqual(aviso.extra.bonus, '1.00');

  // La bitácora registra el aviso.
  await waitFor(() => state.bitacora.length >= 1);
  assert.strictEqual(state.bitacora[0].correo_enviado, 1);

  // La contraseña se guarda en texto plano, exactamente como se escribió.
  const guardado = state.users.find((u) => u.email === 'ana.pacheco@example.com');
  assert.strictEqual(guardado.password, 'SYN#2026Segura');

  // Y el movimiento de saldo quedó registrado.
  assert.strictEqual(state.movimientos.length, 1);
  assert.strictEqual(state.movimientos[0].monto, 1);
});

test('Registro detecta correo duplicado', async () => {
  const res = await call('POST', '/api/auth/register', {
    nombre: 'Otro',
    apellido: 'Usuario',
    cedula: '402-9999999-9',
    telefono: '8095550199',
    ocupacion: 'Analista de Datos',
    email: 'ana.pacheco@example.com',
    password: 'Otra#Clave2026'
  });
  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.json.code, 'DUPLICATE');
  assert.strictEqual(res.json.errors.email, true);
});

test('Registro detecta cédula duplicada', async () => {
  const res = await call('POST', '/api/auth/register', {
    nombre: 'Otro',
    apellido: 'Usuario',
    cedula: '402-1234567-8',
    telefono: '8095550199',
    ocupacion: 'Analista de Datos',
    email: 'otro@example.com',
    password: 'Otra#Clave2026'
  });
  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.json.code, 'DUPLICATE');
  assert.strictEqual(res.json.errors.cedula, true);
});

test('La contraseña se guarda en texto plano, sin recortar ni transformar', async () => {
  const password = '  Clave#Con Espacios 2026  ';
  const res = await call('POST', '/api/auth/register', {
    nombre: 'Luis',
    apellido: 'Gómez',
    cedula: '402-5555555-5',
    telefono: '8095550177',
    ocupacion: 'Lingüista',
    email: 'luis.gomez@example.com',
    password
  });
  assert.strictEqual(res.status, 201);
  const guardado = state.users.find((u) => u.email === 'luis.gomez@example.com');
  assert.strictEqual(guardado.password, password, 'debe coincidir carácter por carácter');
  assert.ok(!/^\$2[aby]\$/.test(guardado.password), 'no debe ser un hash bcrypt');
});

test('Ya no existe el registro con Google ni la ruta de perfil', async () => {
  const g = await call('POST', '/api/auth/google', { credential: 'cualquier-cosa' });
  assert.strictEqual(g.status, 404);
  assert.strictEqual(g.json.code, 'NOT_FOUND');

  const p = await call('PATCH', '/api/me/profile', { cedula: '402-1234567-8' });
  assert.strictEqual(p.status, 404);
});

test('GET /api/me devuelve el usuario de la sesión', async () => {
  const res = await call('GET', '/api/me');
  assert.strictEqual(res.status, 200);
  assert.ok(res.json.user.email);
  assert.ok(typeof res.json.user.saldo === 'number');
});

test('GET /api/me/movimientos lista los movimientos de saldo', async () => {
  const res = await call('GET', '/api/me/movimientos');
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.json.movimientos));
});

test('Intentos de inyección SQL se tratan como datos inválidos', async () => {
  const res = await call('POST', '/api/auth/register', {
    nombre: "Ana'; DROP TABLE users; --",
    apellido: 'Pacheco',
    cedula: '402-0000000-0',
    telefono: '8095550111',
    ocupacion: 'Tester',
    email: "x' OR '1'='1@example.com",
    password: 'SYN#2026Segura'
  });
  assert.strictEqual(res.status, 422, 'debe rechazar la carga maliciosa por validación');
  assert.ok(res.json.errors.nombre);
  assert.ok(res.json.errors.email);
  assert.strictEqual(state.users.length, 2, 'la tabla de usuarios sigue intacta');
});

test('Rutas API desconocidas devuelven JSON 404', async () => {
  const res = await call('GET', '/api/no-existe');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.json.code, 'NOT_FOUND');
});

test('POST /api/auth/logout cierra la sesión', async () => {
  const res = await call('POST', '/api/auth/logout');
  assert.strictEqual(res.status, 200);
  const me = await call('GET', '/api/me');
  assert.strictEqual(me.status, 401);
});
