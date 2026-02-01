//odataClient.js
import { log } from '../util/logging.js';

const basic = (u, p) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');

async function fetchJson(url, headers, retries = 3, backoff = 500) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} ${res.statusText}`);
        err.status = res.status;
        err.statusText = res.statusText;
        err.url = url;
        try { err.responseBody = (await res.text()).slice(0, 500); } catch { /* ignore */ }
        throw err;
      }
      return await res.json();
    } catch (e) {
      last = e;
      if (i === retries) break;
      const wait = backoff * Math.pow(2, i);
      log.warn('Retry request', `attempt=${i + 1}`, `wait=${wait}ms`, e.message);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  log.errorEx('OData request failed', last, { url });
  throw last;
}

export async function fetchAllOData({ url, user, pass, pageSize }) {
  const headers = { Authorization: basic(user, pass) };
  let pageUrl = new URL(url);
  pageUrl.searchParams.set('$top', String(pageSize));

  const all = [];
  let page = 0;
  while (true) {
    page++;
    const data = await fetchJson(pageUrl.toString(), headers);
    const rows = Array.isArray(data.value) ? data.value : [];
    all.push(...rows);
    log.info('OData page', page, `rows=${rows.length}`, `total=${all.length}`);
    const next = data['@odata.nextLink'];
    if (!next) break;
    pageUrl = new URL(next, url);
  }
  return all;
}
