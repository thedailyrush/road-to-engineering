# CI Tracker

A static, single-page web app for tracking clinical incentive shifts &mdash;
overtime hours and flat-pay calls &mdash; backed by Supabase for auth and
storage. Deployed on GitHub Pages.

## Architecture

- **Frontend:** plain HTML/CSS/JS, no build step.
- **Backend:** Supabase (Postgres + Auth). Each user's data is scoped via Row
  Level Security on `categories` and `entries` tables.
- **Hosting:** GitHub Pages serves the `gh-pages` branch root. The source of
  truth lives under `overtime-tracker/` on the feature branch; files are
  copied to `gh-pages` to deploy.

## Local development

```
open overtime-tracker/index.html        # macOS
xdg-open overtime-tracker/index.html    # Linux
```

The page talks to a hosted Supabase project, so you can develop against the
real backend with no local services.

## Features

- **Sign in / sign up** with email + password.
- **Log a Shift** &mdash; auto-calculated payout, with the live preview reflecting
  the late-rate split (after 7 PM in 2026+).
- **Hourly or flat** pay per category &mdash; toggle on each row.
- **Edit, delete, or cycle status** on any logged shift.
- **Bulk status updates** via row checkboxes.
- **Metrics** &mdash; monthly hours/income bars and category breakdown by year.
- **Export / Import** JSON for backups.
- **Reset** wipes all data and reseeds default categories.

## Default categories

Hourly &mdash; $350/hr:
Overtime, Overtime (Late), Pre-time, Bellevue Extra Att.,
Weekend Back Up 1, Weekend Back Up 2.

Flat:
Weekend Flat Pay ($400), Tisch M&ndash;Th Overnight ($300),
Tisch Friday Overnight ($1,300), Bellevue M&ndash;Th Overnight ($2,400),
Bellevue Friday Overnight ($3,600), Saturday Call ($5,200),
Sunday Call ($3,600), Bellevue Long Call ($1,050),
Holiday ($3,700), Holiday Saturday ($5,200).

## Pay rules

- Hourly rate is multiplied by recorded hours.
- For shifts dated 2026 or later, hours worked past 7 PM are paid at $375/hr
  (a split-rate proration based on the shift's actual time window).
- Flat categories pay a fixed amount per shift regardless of hours.
