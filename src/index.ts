import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./db";
import 'dotenv/config';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, env: "dev" });
});

// tiny demo hitting the db (safe even if empty)
app.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
