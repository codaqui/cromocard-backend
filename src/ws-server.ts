// Esqueleto do serviço de tempo real (imagem cromocard-ws). Por enquanto só expõe
// /health na porta 3001; o servidor WebSocket da equipe entra aqui.
import { createApp } from "./app.js";
import { pingDatabase, prisma } from "./db.js";

const port = Number(process.env.PORT ?? 3001);
const app = createApp({ pingDatabase });

const server = app.listen(port, () => {
  console.log(`cromocard-ws ouvindo na porta ${port}`);
});

function shutdown(): void {
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
