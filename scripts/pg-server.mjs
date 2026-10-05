import { PGlite } from "@electric-sql/pglite";
import { fromNodeSocket } from "pg-gateway/node";
import net from "net";

const PORT = 5433;
const db = new PGlite("./pgdata");

async function startServer() {
  await db.waitReady;
  console.log(`[PG-Server] PGlite engine initialized at ./pgdata`);

  const server = net.createServer(async (socket) => {
    socket.on("error", (err) => {
      // Ignore client disconnect errors
    });

    await fromNodeSocket(socket, {
      serverVersion: "16.3",
      auth: {
        async handlePassword() {
          return true;
        },
      },
      async handleQuery(query, { session }) {
        try {
          return await db.query(query);
        } catch (err) {
          // Return Postgres formatted error
          throw err;
        }
      },
    });
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[PG-Server] Local PostgreSQL server listening on 127.0.0.1:${PORT}`);
  });

  process.on("SIGINT", () => {
    console.log("[PG-Server] Shutting down...");
    server.close();
    process.exit(0);
  });
}

startServer().catch((err) => {
  console.error("[PG-Server] Failed to start:", err);
  process.exit(1);
});
