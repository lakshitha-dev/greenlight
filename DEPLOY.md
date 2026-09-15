# Deploying GreenLight

The repository is public at <https://github.com/lakshitha-dev/greenlight> and the
database already exists on Neon with the schema migrated and seeded.

## Fastest path — Vercel dashboard (~3 minutes)

1. <https://vercel.com/new> → **Import** `lakshitha-dev/greenlight`
2. Framework preset: **Next.js** (detected automatically). Leave the build
   command alone — `package.json` already runs `prisma generate && next build`,
   which Vercel needs because the Prisma client is generated, not committed.
3. Add these three environment variables. Copy the values from your local
   `.env` — they are not in this file and must never be committed.

   | Variable | Where it comes from |
   |---|---|
   | `DATABASE_URL` | the **pooled** Neon string (host contains `-pooler`) |
   | `DIRECT_DATABASE_URL` | the **direct** Neon string (no `-pooler`) |
   | `AUTH_SECRET` | already generated in your `.env` |

4. **Deploy.**

The database is already migrated and seeded, so the first page load has data in
it. Sign in with `ops@bistec.example` / `greenlight`.

## Or from the CLI

```bash
vercel login          # opens a browser — this is the step that needs you
vercel link
vercel env add DATABASE_URL production
vercel env add DIRECT_DATABASE_URL production
vercel env add AUTH_SECRET production
vercel --prod
```

## Before you present

- **Warm it once.** Neon's free tier suspends an idle database; the first
  request after that pays a cold start. Load a page a minute before you begin.
- **`AUTH_SECRET` must differ between environments.** Reusing the local one in
  production means a session cookie minted on your laptop is valid on the
  public site.
- **Remove the demo accounts panel** before this is anything but a demo. It is
  already hidden when `NODE_ENV=production`, but the accounts themselves still
  exist in the database with a shared password.

## What is deployed, and what is not

`process-analyzer` runs on a laptop and reads that machine's processes — it
cannot be deployed alongside this, and the hosted app will show the endpoint
estate as unreachable. That is correct behaviour, not a fault: the estate page
says so and the API answers 503. Run the analyzer locally when you want to
demonstrate that half.
