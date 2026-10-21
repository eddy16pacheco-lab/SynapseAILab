/**
 * Verifica la configuración SMTP (nodemailer) y la del correo del administrador.
 *   npm run smtp:check
 */
'use strict';

require('dotenv').config();

const { verifyTransport } = require('../src/mailer');

async function main() {
  const admin = process.env.ADMIN_EMAIL || '';
  console.log('[smtp:check] SMTP_HOST            :', process.env.SMTP_HOST || '(no configurado)');
  console.log('[smtp:check] SMTP_PORT            :', process.env.SMTP_PORT || '(587 por defecto)');
  console.log('[smtp:check] SMTP_USER            :', process.env.SMTP_USER ? '(configurado)' : '(no configurado)');
  console.log('[smtp:check] ADMIN_EMAIL          :', admin || '(no configurado)');

  const result = await verifyTransport();
  if (result.configured && result.verified) {
    console.log('[smtp:check] ✔ Conexión SMTP correcta.');
  } else if (result.configured) {
    console.error('[smtp:check] ✘ Fallo en la verificación SMTP:', result.error);
    console.error('             Revisa SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_SECURE.');
    process.exit(1);
  } else {
    console.warn('[smtp:check] ⚠ SMTP no configurado: los registros NO enviarán correo al administrador.');
  }
}

main().catch((err) => {
  console.error('[smtp:check] Error:', err.message);
  process.exit(1);
});
