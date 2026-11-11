import type postgres from "postgres";

export interface DbTarget {
  local: boolean;
  transactionPooler: boolean;
}

/** Local plain Postgres stays as it is. Hosted URLs require SSL and a small pool. */
export function dbTarget(databaseUrl: string): DbTarget {
  try {
    const parsed = new URL(databaseUrl);
    const host = parsed.hostname.toLowerCase();
    const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
    const transactionPooler =
      parsed.port === "6543" ||
      parsed.searchParams.get("pgbouncer") === "true" ||
      host.includes("pooler.supabase.com");
    return { local, transactionPooler };
  } catch {
    const local = /@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(databaseUrl);
    const transactionPooler = /:6543(\/|\?|$)/.test(databaseUrl) || databaseUrl.includes("pgbouncer=true");
    return { local, transactionPooler };
  }
}

export function sqlOptions(databaseUrl: string): postgres.Options<Record<string, never>> {
  const target = dbTarget(databaseUrl);
  return {
    max: target.local ? 10 : 1,
    idle_timeout: 20,
    connect_timeout: 10,
    // Supabase transaction mode (port 6543) cannot use prepared statements.
    prepare: !target.transactionPooler,
    ssl: target.local ? false : "require",
  };
}
