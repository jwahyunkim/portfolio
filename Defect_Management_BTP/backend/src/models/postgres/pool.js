import { Pool } from 'pg';
import pgConfig from '../../config/db/postgres.js';

// server.js 등에서 이미 다른 Pool을 생성해도 문제는 없지만,
// 재사용을 위해 별도 싱글턴 Pool을 제공합니다.
const pool = new Pool(pgConfig);

export default pool;
