/**
 * SynapseAI Lab — Notificaciones por correo (nodemailer)
 *
 * Al completar un registro, el sistema envía automáticamente un correo a
 * la bandeja del ADMINISTRADOR con los datos del nuevo usuario:
 * Nombre, Apellido, Cédula, Teléfono, Ocupación y Correo verificado.
 */
'use strict';

require('dotenv').config();

const nodemailer = require('nodemailer');
const { escapeHtml } = require('../shared/validators');

let transporter = null;
let transporterResolved = false;

function getTransporter() {
  if (transporterResolved) return transporter;
  transporterResolved = true;

  const host = (process.env.SMTP_HOST || '').trim();
  if (!host) {
    console.warn('[mailer] SMTP_HOST no configurado: las notificaciones por correo están desactivadas.');
    transporter = null;
    return null;
  }

  const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: String(process.env.SMTP_REQUIRE_TLS || 'false').toLowerCase() === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    // Tiempos cortos a propósito: un relay SMTP lento o inaccesible no debe
    // dejar el proceso colgando. El aviso al administrador se envía en
    // segundo plano, así que un corte aquí solo afecta al correo.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000
  });

  return transporter;
}

/** Construye el cuerpo HTML del correo al administrador. */
function buildAdminHtml(user, extra = {}) {
  const e = escapeHtml;
  const rows = [
    ['Nombre', user.nombre],
    ['Apellido', user.apellido],
    ['Cédula de identidad', user.cedula || '—'],
    ['Teléfono', user.telefono || '—'],
    ['Ocupación', user.ocupacion || '—'],
    ['Correo electrónico verificado', user.email]
  ];

  const tableRows = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e8ecf5;color:#5b6a8c;font-size:14px;white-space:nowrap;">${label}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #e8ecf5;color:#101a33;font-size:14px;font-weight:600;">${e(value)}</td>
        </tr>`
    )
    .join('');

  const sourceLabel = extra.origen === 'google' ? 'Google Sign-In (correo verificado)' : 'Formulario web';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nuevo registro en SynapseAI Lab</title>
</head>
<body style="margin:0;padding:0;background:#f3f5fb;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5fb;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 28px rgba(16,26,51,.08);">
          <tr>
            <td style="background:linear-gradient(120deg,#0b1020 0%,#101a35 55%,#0f2a45 100%);padding:28px 32px;">
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#38e1ff,#8b5cf6);"></div>
                <div>
                  <div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:.2px;">SynapseAI Lab</div>
                  <div style="color:#8ea0c8;font-size:12px;margin-top:2px;">Plataforma global de entrenamiento de IA y etiquetado de datos</div>
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;">
              <h2 style="margin:0 0 6px;font-size:18px;color:#101a33;">Nuevo usuario registrado</h2>
              <p style="margin:0 0 18px;font-size:14px;color:#5b6a8c;line-height:1.55;">
                Se ha creado una cuenta en la plataforma. A continuación se muestran los datos registrados.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8ecf5;border-radius:12px;border-collapse:separate;overflow:hidden;">
                ${tableRows}
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
                <tr>
                  <td style="padding:10px 16px;background:#f7f9ff;border-radius:10px;font-size:13px;color:#5b6a8c;">
                    <strong style="color:#101a33;">Origen:</strong> ${e(sourceLabel)}<br>
                    <strong style="color:#101a33;">Bono de bienvenida:</strong> $${e(String(extra.bonus ?? '1.00'))} USD acreditados<br>
                    <strong style="color:#101a33;">Correo verificado:</strong> Sí${user.email_verified ? '' : ' (pendiente)'}<br>
                    <strong style="color:#101a33;">ID de usuario:</strong> #${e(String(user.id))}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;">
              <p style="margin:0;font-size:12px;color:#8a96b2;line-height:1.6;">
                Este mensaje fue generado automáticamente por SynapseAI Lab.
                No respondas a este correo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Versión en texto plano (para clientes que no renderizan HTML). */
function buildAdminText(user, extra = {}) {
  return [
    'SynapseAI Lab — Nuevo usuario registrado',
    '======================================',
    `Nombre:            ${user.nombre}`,
    `Apellido:          ${user.apellido}`,
    `Cédula:            ${user.cedula || '—'}`,
    `Teléfono:          ${user.telefono || '—'}`,
    `Ocupación:         ${user.ocupacion || '—'}`,
    `Correo verificado: ${user.email}`,
    `Origen:            ${extra.origen === 'google' ? 'Google Sign-In' : 'Formulario web'}`,
    `Bono de bienvenida: $${extra.bonus ?? '1.00'} USD`,
    `ID de usuario:     #${user.id}`,
    '',
    'Plataforma global de entrenamiento de IA y etiquetado de datos.'
  ].join('\n');
}

/**
 * Envía la notificación al administrador.
 * @returns {Promise<{sent:boolean, skipped?:boolean, error?:string}>}
 */
