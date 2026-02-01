// src/main/server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import http from "http";
import net from "net";
import crypto from "crypto";
import { app as electronApp } from "electron";

/* ───────── 상수/서명 ───────── */
const API_VERSION =
  process.env.API_VERSION || electronApp.getVersion() || "0.0.0";

const APP_SIGNATURE = (() => {
  let name = "app";
  try {
    name = electronApp.getName?.() || name;
  } catch {}
  const exeOrCwd = process.execPath || process.cwd();
  const hash = crypto
    .createHash("sha1")
    .update(String(exeOrCwd))
    .digest("hex")
    .slice(0, 8);
  return `${name}-${hash}`;
})();

let _httpServer = null;
let _serverOwned = false;
let _serverMode = "shared";
let _serverPort = null;
let _serverHost = null;

/* ───────── 공용 유틸 ───────── */
function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}
function readJSONSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
function writeJSONSafe(p, obj) {
  try {
    ensureDir(path.dirname(p));
    fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
  } catch {}
}

function getLockDir() {
  const dir = path.join(electronApp.getPath("userData"), "local-api");
  ensureDir(dir);
  return dir;
}

function lockPath(mode = "shared") {
  const base =
    mode === "isolated" ? `server.${APP_SIGNATURE}` : `server.shared.v${API_VERSION}`;
  return path.join(getLockDir(), `${base}.lock`);
}
function readLock(mode) {
  const j = readJSONSafe(lockPath(mode));
  return j && j.port && j.pid ? j : null;
}
function writeLock(mode, info) {
  writeJSONSafe(lockPath(mode), info);
}
function clearLock(mode) {
  try {
    fs.unlinkSync(lockPath(mode));
  } catch {}
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function httpJson(host, port, pathName, timeout = 800) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: pathName, timeout }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      try {
        req.destroy();
      } catch {}
      resolve(null);
    });
  });
}
const isAlive = (port, host = "127.0.0.1") =>
  httpJson(host, port, "/health").then((j) => !!(j && j.ok));
const whoAmI = (port, host = "127.0.0.1") => httpJson(host, port, "/whoami");

function isPortBusy(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const s = net
      .createServer()
      .once("error", () => resolve(true))
      .once("listening", () => s.close(() => resolve(false)))
      .listen(port, host);
  });
}

