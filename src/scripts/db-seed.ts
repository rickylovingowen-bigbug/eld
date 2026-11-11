import { ensureSeeded } from "@/lib/catalog-sync";
import { closeDb } from "@/lib/db";

async function main(): Promise<void> {
  await ensureSeeded();
  console.log("Seeded Ricky, chapters, and childhood topics from config/*.json");
  await closeDb();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
