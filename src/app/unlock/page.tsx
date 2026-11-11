import { safeNextPath } from "@/lib/access";

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const query = await searchParams;
  const error =
    query.error === "limited"
      ? "Too many tries. Wait a few minutes and try again."
      : query.error === "mismatch"
        ? "That password did not match."
        : null;
  const next = safeNextPath(query.next);
  return (
    <main className="shell unlock">
      <h1 className="display">This memoir is private.</h1>
      <p className="body-text">Enter the password to open it.</p>
      <form className="unlock-form" action="/api/unlock" method="post">
        <input type="hidden" name="next" value={next} />
        <label className="unlock-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          className="unlock-input"
        />
        {error ? (
          <p className="unlock-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn primary unlock-open" type="submit">
          Open
        </button>
      </form>
    </main>
  );
}
