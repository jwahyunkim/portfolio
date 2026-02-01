import sql from "mssql";
import mssqlConfig from "../../config/db/mssql.js";

// DB에서 DMPD_SFC 조회
export async function fetchDmpdSfc() {
  const pool = await sql.connect(mssqlConfig);
  const result = await pool.request().query("SELECT TOP 10 * FROM DMPD_SFC");
  return result.recordset;
}
