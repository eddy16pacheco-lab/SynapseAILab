/**
 * SynapseAI Lab — Verificación estricta de identidad con Google
 *
 * Usa la librería oficial `google-auth-library` (OAuth2Client.verifyIdToken).
 * El id_token firmado por Google se valida criptográficamente y además se
 * comprueban de forma explícita:
 *
 *   1. La audiencia (`aud`) coincide con GOOGLE_CLIENT_ID.
 *   2. El emisor (`iss`) es una cuenta de Google (no Google Workspace Fibers).
 *   3. El token no ha expirado (`exp`).
 *   4. El correo está VERIFICADO por Google (`email_verified === true`).
 *   5. El correo pertenece a un dominio permitido (si se configuró).
 */
'use strict';

require('dotenv').config();

const { OAuth2Client } = require('google-auth-library');

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '');

/** Error de negocio con código HTTP. */
class AuthError extends Error {
  constructor(message, status = 401, code = 'GOOGLE_AUTH_FAILED') {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Verifica el id_token de Google y devuelve el payload normalizado.
 * @param {string} idToken  Token JWT devuelto por Google Identity Services.
 * @returns {Promise<Object>} { sub, email, emailVerified, name, picture, givenName, familyName }
 */
async function verifyGoogleIdToken(idToken) {
  if (typeof idToken !== 'string' || idToken.trim() === '') {
    throw new AuthError('No se recibió el token de Google (credential).', 400, 'MISSING_TOKEN');
  }

  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken: idToken.trim(),
      clientId: process.env.GOOGLE_CLIENT_ID || undefined
    });
  } catch (err) {
    throw new AuthError('El token de Google no pudo ser verificado: ' + err.message, 401, 'INVALID_TOKEN');
  }

  const payload = ticket.getPayload();
  if (!payload) {
    throw new AuthError('El token de Google no contiene información válida.', 401, 'EMPTY_PAYLOAD');
  }

  /* --- 1) Audiencia --- */
  if (process.env.GOOGLE_CLIENT_ID && payload.aud !== process.env.GOOGLE_CLIENT_ID) {
    throw new AuthError('El token de Google no fue emitido para esta aplicación.', 401, 'AUDIENCE_MISMATCH');
  }

  /* --- 2) Emisor --- */
  if (!GOOGLE_ISSUERS.includes(payload.iss)) {
    throw new AuthError('El emisor del token no es una cuenta de Google válida.', 401, 'ISSUER_MISMATCH');
  }

  /* --- 3) Caducidad --- */
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= nowSeconds) {
    throw new AuthError('El token de Google ha expirado. Vuelve a intentarlo.', 401, 'TOKEN_EXPIRED');
  }
  if (payload.iat && payload.iat > nowSeconds + 60) {
    throw new AuthError('El token de Google tiene una fecha de emisión inválida.', 401, 'TOKEN_FUTURE');
  }

  /* --- 4) Correo verificado por Google (obligatorio) --- */
  const emailVerified =
    payload.email_verified === true ||
    payload.email_verified === 'true' ||
    payload.email_verified === 1;

  if (!emailVerified) {
    throw new AuthError(
      'Google no ha verificado el correo de esta cuenta. Se requiere un correo verificado.',
      403,
      'EMAIL_NOT_VERIFIED'
    );
  }

  /* --- 5) Correo presente y con formato válido --- */
  if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) {
    throw new AuthError('La cuenta de Google no expone un correo electrónico válido.', 400, 'EMAIL_INVALID');
  }

  /* --- 6) Dominio restringido (opcional) --- */
  const hostedDomain = (process.env.GOOGLE_HOSTED_DOMAIN || '').trim();
  if (hostedDomain) {
    const emailDomain = payload.email.split('@')[1].toLowerCase();
    if (emailDomain !== hostedDomain.toLowerCase()) {
      throw new AuthError(
        'Solo se permiten cuentas del dominio ' + hostedDomain + '.',
        403,
        'DOMAIN_NOT_ALLOWED'
      );
    }
  }

  const nameParts = String(payload.name || '').trim().split(/\s+/).filter(Boolean);

  return {
    sub: String(payload.sub),
    email: String(payload.email).toLowerCase(),
    emailVerified: true,
    name: String(payload.name || ''),
    givenName: payload.given_name || nameParts[0] || '',
    familyName: payload.family_name || nameParts.slice(1).join(' ') || '',
    picture: payload.picture || '',
    locale: payload.locale || 'es'
  };
}

module.exports = {
  verifyGoogleIdToken,
  AuthError,
  GOOGLE_ISSUERS
};
