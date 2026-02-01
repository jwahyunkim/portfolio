// util/jobState.js
import { promises as fs } from 'fs';
import { resolve, dirname, join } from 'path';

const STATE_DIR = process.env.JOB_STATE_DIR ? String(process.env.JOB_STATE_DIR) : './state';

function safeName(jobId) {
  return String(jobId).replace(/[^a-zA-Z0-9._-]/g, '_') + '.json';
}
function filePath(jobId) {
  return resolve(join(STATE_DIR, safeName(jobId)));
}

async function ensureDir(p) {
  await fs.mkdir(dirname(p), { recursive: true });
}

/**
 * @returns {Promise<number|null>} ms since epoch, or null if not exists
 */
export async function getLastSuccess(jobId) {
  const p = filePath(jobId);
  try {
    const s = await fs.readFile(p, 'utf8');
    const j = JSON.parse(s);
    const iso = j.lastSuccessAt || j.last_success_at;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} jobId
 * @param {number|string|Date} when  ms or ISO or Date
 */
export async function setLastSuccess(jobId, when) {
  const ms =
    typeof when === 'number' ? when :
    when instanceof Date ? when.getTime() :
    Date.parse(String(when));
  const iso = Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();

  const p = filePath(jobId);
  await ensureDir(p);
  const tmp = p + '.tmp';
  const payload = JSON.stringify({ jobId, lastSuccessAt: iso, updatedAt: new Date().toISOString() });
  await fs.writeFile(tmp, payload, 'utf8');
  await fs.rename(tmp, p);
}
