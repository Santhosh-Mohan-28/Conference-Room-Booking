import { PGlite } from "@electric-sql/pglite";
import { fromNodeSocket } from "pg-gateway/node";
import net from "net";

async function main() {
  console.log("Initializing PGlite instance...");
  const db = new PGlite("./pgdata");
  await db.waitReady;
  console.log("PGlite is ready!");

  const server = net.createServer(async (socket) => {
    await fromNodeSocket(socket, {
      serverVersion: "16.3",
      auth: {
        async handlePassword() {
          return true; // Accept any password
        },
      },
      async handleQuery(query, { session }) {
        return await db.query(query);
      },
    });
  });

  server.listen(5433, () => {
    console.log("PostgreSQL wire server listening on port 5433!");
    process.exit(0);
  });
}

main().catch(console.error);
