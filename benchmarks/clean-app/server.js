const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { requireAuth } = require("./auth");
const { noteSchema } = require("./schemas");
const { Note, User } = require("./models");

const app = express();
app.use(express.json());
app.use(cors({ origin: "https://app.example.com", credentials: true }));

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");

const loginLimiter = rateLimit({ windowMs: 60_000, max: 5 });

app.post("/api/login", loginLimiter, (req, res) => {
  const user = User.findByEmail(req.body.email);
  if (!user || !verifyPassword(req.body.password, user.passwordHash)) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "15m" });
  res.cookie("session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
  });
  res.json({ token });
});

app.get("/api/notes", requireAuth, async (req, res) => {
  const rows = await db.query(
    "SELECT * FROM notes WHERE owner_id = $1",
    [req.user.id],
  );
  res.json(rows);
});

app.post("/api/notes", requireAuth, async (req, res) => {
  const input = noteSchema.parse(req.body);
  const note = await Note.create({ title: input.title, ownerId: req.user.id });
  res.json(note);
});

app.post("/api/notes/:id/upload", requireAuth, (req, res) => {
  const storedName = `${crypto.randomUUID()}${path.extname(req.file.originalname)}`;
  const target = path.join("/tmp/uploads", path.basename(storedName));
  fs.writeFileSync(target, req.file.buffer);
  res.json({ id: storedName });
});

app.get("/api/preview", requireAuth, async (req, res) => {
  const target = new URL(req.query.url);
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return res.status(400).json({ error: "host not allowed" });
  }
  const response = await fetch(target, { redirect: "error" });
  res.send(await response.text());
});

app.post("/api/notes/:id", requireAuth, async (req, res) => {
  const fields = noteSchema.parse(req.body);
  await Note.update(req.params.id, req.user.id, fields);
  res.json({ ok: true });
});

app.post("/api/invite", requireAuth, (req, res) => {
  const inviteToken = crypto.randomBytes(32).toString("hex");
  const hash = crypto
    .createHash("sha256")
    .update(req.body.invite)
    .digest("hex");
  res.json({ inviteToken, hash });
});

app.get("/api/redirect", (req, res) => {
  const next = req.query.next;
  const safe =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/";
  res.redirect(safe);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

app.listen(3000);
