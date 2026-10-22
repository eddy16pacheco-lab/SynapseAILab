-- =====================================================================
--  SynapseAI Lab — Migraciones para bases de datos ya existentes
--
--  Ejecutar DESPUÉS de sql/schema.sql:
--      npm run db:init
--
--  Cada sentencia se aplica de forma idempotente: si el cambio ya está
--  aplicado, no se repite (init-db.js ignora los errores "duplicate column").
-- =====================================================================

-- 1) Marca de cómo se verificó el correo (IMAP / Google / código OTP)
ALTER TABLE `users` ADD COLUMN `verificado_por` VARCHAR(16) DEFAULT NULL AFTER `email_verified`;

-- 2) Índice para buscar rápido las cuentas pendientes de verificación
--    (ALTER TABLE ... ADD INDEX IF NOT EXISTS no existe en MySQL 8:
--     si da error "Duplicate key name", el índice ya estaba creado).
ALTER TABLE `users` ADD INDEX `idx_users_email_verified` (`email_verified`);
