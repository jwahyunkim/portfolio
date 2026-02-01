import https from "https";

const SERVICE_ROOT_PATH =
  "/sap/opu/odata4/sap/zmm_dm_scrap_sto_v4/srvd_a2x/sap/zmm_dm_scrap_sto";
const ENTITY_SET = "ZMM_I_DM_SCRAP_STO";
const ACTION_NAME = "SAP__self.put_dm_scrap_sto";

function joinUrl(base, path) {
  const b = String(base || "").trim().replace(/\/+$/, "");
  const p = String(path || "").trim().replace(/^\/+/, "");
  return `${b}/${p}`;
}

function appendSapClient(urlStr, sapClient) {
  const client = String(sapClient || "").trim();
  if (!client) return urlStr;
  const url = new URL(urlStr);
  if (!url.searchParams.has("sap-client")) {
    url.searchParams.set("sap-client", client);
  }
  return url.toString();
}

function requestJson(
  urlStr,
  { method = "GET", headers = {}, body = null, timeoutMs = 15000 } = {}
) {
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
          const bodyText = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode || 0;

          if (status < 200 || status >= 300) {
            return reject(
              new Error(`OData HTTP ${status}: ${bodyText?.slice(0, 500)}`)
            );
          }

          if (!bodyText || bodyText.trim().length === 0) {
            return resolve(null);
          }

          try {
            const json = JSON.parse(bodyText);
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

      if (body) {
        req.write(body);
      }

      req.end();
    } catch (e) {
      if (req) req.destroy();
      reject(e);
    }
  });
}

/**
 * env:
 *  - SAP_S4HANA_ODATA_BASE_URL
 *  - SAP_USER
 *  - SAP_PASSWORD
 *  - SAP_S4HANA_SERVICE_VERSION (optional, default 0001)
 */
export async function putDmScrapSto(payload) {
  const baseUrl = process.env.SAP_S4HANA_ODATA_BASE_URL;
  const user = process.env.SAP_USER;
  const pass = process.env.SAP_PASSWORD;
  const serviceVersion =
    String(process.env.SAP_S4HANA_SERVICE_VERSION || "0001").trim() || "0001";

  if (!baseUrl) {
    throw new Error("Missing env: SAP_S4HANA_ODATA_BASE_URL");
  }
  if (!user) {
    throw new Error("Missing env: SAP_USER");
  }
  if (!pass) {
    throw new Error("Missing env: SAP_PASSWORD");
  }

  const serviceRoot = joinUrl(baseUrl, `${SERVICE_ROOT_PATH}/${serviceVersion}`);
  const actionUrl = joinUrl(serviceRoot, `${ENTITY_SET}/${ACTION_NAME}`);

  const auth = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  const { csrfToken, cookies } = await fetchCsrfToken(serviceRoot, auth);

  const bodyStr = JSON.stringify(payload ?? {});
  // console.log("[putDmScrapSto] OData request body:\n", bodyStr);
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(bodyStr),
    "x-csrf-token": csrfToken,
  };

  if (cookies) {
    headers.Cookie = cookies;
  }

  const json = await requestJson(actionUrl, {
    method: "POST",
    headers,
    body: bodyStr,
    timeoutMs: 30000,
  });

  return json;
}

async function fetchCsrfToken(urlStr, auth) {
  return new Promise((resolve, reject) => {
    let req;
    try {
      const url = new URL(urlStr);

      const options = {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`,
          "x-csrf-token": "fetch",
          Accept: "application/json",
        },
      };

      req = https.request(options, (res) => {
        const csrfToken = res.headers["x-csrf-token"];

        if (!csrfToken) {
          return reject(new Error("CSRF token not found in response headers"));
        }

        const setCookieHeaders = res.headers["set-cookie"];
        let cookies = null;

        if (Array.isArray(setCookieHeaders)) {
          cookies = setCookieHeaders
            .map((cookie) => cookie.split(";")[0])
            .join("; ");
        } else if (setCookieHeaders) {
          cookies = setCookieHeaders.split(";")[0];
        }

        res.on("data", () => {});
        res.on("end", () => resolve({ csrfToken, cookies }));
      });

      req.on("error", (e) => reject(e));
      req.setTimeout(10000, () => {
        req.destroy(new Error("CSRF token fetch timeout"));
      });

      req.end();
    } catch (e) {
      if (req) req.destroy();
      reject(e);
    }
  });
}
