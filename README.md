# InvestJA Terminal

A read-only dashboard for an [investja.org](https://investja.org) team, hosted as a static site on GitHub Pages. No server.

```
GitHub Action (every 5 min)
  1. scraper.js: log in to investja.org, scrape rankings + dashboard -> public/data.json
  2. vite build (data.json is baked into the site)
  3. deploy to GitHub Pages
browser: fetches data.json every 60 s and renders it
```

The scrape and the deploy are one workflow (`.github/workflows/scrape.yml`). A commit-only workflow would not work: the site serves the `data.json` it was built with, and commits made by the Action don't trigger another deploy. Nothing is committed on each run, so the repo history stays clean.

## Setup (one time)

1. **Secrets** — repo → Settings → Secrets and variables → Actions → *Secrets*:
   - `INVESTJA_USER`: your investja team login
   - `INVESTJA_PASS`: your investja password
2. **Variables** — same page, *Variables* tab:
   - `VITE_PIN`: the PIN for the lock screen (any length)
   - `VITE_TARGET_TEAM`: `Rahman Power Squared` (the team to highlight)
3. **Pages** — repo → Settings → Pages → Source: **GitHub Actions**.
4. **First run** — Actions tab → *Scrape and deploy* → *Run workflow*. When both jobs are green the site is at `https://<user>.github.io/<repo>/`.

Every push to `main` also redeploys, so edits go live without waiting for the schedule. `vite.config.ts` reads the Pages base path from `VITE_BASE`, which the workflow sets to `/<repo-name>/`. No `gh-pages` branch is involved.

## Local development

```bash
npm install
npm run mock                      # fake investja.org on :4000 (leave running)
BASE_URL=http://localhost:4000 INVESTJA_USER=1 INVESTJA_PASS=mock PREV_DATA=public/data.json npm run scrape
# run the scrape a few times so the charts have points
echo "VITE_PIN=1234" > .env.local
npm run dev                       # http://localhost:5173
```

Against the real site: `INVESTJA_USER=... INVESTJA_PASS=... npm run scrape`.

## What's in data.json

`teams` (rank, name, school, equity, previous-run equity), your `portfolio`, a start-of-day `anchor` (the first scrape of each Eastern-time day, used for "Earned today" and the daily report) and 24 hours of `history` for your team and the top 20. The scraper reads the previous deployed `data.json` to carry the anchor and history forward, so charts exist even when nobody has the page open. Other teams you click in the leaderboard are recorded in your browser from then on.

The scraper exits non-zero if login fails or the pages parse empty, so a bad run never overwrites good data (the site keeps the last deploy).

## Limitations

- **Not real time.** GitHub's scheduler is best-effort and often runs minutes late. The top banner shows the last sync and turns amber after 15 minutes.
- **Scheduled workflows pause** after 60 days without repo activity. Push any change, or re-enable it from the Actions tab.
- **The PIN is cosmetic.** `VITE_PIN` is in the JS bundle and `data.json` is a public file, so anyone who finds the URL can read it. It contains your cash, loan and holdings plus every team's name, school and equity. Share the link only with people you're fine showing that to.
- **Selectors come from the spec, not the live site.** They were tested against a mock. If the first run fails with "parse incomplete" or "0 teams", check the Action log and adjust `scraper/parsers.js`.
- **No trading.** Orders are not possible from this app.
- **Daily report** is computed in your browser from the anchor, so it only generates for days you open the page after 4:05 PM ET. Buys and sells are inferred from changes in position size.
