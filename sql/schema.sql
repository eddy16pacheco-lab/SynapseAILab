-- =====================================================================
--  SynapseAI Lab — Esquema de base de datos (MySQL 8 / Aiven Cloud)
--  Saldo predeterminado: 1.00 USD (bono de bienvenida).
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `synapseai_lab`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `synapseai_lab`;

-- ---------------------------------------------------------------------
-- Tabla principal de usuarios
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre`         VARCHAR(80)  NOT NULL,
  `apellido`       VARCHAR(80)  NOT NULL,
  `cedula`         VARCHAR(32)  DEFAULT NULL,
  `telefono`       VARCHAR(32)  DEFAULT NULL,
  `ocupacion`      VARCHAR(120) DEFAULT NULL,
  `email`          VARCHAR(190) NOT NULL,
  -- ⚠️ PROTOTIPO ACADÉMICO: la contraseña se almacena en TEXTO PLANO.
  -- En producción debe ser bcrypt (cost >= 12) o Argon2id.
  `password`       TEXT         DEFAULT NULL,
  `email_verified` TINYINT(1)   NOT NULL DEFAULT 0,
  `google_sub`     VARCHAR(255) DEFAULT NULL,
  `provider`       ENUM('local','google') NOT NULL DEFAULT 'local',
  `perfil_completo` TINYINT(1)  NOT NULL DEFAULT 0,
  `saldo`          DECIMAL(12,2) NOT NULL DEFAULT 1.00,
  `activo`         TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email`  (`email`),
  UNIQUE KEY `uq_users_cedula` (`cedula`),
  UNIQUE KEY `uq_users_google_sub` (`google_sub`),
  KEY `idx_users_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Libro de movimientos de saldo (auditoría de bonos y consumos)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `movimientos_saldo` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NOT NULL,
  `tipo`       ENUM('bono','deposito','retiro','ajuste') NOT NULL DEFAULT 'bono',
  `monto`      DECIMAL(12,2) NOT NULL,
  `saldo_final` DECIMAL(12,2) NOT NULL,
  `referencia` VARCHAR(190) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mov_user` (`user_id`),
  CONSTRAINT `fk_mov_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Bitácora de registro: traza si el correo al administrador se envió
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `bitacora_registro` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`      INT UNSIGNED DEFAULT NULL,
  `email`        VARCHAR(190) NOT NULL,
  `origen`       ENUM('local','google') NOT NULL DEFAULT 'local',
  `correo_enviado` TINYINT(1) NOT NULL DEFAULT 0,
  `correo_error` TEXT DEFAULT NULL,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bit_user` (`user_id`),
  CONSTRAINT `fk_bit_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
