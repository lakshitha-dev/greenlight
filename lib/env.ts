/** Environment validation.
 *
 *  Without this, a missing or wrong DATABASE_URL surfaces as every route
 *  500-ing at once with an opaque digest — the failure mode that takes longest
 *  to diagnose. Fail once, loudly, naming the variable.
 *
 *  The SQLite relative-path check earns its place: "file:./dev.db" resolves
 *  against the runtime working directory, so after a deploy it can silently
 *  point at a file that does not exist. Prisma then serves an empty database
 *  and every page renders perfectly showing nothing. A crash would be kinder.
 */

export type Env = {
  databaseUrl: string;
  directUrl: string | null;
  processAnalyzerUrl: string;
  anthropicApiKey: string | null;
  nvdApiKey: string | null;
  isProduction: boolean;
};

let cached: Env | null = null;

export function readEnv(): Env {
  if (cached) return cached;

  const problems: string[] = [];
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const isProduction = process.env.NODE_ENV === "production";

  if (!databaseUrl) {
    problems.push(
      "DATABASE_URL is not set. Copy .env.example to .env and set it (SQLite: file:./dev.db)."
    );
  } else if (databaseUrl.startsWith("file:")) {
    if (isProduction) {
      problems.push(
        "DATABASE_URL points at a SQLite file, which cannot work on a serverless host — " +
          "the filesystem is read-only and not shared between invocations. Use Postgres in production."
      );
    }
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    problems.push(
      `DATABASE_URL is neither a SQLite file: URL nor a postgres:// URL (got "${databaseUrl.slice(0, 24)}…").`
    );
  }

  // Only migrations use the direct URL, so its absence is not fatal at
  // runtime — but a pooled URL with no direct counterpart means `prisma
  // migrate` will fail later, and saying so now is cheaper than finding out
  // mid-deploy.
  const directUrl = process.env.DIRECT_DATABASE_URL ?? "";
  if (directUrl && !/^postgres(ql)?:\/\//.test(directUrl))
    problems.push("DIRECT_DATABASE_URL is set but is not a postgres:// URL.");

  const processAnalyzerUrl = process.env.PROCESS_ANALYZER_URL ?? "http://localhost:3000";
  try {
    new URL(processAnalyzerUrl);
  } catch {
    problems.push(`PROCESS_ANALYZER_URL is not a valid URL (got "${processAnalyzerUrl}").`);
  }

  if (problems.length) {
    throw new Error(
      "GreenLight cannot start — the environment is not configured:\n\n" +
        problems.map((p) => `  • ${p}`).join("\n") +
        "\n"
    );
  }

  cached = {
    databaseUrl,
    directUrl: directUrl || null,
    processAnalyzerUrl,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
    nvdApiKey: process.env.NVD_API_KEY || null,
    isProduction,
  };
  return cached;
}

/** Tests exercise both branches, so the memo needs a reset. */
export function resetEnvCache(): void {
  cached = null;
}

/** Non-throwing variant for surfaces that want to report the problem rather
 *  than die — the health endpoint and the error boundary. */
export function checkEnv(): { ok: true } | { ok: false; message: string } {
  try {
    readEnv();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "unknown environment error" };
  }
}
