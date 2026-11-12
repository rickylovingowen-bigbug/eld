import postgres from "postgres";
import { sqlOptions } from "@/lib/db-options";

let client: ReturnType<typeof postgres> | null = null;

export function getSql(): ReturnType<typeof postgres> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // One client per warm function instance. Remote pools stay at 1 connection.
    client = postgres(url, sqlOptions(url));
  }
  return client;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 2 });
    client = null;
  }
}
