// src/config/db/mssql.js
// MSSQL 연결 설정. backend/.env를 파일 기준 경로로 명시 로드하여 실행 디렉터리에 영향받지 않음.
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// 환경변수 로드
const {
  MSSQL_HOST,
  MSSQL_PORT,
  MSSQL_USER,
  MSSQL_PASSWORD,
  MSSQL_DATABASE,
  MSSQL_ENCRYPT,
  MSSQL_TRUST_SERVER_CERTIFICATE,
  MSSQL_POOL_MAX,
  MSSQL_POOL_MIN,
  MSSQL_POOL_IDLE,
  MSSQL_CONN_TIMEOUT,
  MSSQL_REQ_TIMEOUT,
} = process.env;

// mssql(테디어스) 드라이버용 설정
const mssqlConfig = {
  user: MSSQL_USER,
  password: MSSQL_PASSWORD,
  server: MSSQL_HOST,           // 예: DESKTOP-P5T077Q
  database: MSSQL_DATABASE,     // 예: POP_SQLDB_UP
  pool: {
    max: Number(MSSQL_POOL_MAX || 10),
    min: Number(MSSQL_POOL_MIN || 0),
    idleTimeoutMillis: Number(MSSQL_POOL_IDLE || 30000),
  },
  options: {
    port: Number(MSSQL_PORT || 1433),                      // 포트 기본값 1433
    encrypt: MSSQL_ENCRYPT === 'true',                     // 기본 false
    trustServerCertificate: MSSQL_TRUST_SERVER_CERTIFICATE !== 'false', // 기본 true
  },
  connectionTimeout: Number(MSSQL_CONN_TIMEOUT || 15000),
  requestTimeout: Number(MSSQL_REQ_TIMEOUT || 30000),
};

export default mssqlConfig;
