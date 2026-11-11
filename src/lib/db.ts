import postgres from "postgres";

let client: ReturnType<typeof postgres> | null = null;

export function getSql(): ReturnType<typeof postgres> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 5 });
  }
  return client;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 2 });
    client = null;
  }
}
