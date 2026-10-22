/**
 * SynapseAI Lab — Validación de credenciales reales del buzón (IMAP)
 *
 * Comprueba que el correo Y la contraseña que introduce la persona
 * correspondan a una cuenta de correo REAL y que esa persona conoce su
 * contraseña. La comprobación se hace autenticándose en el servidor IMAP
 * del proveedor (el mismo mecanismo que usa un cliente de correo).
 *
 * ⚠️ SEGURIDAD
 *   - La contraseña se usa ÚNICAMENTE para este intento de autenticación.
 *   - Nunca se registra en logs, ni en la base de datos, ni en el mensaje
 *     de error. Solo vive en memoria durante la llamada.
 *   - La conexión es TLS (IMAPS, puerto 993) en todo momento.
 *   - Se aborta tras `IMAP_TIMEOUT_MS` para no dejar conexiones abiertas.
 *
 * Nota: Gmail exige "contraseñas de aplicación" (verificación en 2 pasos).
 * Outlook/Hotmail y Yahoo funcionan con la contraseña normal (Yahoo también
 * puede pedir contraseña de aplicación).
 */
'use strict';

require('dotenv').config();

const { ImapFlow } = require('imapflow');

/** Tiempo máximo de la autenticación. */
const IMAP_TIMEOUT_MS = Number.parseInt(process.env.IMAP_TIMEOUT_MS || '10000', 10);

/**
 * Proveedores soportados: host IMAP, puerto y si pide contraseña de aplicación.
 */
const PROVEEDORES = [
  { dominio: 'gmail.com', host: 'imap.gmail.com', puerto: 993, appPassword: true },
  { dominio: 'googlemail.com', host: 'imap.gmail.com', puerto: 993, appPassword: true },
  { dominio: 'outlook.com', host: 'outlook.office365.com', puerto: 993, appPassword: false },
  { dominio: 'hotmail.com', host: 'outlook.office365.com', puerto: 993, appPassword: false },
  { dominio: 'live.com', host: 'outlook.office365.com', puerto: 993, appPassword: false },
  { dominio: 'msn.com', host: 'outlook.office365.com', puerto: 993, appPassword: false },
  { dominio: 'yahoo.com', host: 'imap.mail.yahoo.com', puerto: 993, appPassword: true },
  { dominio: 'ymail.com', host: 'imap.mail.yahoo.com', puerto: 993, appPassword: true },
  { dominio: 'icloud.com', host: 'imap.mail.me.com', puerto: 993, appPassword: true },
  { dominio: 'aivencloud.com', host: null, puerto: 0, appPassword: false }
];

/** Dominios de pruebas descartables (nadie tiene buzón real ahí). */
const DOMINIOS_DE_PRUEBA = ['example.com', 'example.org', 'example.net', 'test.com', 'localhost'];

/** Devuelve la configuración del proveedor a partir del correo. */
function proveedorDe(email) {
  const dominio = String(email || '').toLowerCase().split('@')[1] || '';
  const conocido = PROVEEDORES.find((p) => dominio === p.dominio || dominio.endsWith('.' + p.dominio));
  return {
    dominio,
    conocido: !!conocido,
    requiereAppPassword: conocido ? conocido.appPassword : false,
    host: conocido ? conocido.host : null,
    puerto: conocido ?conocido.puerto : 993
  };
}

/**
 * Comprueba las credenciales contra el buzón real.
 *
 * @param {string} email
 * @param {string} password  Contraseña del buzón. Solo se usa aquí.
 * @returns {Promise<{ok:boolean, valido:boolean, error?:string, codigo?:string, dominio?:string}>}
 */
async function verificarCredenciales(email, password) {
  const info = proveedorDe(email);

  const base = {
    ok: true,
    valido: false,
    dominio: info.dominio,
    requiereAppPassword: info.requiereAppPassword
  };

  if (!email || !password) {
    return { ...base, ok: false, error: 'Faltan el correo o la contraseña.' };
  }

  // Modo desactivado: solo se comprueba el formato del correo.
  if (String(process.env.MAIL_VERIFY_MODE || 'imap').toLowerCase() === 'off') {
    return { ...base, valido: true, codigo: 'VERIFICACION_DESACTIVADA' };
  }

  // Dominios de ejemplo: no tienen buzón real, se acepta el formato.
  if (DOMINIOS_DE_PRUEBA.includes(info.dominio)) {
    return { ...base, valido: true, codigo: 'DOMINIO_DE_PRUEBA' };
  }

  if (!info.host) {
    return {
      ...base,
      ok: false,
      codigo: 'PROVEEDOR_NO_SOPORTADO',
      error:
        `No podemos verificar automáticamente el buzón de @${info.dominio}. ` +
        'Regístrate y te enviaremos un código de verificación por correo.'
    };
  }

  let cliente = null;
  try {
    cliente = new ImapFlow({
      host: info.host,
      port: info.puerto,
      secure: true, // TLS implícito (IMAPS)
      auth: { user: email, pass: password },
      logger: false,
      emitLogs: false
    });

    const timeout = new Promise((_, reject) => {
      const t = setTimeout(
        () => reject(new Error('TIEMPO_AGOTADO')),
        IMAP_TIMEOUT_MS
      );
      if (t.unref) t.unref();
    });

    // `connect()` autentica: si la contraseña es incorrecta, falla ahí.
    await Promise.race([cliente.connect(), timeout]);

    return { ...base, valido: true, codigo: 'CREDENCIALES_VALIDAS' };
  } catch (err) {
    const mensaje = String(err && err.message ? err.message : err);

    if (mensaje.includes('TIEMPO_AGOTADO')) {
      return {
        ...base,
        ok: false,
        codigo: 'TIMEOUT',
        error:
          'El servidor de correo no respondió a tiempo. Inténtalo de nuevo o ' +
          'usa el código de verificación por correo.'
      };
    }

    const credencialesIncorrectas =
      /AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed|authentication/i.test(mensaje) ||
      (err && (err.responseStatus === 'NO' || err.responseCode === 'AUTHENTICATIONFAILED'));

    if (credencialesIncorrectas) {
      return {
        ...base,
        ok: false,
        codigo: 'CREDENCIALES_INVALIDAS',
        error: info.requiereAppPassword
          ? `El correo o la contraseña no son correctos. Si usas @${info.dominio}, ` +
            'necesitas una contraseña de aplicación (activa la verificación en 2 pasos).'
          : 'El correo o la contraseña no son correctos.'
      };
    }

    // Cualquier otro fallo (red, TLS, cuenta bloqueada...).
    return {
      ...base,
      ok: false,
      codigo: 'ERROR_CONEXION',
      error:
        `No se pudo conectar con el servidor de correo de @${info.dominio}. ` +
        'Puedes registrarte y te enviaremos un código de verificación por correo.'
    };
  } finally {
    if (cliente) {
      try {
        await cliente.logout();
      } catch (e) {
        try { cliente.close(); } catch (e2) { /* ignorado */ }
      }
    }
  }
}

module.exports = { verificarCredenciales, proveedorDe, PROVEEDORES, IMAP_TIMEOUT_MS };
