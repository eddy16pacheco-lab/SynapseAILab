/**
 * Comprueba la conexión con Aiven MySQL y el estado del esquema.
 *   npm run db:check
 */
'use strict';

require('dotenv').config();

const { testConnection, query } = require('../db');

async function main() {
  const info = await testConnection();
  console.log('[db:check] Servidor   :', info.version);
  console.log('[db:check] Base datos :', info.db);
  console.log('[db:check] Hora local :', info.now);

  const users = await query('SELECT COUNT(*) AS total FROM users');
  console.log('[db:check] Usuarios registrados:', users[0].total);

  const moves = await query('SELECT COUNT(*) AS total FROM movimientos_saldo');
  console.log('[db:check] Movimientos de saldo  :', moves[0].total);

  const log = await query(
    'SELECT email, origen, correo_enviado, created_at FROM bitacora_registro ORDER BY id DESC LIMIT 5'
  );
  if (log.length) {
    console.log('[db:check] Últimos registros:');
    log.forEach((r) => {
      console.log(
        `   - ${r.created_at} | ${r.email} | ${r.origen} | admin notificado: ${r.correo_enviado ? 'sí' : 'no'}`
      );
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[db:check] Error:', err.message);
    process.exit(1);
  });
