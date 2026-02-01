// src/server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import sql from "mssql";
import mssqlConfig from "./config/db/mssql.js";
import mssqlRoutes from "./routes/mssql/index.js";

// 단일 PG 풀 사용: models/postgres/pool.js
import pool from "./models/postgres/pool.js";
import postgresRoutes from "./routes/postgres/index.js";

// SAP S/4HANA (OData)
import sapS4hanaRoutes from "./routes/sap-s4hana/index.js";

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.json());

// MSSQL 연결 확인
const mssqlPool = new sql.ConnectionPool(mssqlConfig);
mssqlPool.on("error", (err) => {
  console.error("MSSQL pool error", err);
});
(async () => {
  try {
    await mssqlPool.connect();
    console.log("MSSQL connected");
    // 라우트에서 필요 시 사용할 수 있도록 저장
    app.locals.mssqlPool = mssqlPool;
  } catch (err) {
    console.error("MSSQL connection error", err);
  }
})();

// PostgreSQL 풀 생성 및 연결 확인(로그만)
// 단일 공용 풀 사용(models/postgres/pool.js)
pool.on("error", (err) => {
  console.error("PostgreSQL idle client error", err);
});
(async () => {
  try {
    const c = await pool.connect();
    await c.query("SELECT 1");
    c.release();
    console.log("PostgreSQL connected");
  } catch (err) {
    console.error("PostgreSQL connection error", err);
  }
})();

// health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// 라우트
app.use("/api/mssql", mssqlRoutes);
app.use("/api/postgres", postgresRoutes);

// SAP S/4HANA OData 라우트
app.use("/api/sap-s4hana", sapS4hanaRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
