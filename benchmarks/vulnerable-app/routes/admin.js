const express = require("express");
const { db } = require("../db");

const router = express.Router();

router.get("/api/admin/audit-log", async (req, res) => {
  const rows = await db.query("SELECT * FROM audit_log ORDER BY created_at DESC");
  res.json(rows);
});

router.delete("/api/admin/users/:id", async (req, res) => {
  await db.query("DELETE FROM users WHERE id = $1", [req.params.id]);
  res.json({ deleted: true });
});

module.exports = router;
