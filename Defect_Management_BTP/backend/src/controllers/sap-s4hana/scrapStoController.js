// src/controllers/sap-s4hana/scrapStoController.js
import pool from "../../models/postgres/pool.js";
import * as scrapStoService from "../../services/sap-s4hana/scrapStoService.js";

/**
 * POST /api/sap-s4hana/scrap-sto/put
 * SAP S/4HANA OData4 action put_dm_scrap_sto
 */
export async function putDmScrapSto(req, res) {
  let client;
  try {
    const payload = req.body;
    console.log(
      "[putDmScrapSto] request body:\n",
      JSON.stringify(payload, null, 2),
    );

    if (payload === null || payload === undefined || typeof payload !== "object") {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_BODY",
          message: "JSON body is required",
          details: null,
        },
      });
    }

    const itInput = payload.IT_INPUT || payload.it_input || payload.itInput;
    if (!Array.isArray(itInput) || itInput.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_BODY",
          message: "IT_INPUT must be a non-empty array",
          details: null,
        },
      });
    }

    client = await pool.connect();
    const result = await scrapStoService.putDmScrapSto(client, itInput);
    console.log(
      "[putDmScrapSto] OData response:\n",
      JSON.stringify(result, null, 2),
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err?.code === "VALIDATION_ERROR") {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "invalid request data",
          details: err.details || null,
        },
      });
    }
    console.error("[putDmScrapSto] error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "server error",
        details:
          process.env.NODE_ENV === "development"
            ? String(err?.message || err)
            : null,
      },
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}