async function sendAdminNewUserNotification(user, extra = {}) {
  const t = getTransporter();
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim();

  if (!t) {
    console.log('[mailer] (SMTP no configurado) Nuevo usuario:', user.email);
    return { sent: false, skipped: true, error: 'SMTP no configurado' };
  }
  if (!adminEmail) {
    console.log('[mailer] (ADMIN_EMAIL no configurado) Nuevo usuario:', user.email);
    return { sent: false, skipped: true, error: 'ADMIN_EMAIL no configurado' };
  }

  const from = `"${process.env.MAIL_FROM_NAME || 'SynapseAI Lab'}" <${process.env.SMTP_USER || adminEmail}>`;

  try {
    // Capa extra de seguridad: aunque nodemailer respete sus timeouts,
    // el envío nunca puede dejar el proceso esperando más de 12 s.
    const info = await Promise.race([
      t.sendMail({
        from,
        to: adminEmail,
        subject: `[SynapseAI Lab] Nuevo registro: ${user.nombre} ${user.apellido} <${user.email}>`,
        text: buildAdminText(user, extra),
        html: buildAdminHtml(user, extra)
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tiempo de espera agotado al enviar el correo (12 s).')), 12000)
      )
    ]);
    console.log(`[mailer] Notificación enviada a ${adminEmail} (${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('[mailer] Error al enviar la notificación:', err.message);
    return { sent: false, error: err.message };
  }
}

/** Correo opcional de bienvenida para el propio usuario. */
async function sendWelcomeToUser(user, bonus) {
  const t = getTransporter();
  if (!t || String(process.env.SMTP_SEND_USER_COPY || 'false').toLowerCase() !== 'true') {
    return { sent: false, skipped: true };
  }

  try {
    const info = await t.sendMail({
      from: `"${process.env.MAIL_FROM_NAME || 'SynapseAI Lab'}" <${process.env.SMTP_USER || user.email}>`,
      to: user.email,
      subject: '¡Bienvenido a SynapseAI Lab! Tu cuenta ha sido activada',
      text:
        `¡Bienvenido a SynapseAI Lab! Tu cuenta ha sido activada correctamente. ` +
        `Por completar tu registro en nuestra plataforma de entrenamiento de IA, ` +
        `has recibido un bono inicial de $${bonus} USD en tu saldo.`,
      html: `<div style="font-family:Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;padding:24px;color:#101a33">
               <h2 style="margin:0 0 12px;">¡Bienvenido a SynapseAI Lab!</h2>
               <p style="line-height:1.6;">Tu cuenta ha sido activada correctamente. Por completar tu registro en nuestra
               plataforma de entrenamiento de IA, has recibido un bono inicial de
               <strong>$${escapeHtml(String(bonus))} USD</strong> en tu saldo.</p>
               <p style="color:#5b6a8c;font-size:13px;">Equipo SynapseAI Lab</p>
             </div>`
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('[mailer] Error al enviar el correo de bienvenida:', err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Envía el código de verificación del correo (OTP de un solo uso).
 *
 * Se espera a propósito (a diferencia del aviso al administrador): el
 * código es imprescindible para completar el registro, así que la respuesta
 * HTTP depende de él. El tope de tiempo protege al servidorless de Vercel.
 *
 * @returns {Promise<{sent:boolean, skipped?:boolean, error?:string}>}
 */
async function sendVerificationCode(user, codigo, minutosValidez = 10) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer] (SMTP no configurado) Código de verificación para ${user.email}: ${codigo}`);
    return { sent: false, skipped: true, error: 'SMTP no configurado' };
  }

  const from = `"${process.env.MAIL_FROM_NAME || 'SynapseAI Lab'}" <${process.env.SMTP_USER || user.email}>`;

  try {
    const info = await Promise.race([
      t.sendMail({
        from,
        to: user.email,
        subject: `${String(codigo).length ? '' : ''}Tu código de verificación de SynapseAI Lab es ${codigo}`,
        text:
          `Hola ${user.nombre},\n\n` +
          `Tu código de verificación para SynapseAI Lab es: ${codigo}\n\n` +
          `Caduca en ${minutosValidez} minutos. Si no has solicitado este registro, ` +
          `ignora este mensaje.\n\nEquipo SynapseAI Lab`,
        html: `<div style="font-family:Segoe UI,Roboto,sans-serif;max-width:520px;margin:auto;padding:24px;color:#101a33">
                 <h2 style="margin:0 0 12px;">Verifica tu correo</h2>
                 <p style="line-height:1.6;">Hola ${escapeHtml(user.nombre)}, introduce este código
                 en SynapseAI Lab para confirmar tu registro:</p>
                 <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#0b1020;color:#37e2ff;
                             padding:18px 24px;border-radius:12px;text-align:center;margin:20px 0;">${escapeHtml(codigo)}</div>
                 <p style="color:#5b6a8c;font-size:13px;">Caduca en ${minutosValidez} minutos.
                 Si no has solicitado este registro, ignora este mensaje.</p>
                 <p style="color:#5b6a8c;font-size:13px;margin-top:16px;">Equipo SynapseAI Lab</p>
               </div>`
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tiempo de espera agotado al enviar el código (8 s).')), 8000)
      )
    ]);
    console.log(`[mailer] Código de verificación enviado a ${user.email}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('[mailer] Error al enviar el código de verificación:', err.message);
    return { sent: false, error: err.message };
  }
}

/** Verifica la configuración SMTP (usado por `npm run smtp:check`). */
async function verifyTransport() {
  const t = getTransporter();
  if (!t) return { configured: false, verified: false, error: 'SMTP_HOST no configurado' };
  try {
    await t.verify();
    return { configured: true, verified: true };
  } catch (err) {
    return { configured: true, verified: false, error: err.message };
  }
}

module.exports = {
  sendAdminNewUserNotification,
  sendWelcomeToUser,
  sendVerificationCode,
  verifyTransport,
  buildAdminHtml,
  buildAdminText
};
