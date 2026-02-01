// src/models/sap/moldOdataDao.js
import https from "https";

/**
 * OData 문자열 값에서 작은따옴표(') escape 처리
 * OData에서 문자열 내 ' 는 '' 로 escape
 */
function escapeODataString(s) {
  return String(s).replace(/'/g, "''");
}

function joinUrl(base, path) {
  const b = String(base || "").trim().replace(/\/+$/, "");
  const p = String(path || "").trim().replace(/^\/+/, "");
  return `${b}/${p}`;
}

function requestJson(urlStr, { method = "GET", headers = {}, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    let req;
    try {
      const url = new URL(urlStr);

      const options = {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      };

      req = https.request(options, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode || 0;

          if (status < 200 || status >= 300) {
            return reject(new Error(`OData HTTP ${status}: ${body?.slice(0, 500)}`));
          }

          try {
            const json = JSON.parse(body);
            resolve(json);
          } catch (e) {
            reject(new Error(`OData JSON parse error: ${String(e?.message || e)}`));
          }
        });
      });

      req.on("error", (e) => reject(e));
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error("OData request timeout"));
      });

      req.end();
    } catch (e) {
      if (req) req.destroy();
      reject(e);
    }
  });
}

/**
 * MoldlistSet에서 ZZ_MO_SERIAL 조회
 *
 * env:
 *  - SAP_S4HANA_ODATA_BASE_URL
 *  - SAP_USER
 *  - SAP_PASSWORD
 */
export async function fetchMoldSerial({ plant, mold_code, mold_size }) {
  const baseUrl = process.env.SAP_S4HANA_ODATA_BASE_URL;
  const user = process.env.SAP_USER;
  const pass = process.env.SAP_PASSWORD;

  if (!baseUrl) {
    throw new Error("Missing env: SAP_S4HANA_ODATA_BASE_URL");
  }
  if (!user) {
    throw new Error("Missing env: SAP_USER");
  }
  if (!pass) {
    throw new Error("Missing env: SAP_PASSWORD");
  }

  const endpoint = joinUrl(
    baseUrl,
    "/sap/opu/odata/SAP/ZPM_IF_DM003_SRV/MoldlistSet"
  );

  const filter = [
    `WERKS eq '${escapeODataString(plant)}'`,
    `ZZ_MO_CODE eq '${escapeODataString(mold_code)}'`,
    `ZZ_MO_SIZE eq '${escapeODataString(mold_size)}'`,
  ].join(" and ");

  const qs = new URLSearchParams();
  qs.set("$format", "json");
  qs.set("$filter", filter);

  const url = `${endpoint}?${qs.toString()}`;

  const auth = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
  };

  const json = await requestJson(url, { headers });

  const results = json?.d?.results;
  if (!Array.isArray(results) || results.length === 0) {
    return { zz_mo_serial: "", count: 0 };
  }

  const first = results[0] || {};
  const serial = typeof first.ZZ_MO_SERIAL === "string" ? first.ZZ_MO_SERIAL : "";

  return { zz_mo_serial: serial, count: 1 };
}
