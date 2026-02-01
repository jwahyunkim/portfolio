import { Router } from "express";
import { getDmpdSfc } from "../../controllers/mssql/dmpdSfcController.js";

const router = Router();

// GET /api/mssql/dmpd_sfc
router.get("/dmpd_sfc", getDmpdSfc);

export default router;
