import { PGlite } from "@electric-sql/pglite";

async function test() {
  const db = new PGlite("./pgdata");
  await db.waitReady;
  try {
    const res = await db.query("CREATE EXTENSION IF NOT EXISTS btree_gist;");
    console.log("btree_gist creation result:", res);
  } catch (err) {
    console.error("btree_gist error:", err.message);
  }
  process.exit(0);
}

test();