async function findFreePort(preferred = 4000, host = "127.0.0.1") {
  if (!(await isPortBusy(preferred, host))) return preferred;
  for (let p = preferred + 1; p < preferred + 50; p++) {
    if (!(await isPortBusy(p, host))) return p;
  }
  return new Promise((resolve) => {
    const s = net
      .createServer()
      .once("listening", () => {
        const addr = s.address();
        const port = typeof addr === "object" && addr ? addr.port : preferred;
        s.close(() => resolve(port));
      })
      .listen(0, host);
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitReady(port, host = "127.0.0.1", total = 3000, step = 150) {
  const t0 = Date.now();
  while (Date.now() - t0 < total) {
    if (await isAlive(port, host)) return true;
    await wait(step);
  }
  return false;
}
const same = (a, b) => String(a ?? "") === String(b ?? "");

/* ───────── 앱 생성 (/health, /whoami 포함) ───────── */
export async function createApp(meta) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) =>
    res.status(200).json({ ok: true, pid: process.pid, ts: Date.now() }),
  );
  app.get("/whoami", (_req, res) =>
    res.status(200).json({
      pid: process.pid,
      appSignature: APP_SIGNATURE,
      apiVersion: API_VERSION,
      startedAt: meta?.startedAt || null,
      mode: meta?.mode || "shared",
    }),
  );

  // 워밍업용 초경량 핑
  app.get("/api/healthz", (_req, res) =>
    res.status(200).json({ ok: true, ts: Date.now() }),
  );

  // 기존 라우터 연결 (경로는 기존 유지)
  const mssqlRoutes = (await import("./routes/mssqlRoutes.js")).default;
  const oracleRoutes = (await import("./routes/oracleRoutes.js")).default;
  const sapRoutes = (await import("./routes/sapRoutes.js")).default;
  const getIpRoutes = (await import("./routes/getIpRoutes.js")).default;
  const deviceRoutes = (await import("./routes/deviceRoutes.js")).default;

  // 🔹 Postgres 라우터(CJS/ESM 양쪽 대응)
  const pgRoutesMod = await import("./routes/pgRoutes.js");
  const pgRoutes = pgRoutesMod.default || pgRoutesMod;

  app.use("/api", oracleRoutes);
  app.use("/api/mssql", mssqlRoutes);
  app.use("/api", sapRoutes);
  app.use("/api", getIpRoutes);
  app.use("/api/devices", deviceRoutes);

  // 🔹 /db/pg 아래로 PG 라우터 연결
  app.use("/db/pg", pgRoutes);

  // [CHG] MSSQL 풀 워밍업: 불필요한 임포트 제거, 라우터 ping()만 시도 후 폴백
  app.get("/api/mssql/ping", async (_req, res) => {
    try {
      if (typeof mssqlRoutes?.ping === "function") {
        const out = await mssqlRoutes.ping();
        return res.json({
          ok: true,
          via: "mssqlRoutes.ping()",
          out: out ?? null,
        });
      }
      // 라우터에 ping이 없으면, 라우터 로드 자체로도 드라이버/풀 초기화가 되므로 OK 반환
      return res.json({ ok: true, via: "fallback" });
    } catch (e) {
      console.error("[/api/mssql/ping] failed:", e);
      return res
        .status(500)
        .json({ ok: false, error: String(e?.message || e) });
    }
  });

  if (process.env.LOG_ROUTES === "1") {
    try {
      const rows = [];
      app._router?.stack?.forEach((m) => {
        if (m.name === "router" && m.handle?.stack) {
          m.handle.stack.forEach((h) => {
            if (h.route?.path) {
              const methods = Object.keys(h.route.methods)
                .join(",")
                .toUpperCase();
              rows.push(`${methods} ${h.route.path}`);
            }
          });
        } else if (m.route?.path) {
          const methods = Object.keys(m.route.methods)
            .join(",")
            .toUpperCase();
          rows.push(`${methods} ${m.route.path}`);
        }
      });
      console.log("[ROUTES]\n" + rows.map((s) => " - " + s).join("\n"));
    } catch (e) {
      console.log("[ROUTES] dump failed", e);
    }
  }

  // 404
  app.use((req, res, next) => {
    if (res.headersSent) return next();
    res.status(404).json({ error: "NotFound", path: req.originalUrl });
  });

  // 500
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error("[LOCAL API ERROR]", err);
    res
      .status(500)
      .json({ error: "InternalError", detail: String(err?.message || err) });
  });

  return app;
}

/* ───────── 단일/격리 서버 보장 ───────── */
/**
 * @typedef {Object} LocalApiOptions
 * @property {number} [preferredPort]
 * @property {string} [host]
 * @property {"shared"|"isolated"} [mode]
 * @property {boolean} [forceNew]
 */
/**
 * @param {number|LocalApiOptions} [optsOrPort]
 * @param {string} [hostFallback]
 */
