import { Router } from "express";
import DatabaseManager from "../db-utils.js";
import { authenticateToken } from "../middleware/auth.js";

const settingsRouter = Router();

settingsRouter.get("/integration", authenticateToken, async (req, res) => {
  const dbManager = new DatabaseManager();

  try {
    await dbManager.connect();
    const settings = await dbManager.getUserIntegration(req.userId);

    res.json({
      settings: settings ?? null,
    });
  } catch (error) {
    console.error("Failed to fetch integration settings", error.message);
    res.status(500).json({
      error: "Failed to load integration settings.",
      details: error.message,
    });
  } finally {
    await dbManager.disconnect();
  }
});

settingsRouter.put("/integration", authenticateToken, async (req, res) => {
  const {
    geminiApiKey,
    geminiModel,
    smtpUser,
    smtpPass,
    smtpHost,
    smtpPort,
  } = req.body || {};

  if (!geminiApiKey && !smtpUser && !smtpPass) {
    return res.status(400).json({
      error: "Please provide at least one credential to update.",
    });
  }

  const dbManager = new DatabaseManager();

  try {
    await dbManager.connect();
    const updated = await dbManager.upsertUserIntegration(req.userId, {
      geminiApiKey,
      geminiModel,
      smtpUser,
      smtpPass,
      smtpHost,
      smtpPort,
    });

    res.json({
      settings: updated,
      message: "Integration settings saved successfully.",
    });
  } catch (error) {
    console.error("Failed to update integration settings", error.message);
    res.status(500).json({
      error: "Failed to save integration settings.",
      details: error.message,
    });
  } finally {
    await dbManager.disconnect();
  }
});

export default settingsRouter;
