// src/controllers/postgres/healthController.js
import { ping, checkTable } from '../../services/postgres/healthService.js';

export async function getPing(req, res) {
  try {
    const ok = await ping();
    res.json({ ok });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: 'PostgreSQL ping failed',
      detail: String(err?.message || err),
    });
  }
}

export async function getTableCheck(req, res) {
  const schema = req.query.schema || 'mes';
  const table = req.query.table || 'dmbs_sip_mcs_infor';
  try {
    const result = await checkTable(schema, table);
    res.json({ schema, table, ...result });
  } catch (err) {
    res.status(500).json({
      schema,
      table,
      ok: false,
      error: 'PostgreSQL table check failed',
      detail: String(err?.message || err),
      code: err?.code || null,
    });
  }
}

export default { getPing, getTableCheck };
