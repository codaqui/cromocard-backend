import express, { type Express } from "express";

export interface AppDeps {
  /** Verifica a conexão com o banco. Lança erro se o banco estiver indisponível. */
  pingDatabase?: () => Promise<void>;
}

export function createApp(deps: AppDeps = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/health/db", async (_req, res) => {
    if (!deps.pingDatabase) {
      res.status(503).json({ status: "error", database: "not configured" });
      return;
    }
    try {
      await deps.pingDatabase();
      res.json({ status: "ok", database: "up" });
    } catch {
      res.status(503).json({ status: "error", database: "down" });
    }
  });

  return app;
}
