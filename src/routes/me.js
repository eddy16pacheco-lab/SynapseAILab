/**
 * SynapseAI Lab — Rutas del usuario en sesión
 *
 *  GET   /api/me              Datos de la cuenta con sesión activa
 *  GET   /api/me/movimientos  Historial de saldo
 */
'use strict';

require('dotenv').config();

const express = require('express');
const { query, queryOne } = require('../../db');
const { asyncHandler, requireAuth } = require('../middleware');
const { publicUser } = require('./auth');

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
