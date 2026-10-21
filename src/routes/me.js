/**
 * SynapseAI Lab — Rutas del usuario en sesión
 *
 *  GET   /api/me              Datos de la cuenta con sesión activa
 *  PATCH /api/me/profile      Completa el perfil (cuentas creadas con Google)
 *  GET   /api/me/movimientos  Historial de saldo
 */
'use strict';

require('dotenv').config();

const express = require('express');
const { query, queryOne } = require('../../db');
const { asyncHandler, requireAuth } = require('../middleware');
const { publicUser } = require('./auth');
const V = require('../../shared/validators');

const router = express.Router();

/* ------------------------------------------------------------------ *
 * GET /api/me
 * ------------------------------------------------------------------ */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [req.session.user.id]);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(404).json({ ok: false, error: 'La cuenta ya no existe.', code: 'NOT_FOUND' });
    }
    res.json({ ok: true, user: publicUser(user) });
  })
);

/* ------------------------------------------------------------------ *
 * PATCH /api/me/profile
 * ------------------------------------------------------------------ */
router.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const check = V.validateProfile(req.body);
    if (!check.valid) {
      return res.status(422).json({
        ok: false,
        error: 'Revisa los campos marcados.',
        code: 'VALIDATION_ERROR',
        errors: check.errors
      });
    }

    const { cedula, telefono, ocupacion } = check.values;

    const duplicado = await queryOne('SELECT id FROM users WHERE cedula = ? AND id <> ? LIMIT 1', [
      cedula,
      req.session.user.id
    ]);
    if (duplicado) {
      return res.status(409).json({
        ok: false,
        error: 'Ya existe una cuenta registrada con esa cédula.',
        code: 'DUPLICATE',
        errors: { cedula: 'La cédula ya está registrada.' }
      });
    }

    await query('UPDATE users SET cedula = ?, telefono = ?, ocupacion = ?, perfil_completo = 1 WHERE id = ?', [
      cedula,
      telefono,
      ocupacion,
      req.session.user.id
    ]);

    const user = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [req.session.user.id]);
    res.json({ ok: true, message: 'Perfil actualizado correctamente.', user: publicUser(user) });
  })
);

/* ------------------------------------------------------------------ *
 * GET /api/me/movimientos
 * ------------------------------------------------------------------ */
router.get(
  '/movimientos',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT tipo, monto, saldo_final, referencia, created_at
         FROM movimientos_saldo
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 50`,
      [req.session.user.id]
    );
    res.json({
      ok: true,
      movimientos: rows.map((r) => ({
        tipo: r.tipo,
        monto: Number(r.monto),
        saldoFinal: Number(r.saldo_final),
        referencia: r.referencia,
        fecha: r.created_at
      }))
    });
  })
);

module.exports = router;
