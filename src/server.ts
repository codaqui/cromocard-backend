import { createApp } from "./app.js";
import { pingDatabase, prisma } from "./db.js";

const port = Number(process.env.PORT ?? 3000);
const app = createApp({ pingDatabase });

const server = app.listen(port, () => {
  console.log(`cromocard-backend ouvindo na porta ${port}`);
});

function shutdown(): void {
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
