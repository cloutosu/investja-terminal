# InvestJA Terminal

Live dashboard + trade console for an [investja.org](https://investja.org) team. Express proxy (login, scrape, trade, scheduler) + Vite/React 19/TypeScript/Tailwind v4 frontend.

```
browser (5173) ──► api.ts ──► Express proxy (3001) ──► investja.org
                                   │ scheduled-trades.json, trades-log.json
```

Only `server.js` talks to investja.org. The frontend talks to the proxy through `src/lib/api.ts` and nothing else.

## Local dev

```bash
npm install
cp .env.example .env                 # backend: USER, PASS, BASE_URL, PORT, FRONTEND_URL
cp .env.frontend.example .env.local  # frontend: VITE_API_URL, VITE_PIN, VITE_TARGET_TEAM
npm run dev                          # vite on :5173 + node server.js on :3001
```

`npm run build` type-checks and builds to `dist/`.

`USER` collides with the shell's `$USER`; `server.js` reads it straight from `.env` so the file always wins. On Render there is no `.env`, so the dashboard value is used.

Optional backend env: `CACHE_TTL_MS` (default `0`; see limitation 1).

### Testing without the real site

`npm run mock` starts a fake investja.org on `:4000` (2,525 teams, moving prices). Run the backend against it with `BASE_URL=http://localhost:4000 PASS=mock node server.js`.

## Design

Three themes, switched from the dots in the header and remembered per browser: **Ember** (dark, orange glow), **Frost** (light glass), **Dune** (warm cream). All colours are CSS variables in `src/styles/globals.css`; chart colours mirror them in `src/lib/theme.ts`.

- Desktop shows everything on one screen. Phones get tabs (Home / Rankings / Activity) with a floating bottom nav and bottom-sheet modals.
- The hero chart plots your own series from the Dexie snapshots: **Equity** or **Earned today** (equity minus the day anchor), 1H/6H/24H, with a per-tick change bar strip under it. Drag across it to scrub.
- Trades, Sell All and scheduling confirm with a swipe. The thumb turns into a ring while the order is in flight, closes into a circle and draws a checkmark on success, and shakes and resets on an error.

## How it works

- **Cache bypass.** The site caches pages until a fresh login. Every poll logs in (`GET` login page, then `POST teamname/teampassword`), then fetches the page with the new cookie. Concurrent callers share one in-flight login (promise mutex); a login finished <2 s ago is reused so the second endpoint can't invalidate the first one's session.
- **Scheduler.** `POST /api/run-scheduler-tick` runs due trades through the same code path as `/api/trade`. Success removes the task. Failure keeps it, sets `retrying`, and tries again 5 minutes later (up to 288 tries, about 24 h, then `failed`). The queue lives in `scheduled-trades.json` and survives restarts.
- **Snapshots (Dexie).** Only your team, the top 20 and any team you opened in the history modal are stored. 5 s resolution for 2 h, thinned to 1/min up to 24 h, then dropped.
- **Day anchor.** The first poll of each ET day stores your starting equity and holdings. The "today" delta and the daily report use it. Open the app before 9:30 ET so it captures the true open.
- **Daily report.** At 4:05 PM ET (or on first open after that) the frontend sends the anchor and current state to `POST /api/generate-daily-report`; the backend adds buy/sell counts from `trades-log.json` and the frontend saves the result to Dexie. Per-ticker contribution = end value minus start value scaled to the end quantity, so it ignores size changes you made yourself. Tickers opened that day have no basis and are skipped.

Notes on decisions:

- PIN is `VITE_PIN.length` boxes wide (any length; there is no built-in default).
- Times show as `ET` (Toronto zone, handles DST) rather than a fixed `EST`.
- Leaderboard row layout animation is on for up to 200 rows; "Show all" (2,525 rows) renders without it.
- Sell All needs a second click to confirm. It is disabled during the 1-hour hold of a buy made through this terminal (tracked in localStorage).
- The Position Sizer uses the site's own CAD value per share for held tickers (no conversion by us). For tickers you don't hold, type a CAD price.
- The PIN gate is cosmetic. `VITE_PIN` ships in the JS bundle and the backend has no auth, so anyone with the proxy URL can read your dashboard and place trades. Keep the proxy URL private, or add an auth header in front of it before sharing it.

## Sharing with friends

The repo is safe to make public: `.env` is gitignored and the examples hold placeholders. Put the real `USER`/`PASS` only in Render's env vars.

The deployed site is not private, though. The PIN is checked in the browser and `VITE_PIN` is in the JS bundle. Anyone who knows your Render URL can read your portfolio and place trades through `/api/trade`. Share the Netlify link only with people you'd trust with the account, or add a server-side check before posting it widely.

## Deploy (Netlify only)

The proxy also ships as Netlify Functions in `netlify/functions/`, so the whole app is one Netlify site. No Render, no cron service.

1. New site from Git, pick this repo. Netlify reads `netlify.toml` (build `npm run build`, publish `dist`, functions in `netlify/functions`).
2. Site configuration → Environment variables:
   - `INVESTJA_USER`, `INVESTJA_PASS`: your investja login (used server-side only; never `VITE_`-prefixed).
   - `VITE_PIN`, `VITE_TARGET_TEAM`: the PIN screen and the team to highlight.
   - Leave `VITE_API_URL` unset: the production build calls `/api/*` on the same site.
3. Deploy, then Trigger deploy → Clear cache and deploy site after any env change (`VITE_*` values are baked in at build time).
4. Check `https://<site>.netlify.app/api/health`, then `/api/live`.

How it differs from local dev: each request does its own login (stateless), `/api/live` returns the dashboard and leaderboard from one login, the queue and trade log live in Netlify Blobs, and `tick.mjs` runs every minute on Netlify's scheduler to execute due trades. Overlapping ticks are guarded by a 90 s soft lock on each task.

Limits: functions time out after about 10 s on the free plan, and every poll is an invocation. In production the frontend polls every 5 s only while the tab is visible and the market is open, and every 30 s otherwise. Several friends keeping tabs open all day can exhaust the free allowance. `Express server.js` (below) has no such limit.

### Alternative: Express on Render
`server.js` is the same proxy as a long-running server. Deploy it as a Render web service (`npm install`, `node server.js`, env `USER`, `PASS`, `BASE_URL`, `FRONTEND_URL`), set `VITE_API_URL` on the frontend to its URL, and POST `/api/run-scheduler-tick` every minute from cron-job.org. Free Render sleeps after 15 minutes idle.

## Mobile without hosting (Tailscale)

1. Install Tailscale on the PC and the phone, same account.
2. PC: `tailscale up`, then `tailscale ip -4`.
3. Run `npm run dev` on the PC (Vite already binds `0.0.0.0`).
4. Set `VITE_API_URL=http://<tailscale-ip>:3001` in `.env.local` and add `http://<tailscale-ip>:5173` as `FRONTEND_URL` in `.env`.
5. Phone opens `http://<tailscale-ip>:5173`.

No hosting cost, no cold starts. The scheduler only ticks while the PC is on and something calls `/api/run-scheduler-tick` (a local cron, or `curl` in a loop).

## Known limitations

1. **Session fragility.** If investja.org starts rate-limiting logins, a 5 s poll will break. Fallbacks: raise `POLL_MS` in `App.tsx` to 15 s, or set `CACHE_TTL_MS=30000` on the backend.
2. **Cache depends on login.** If the site changes its caching, login-per-poll may return stale data. Signal: your equity is identical across consecutive polls while competitors' deltas move. Investigate then.
3. **1-hour hold is server-side.** The terminal never sends `X-Requested-With` or anything else to dodge market-hours or hold checks. A sell scheduled inside the hold window is retried every 5 minutes; ScheduledTrades shows `retrying (n)` with the server's last message.
4. **Market hours.** 9:35–16:00 ET, weekdays. The trade modal shows a "Market closed" banner outside that window. Holidays aren't modelled; the server is the authority.
5. **Snapshot scope.** 2,525 teams × 5 s would fill browser storage within a day, so only your team, the top 20 and teams you've opened are stored. A team you haven't opened has no history until you click it once.
6. **Render free tier sleeps.** First request after 15 min idle takes ~30 s. The 1-minute cron ping prevents it.
7. **Error parsing.** Failed trades return either HTTP 500 or HTTP 200 with an error block. The 200 case reads `.alert*`, `.error`, `.message`, `.flash` elements. If the site uses another class, you get a generic "Rejected by server" message; adjust `extractErrorMessage` in `server/parsers.js`.
8. **Selectors are from the spec, not the live site.** The scrape targets (`table.portfolio`, `.card-body table tr`, 5-cell ranking rows) were verified against a mock built from the spec. Check them against the real pages on first run.
