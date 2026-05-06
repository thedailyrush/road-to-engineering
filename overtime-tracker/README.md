# Overtime &amp; Clinical Incentive Tracker

A static, single-page web app that replaces a Google Sheet with a clean UI for
tracking overtime and flat-pay clinical-incentive shifts.

## Open it

Just open `index.html` in a browser. No build step, no server.

```
open overtime-tracker/index.html        # macOS
xdg-open overtime-tracker/index.html    # Linux
```

Data is stored in `localStorage` under the key `overtime-tracker-v1`. Use the
**Export** button to back up to JSON and **Import** to restore.

## Features

- **Hourly or flat** pay per category &mdash; toggle on each row.
- **Add / remove categories** at any time.
- **Inline edit** the rate, default hours, or name of any category.
- **Auto-calculated** earnings per shift (live preview before you save).
- **Status tracking** &mdash; pending / submitted / deposited; click `&#x21bb;` on a row to cycle.
- **Filters &amp; search** over the shift log.
- **Summary cards** for total earned, pending, deposited, hours, and shift count.

## Default categories (seeded)

Hourly &mdash; $350/hr:
Overtime, Overtime (Late), Pre-time, Bellevue Extra Att.,
Weekend Back Up 1, Weekend Back Up 2.

Flat:
Weekend Flat Pay ($400), Tisch M&ndash;Th Overnight ($300),
Tisch Friday Overnight ($1,300), Bellevue M&ndash;Th Overnight ($2,400),
Bellevue Friday Overnight ($3,600), Saturday Call ($5,200),
Sunday Call ($3,600), Bellevue Long Call ($1,050),
Holiday ($3,700), Holiday Saturday ($5,200).

Click **Reset** to wipe everything and reseed these defaults.
