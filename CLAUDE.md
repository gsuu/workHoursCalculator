# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                    # install dependencies
npm run dev                    # Vite dev server at http://localhost:5173
npm run build                  # build to dist/
npm run preview                # preview built bundle
npm test                       # run all node:test files (src/*.test.js)
node --test src/overtimeCalculator.test.js   # run a single test file
```

The README documents `npm.cmd` because the maintainer works on Windows; on macOS/Linux use plain `npm`.

### Generating preloaded monthly data

`src/preloadedMonthlyWorkers.js` is a generated file (~66k lines) — never hand-edit. Regenerate from two Hiworks Excel exports:

```bash
npm run generate:preloaded -- \
  --attendance "/path/to/근태현황_YYYY년N월.xlsx" \
  --detail "/path/to/근무결과(상세)_YYYY년N월.xlsx"
```

The Windows scheduled-task pipeline (`scripts/update-preloaded-monthly.ps1`, `register-monthly-task.ps1`) downloads those files from Hiworks, runs the same generator, and force-pushes the result. Don't run those scripts unless asked — they assume Windows + Hiworks session cookies.

### Cloud automation (GitHub Actions)

`.github/workflows/monthly-update.yml` runs the same pipeline on a schedule (매월 1일 09:00 KST) without needing a Windows PC. It uses `scripts/fetch-hiworks-work-month.mjs` to log into Hiworks programmatically (`POST auth-api.office.hiworks.com/office-web/login` with `{ id, password, ip_security_level: "1" }`), download the two Excel files via `hr-work-api.../v4/excel/export/work-month`, then generate / commit / build / deploy. Required GitHub Secrets:

- `HIWORKS_ID`, `HIWORKS_PW` — service account credentials (use a dedicated read-only account; 2FA must be off for that account, otherwise programmatic login fails)
- `HIWORKS_NODE_ID` — defaults to `12344` if unset
- `HIWORKS_DOMAIN` — tenant domain, defaults to `cttd.co.kr`. The script first GETs `login.office.hiworks.com/<domain>` to warm tenant cookies, then sends `Origin`/`Referer` headers pointing at that page during login.
Failure notifications use GitHub's built-in run failure email — no SMTP setup needed. Configure recipient at GitHub Settings → Notifications → Actions ("Send notifications for failed workflows only" + verified email of `jisuk@cttd.co.kr`).

The login endpoint is unofficial (not part of the public Hiworks Open API), so it can break if Hiworks redesigns their auth. Failures notify Slack and the run can be re-triggered via `workflow_dispatch` with optional year/month override.

## Architecture

Single-page Vue 3 + Vite app, no router, no state library. `vite.config.js` sets `base: "/workHoursCalculator/"` for GitHub Pages deployment.

Three layers, each in its own file:

- **`src/overtimeCalculator.js`** — pure calculation core. No Vue, no DOM. Exports `calculateEntry(entry, priorWeekMinutes)` and the helpers it builds on. Encodes Korean labor-law overtime rules:
  - day kind derived from `HOLIDAY_SET` (2025–2027 hardcoded) + weekday: Sunday/holiday → `holiday`, Saturday → `offday`, else `ordinary`
  - `buildIntervals` splits a shift at 22:00/06:00 (night) and 11:30/12:30 (lunch) boundaries, tagging each piece `day` or `night`
  - `classifyHoliday` applies 1.5× / 2× / 2.5× multipliers; `classifyNormal` applies the daily-8h / weekly-40h overtime threshold for ordinary days, and a flat 1.5×/2× scheme for `offday`
  - when `scheduledRange` (entry's scheduled start/end) is provided on an ordinary day, regular vs. overtime is determined by whether the worked interval falls inside or outside that scheduled window — *not* by the daily/weekly cap
  - `getApprovedCappedEndMinutes` caps the actual end time at `scheduledEnd + approved overtime/night/holiday minutes` so unapproved tail time is excluded

- **`src/monthlyAttendanceImport.js`** — parses two Hiworks Excel files (`근태현황` summary + `근무결과(상세)` per-day detail) via SheetJS, reconciles them by employee ID, infers scheduled shift from rule text, and produces the worker records that feed the UI. The `*.test.js` siblings cover this; treat them as the spec for the import logic.

- **`src/App.vue`** (~2.4k lines) — the entire UI. Holds state with `ref`/`computed`, persists imported monthly results to IndexedDB (`work-hours-calculator` DB, `monthly-results` store), reads `PRELOADED_MONTHLY_WORKERS` as the default dataset on first load, and renders the calculator + filter/sort/copy controls.

### Calculation rules (from README)

- Ordinary day: >8h/day or >40h/week → overtime; 22:00–06:00 → night premium
- Holiday: ≤8h at 1.5×, >8h at 2.0×, night adds 0.5× (max 2.5×)
- Offday (Saturday): treated as ordinary-overtime base, not holiday

When changing calculation logic, update `overtimeCalculator.test.js` first — the tests encode the expected legal interpretation.
