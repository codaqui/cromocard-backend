import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { pingDatabase, prisma } from "../../src/db.js";

// Requer DATABASE_URL apontando para um PostgreSQL real (no CI, o container de serviço).
describe("GET /health/db (PostgreSQL real)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("responde 200 quando o banco está acessível", async () => {
    const res = await request(createApp({ pingDatabase })).get("/health/db");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "up" });
  });
});
