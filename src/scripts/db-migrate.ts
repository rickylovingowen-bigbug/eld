import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { sqlOptions } from "@/lib/db-options";
import { loadLocalEnv } from "@/lib/load-env";

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Set DATABASE_URL in .env.local. See .env.example.");
  process.exit(1);
}
const url: string = databaseUrl;

async function main(): Promise<void> {
  const sql = postgres(url, { ...sqlOptions(url), max: 1 });
  await sql`create table if not exists eld_schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )`;
  const dir = path.join(process.cwd(), "supabase/migrations");
  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const version = file.split("_")[0] ?? file;
    const done = await sql`select 1 from eld_schema_migrations where version = ${version}`;
    if (done.length > 0) {
      console.log("skip", file);
      continue;
    }
    const body = fs.readFileSync(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into eld_schema_migrations (version) values (${version})`;
    });
    console.log("applied", file);
  }
  await sql.end();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
