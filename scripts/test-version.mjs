import { PGlite } from "@electric-sql/pglite";

async function test() {
  const db = new PGlite("./pgdata");
  await db.waitReady;
  console.log("Ready!");
  try {
    const res = await db.query("SELECT version();");
    console.log("Version:", res.rows);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
