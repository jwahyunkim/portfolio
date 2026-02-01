// clients/odataWriter.js
import { log } from '../util/logging.js';

const POST_DEBUG = String(process.env.LOG_POST_DEBUG || 'false').toLowerCase() === 'true';

const basic = (u, p) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');

export async function getCsrf(url, { user, pass }, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('HTTP Timeout')), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-csrf-token': 'fetch',
        Authorization: basic(user, pass)
      },
      signal: ctrl.signal
    });

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} ${res.statusText}`);
      err.status = res.status;
      err.url = url;
      try { err.responseBody = (await res.text()).slice(0, 500); } catch { /* ignore */ }
      log.errorEx('OData CSRF fetch failed', err, { url, httpStatus: err.status });
      throw err;
    }

    const token = res.headers.get('x-csrf-token');

    let cookies = '';
    if (typeof res.headers.getSetCookie === 'function') {
      try {
        cookies = res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
      } catch {
        cookies = '';
      }
    } else {
      const raw = res.headers.get('set-cookie');
      cookies = raw ? raw.split(',').map(s => s.split(';')[0]).join('; ') : '';
    }

    if (!token) {
      const err = new Error('Missing CSRF token');
      err.url = url;
      log.errorEx('OData CSRF missing token', err, { url });
      throw err;
    }
    return { token, cookies };
  } finally {
    clearTimeout(timer);
  }
}

export async function postJson(url, body, { user, pass }, { token, cookies }, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('HTTP Timeout')), timeoutMs);
  try {
    if (POST_DEBUG) {
      log.infoEx('POST request', { url, requestBody: body });
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-csrf-token': token,
        Cookie: cookies,
        Authorization: basic(user, pass)
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });

    const ct = res.headers.get('content-type') || '';
    const text = await res.text().catch(() => '');

    if (POST_DEBUG) {
      log.infoEx('POST response', { url, httpStatus: res.status, responseBody: text || '[empty]' });
    }

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} ${res.statusText}`);
      err.status = res.status;
      err.url = url;
      err.responseBody = text ? text.slice(0, 500) : undefined;
      log.errorEx('OData POST failed', err, { url, httpStatus: err.status });
      throw err;
    }

    if (ct.includes('application/json') && text) {
      try {
        return JSON.parse(text);
      } catch {
        return { __raw: text };
      }
    }
    return text ? { __raw: text } : {};
  } finally {
    clearTimeout(timer);
  }
}