export async function ensureLocalApiServer(
  optsOrPort = 4000,
  hostFallback = "127.0.0.1",
) {
  const opts =
    typeof optsOrPort === "number"
      ? { preferredPort: optsOrPort, host: hostFallback, mode: "shared" }
      : optsOrPort || {};

  const preferredPort = opts.preferredPort ?? 4000;
  const host = opts.host ?? "127.0.0.1";
  const mode = opts.mode === "isolated" ? "isolated" : "shared";
  const forceNew = !!opts.forceNew;
  if (!forceNew) {

  // 1) 락 파일 기반 재사용
  const lock = readLock(mode);
  if (lock && isPidAlive(lock.pid) && (await isAlive(lock.port, host))) {
    const who = await whoAmI(lock.port, host);
    if (
      who &&
      who.appSignature === APP_SIGNATURE &&
      (mode === "isolated" || same(who.apiVersion, API_VERSION))
    ) {
      console.log(
        `[LOCAL API] reused: http://${host}:${lock.port} (${mode}, ${APP_SIGNATURE}, v${API_VERSION})`,
      );
      _httpServer = null;
      _serverOwned = false;
      _serverMode = mode;
      _serverPort = lock.port;
      _serverHost = host;
      return { port: lock.port, host, mode, reused: true };
    }
  }

  // 2) 선호 포트 재사용 가능 여부 확인
  if (await isAlive(preferredPort, host)) {
    const who = await whoAmI(preferredPort, host);
    if (
      who &&
      who.appSignature === APP_SIGNATURE &&
      (mode === "isolated" || same(who.apiVersion, API_VERSION))
    ) {
      writeLock(mode, {
        port: preferredPort,
        pid: who.pid ?? 0,
        appSignature: who.appSignature,
        apiVersion: who.apiVersion,
        startedAt: who.startedAt ?? null,
      });
      console.log(
        `[LOCAL API] reused: http://${host}:${preferredPort} (${mode}, ${APP_SIGNATURE}, v${API_VERSION})`,
      );
      _httpServer = null;
      _serverOwned = false;
      _serverMode = mode;
      _serverPort = preferredPort;
      _serverHost = host;
      return { port: preferredPort, host, mode, reused: true };
    }
  }

  // 3) 새 서버 기동
  }
  let port = await findFreePort(preferredPort, host);
  const meta = { startedAt: new Date().toISOString(), mode };
  const app = await createApp(meta);

  await new Promise((resolve, reject) => {
    const server = app.listen(port, host);
    _httpServer = server;
    _serverOwned = true;
    _serverMode = mode;
    _serverPort = port;
    _serverHost = host;

    server.once("listening", resolve);
    server.once("error", async (err) => {
      if (err && (err.code === "EADDRINUSE" || err.code === "EACCES")) {
        const ok = await waitReady(port, host, 2500, 150);
        if (ok) {
          writeLock(mode, {
            port,
            pid: 0,
            appSignature: APP_SIGNATURE,
            apiVersion: API_VERSION,
            startedAt: meta.startedAt,
          });
          return resolve();
        }
        try {
          const alt = await findFreePort(port + 1, host);
          const altServer = (await createApp(meta)).listen(alt, host);
          altServer
            .once("listening", () => {
              port = alt;
              _httpServer = altServer;
              _serverOwned = true;
              _serverMode = mode;
              _serverPort = port;
              _serverHost = host;
              writeLock(mode, {
                port,
                pid: process.pid,
                appSignature: APP_SIGNATURE,
                apiVersion: API_VERSION,
                startedAt: meta.startedAt,
              });
              console.log(
                `✅ 로컬 API 실행(대체 포트): http://${host}:${port} (${mode}, ${APP_SIGNATURE}, v${API_VERSION})`,
              );
              resolve();
            })
            .once("error", reject);
        } catch (e) {
          reject(e);
        }
      } else {
        reject(err);
      }
    });
  });

  writeLock(mode, {
    port,
    pid: process.pid,
    appSignature: APP_SIGNATURE,
    apiVersion: API_VERSION,
    startedAt: meta.startedAt,
  });
  console.log(
    `✅ 로컬 API 실행: http://${host}:${port} (${mode}, ${APP_SIGNATURE}, v${API_VERSION})`,
  );
  return { port, host, mode, reused: false };
}

/* ───────── 하위호환 ───────── */
export async function startLocalApi(port = 4000, host = "127.0.0.1") {
  return ensureLocalApiServer({ preferredPort: port, host, mode: "shared" });
}

export async function stopLocalApiServer() {
  if (!_serverOwned || !_httpServer) {
    return { ok: false, reason: "not-owned" };
  }

  const server = _httpServer;
  _httpServer = null;
  _serverOwned = false;

  return await new Promise((resolve) => {
    try {
      server.close(() => {
        clearLock(_serverMode);
        resolve({
          ok: true,
          port: _serverPort,
          host: _serverHost,
          mode: _serverMode,
        });
      });
    } catch (e) {
      resolve({ ok: false, reason: String(e?.message || e) });
    }
  });
}
