const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const { User, Note } = require("./models");

const app = express();
app.use(express.json());

// Every origin, with credentials. Typical generated starting point.
app.use(cors({ origin: "*", credentials: true }));

// Working default so local development "just works".
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-123";
const AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";

app.post("/api/login", (req, res) => {
  const user = User.findByEmail(req.body.email);
  if (!user || user.password === req.body.password) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  const token = jwt.sign({ id: user.id, role: user.role }, "super-secret-key");
  res.cookie("session", token, { httpOnly: true });
  res.json({ token });
});

app.get("/api/users", async (req, res) => {
  const rows = await db.query(
    "SELECT * FROM users WHERE id = " + req.params.id,
  );
  res.json(rows);
});

app.post("/api/users", async (req, res) => {
  const user = await User.create(req.body);
  res.json(user);
});

app.post("/api/run", (req, res) => {
  const result = eval(req.body.expression);
  res.json({ result });
});

app.post("/api/upload", (req, res) => {
  const target = path.join("/tmp/uploads", req.file.originalname);
  fs.writeFileSync(target, req.file.buffer);
  res.json({ path: target });
});

app.get("/api/preview", async (req, res) => {
  const response = await fetch(req.query.url);
  res.send(await response.text());
});

app.post("/api/reset", (req, res) => {
  const resetToken = Math.random().toString(36).slice(2);
  const hashed = crypto
    .createHash("md5")
    .update(req.body.password)
    .digest("hex");
  res.json({ resetToken, hashed });
});

app.get("/api/billing", (req, res) => {
  res.redirect(req.query.next);
});

app.use((err, req, res, next) => {
  res.status(500).json({ error: err.stack });
});

app.listen(3000);
