import { fetchDmpdSfc } from "../../services/mssql/dmpdSfcService.js";

export async function getDmpdSfc(req, res) {
  try {
    const data = await fetchDmpdSfc();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
