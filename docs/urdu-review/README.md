# Urdu review

The Urdu text in the app (`src/i18n/ur.ts`) is a draft. This folder holds what is needed to get it checked by a native
speaker and to put their corrections back.

| File | What it is |
| --- | --- |
| `EPC-Urdu-review.xlsx` | The sheet for the reviewer: a Read me, all 876 strings in 21 groups by screen, a glossary of 40 key words, and 15 style questions. Made 2026-11-15 (version 0.17.0). |
| `strings.json` | The same strings as data (made by `scripts/urdu-export.ts`). |

## 1. Send the sheet
Send `EPC-Urdu-review.xlsx` to the reviewer (it opens in Excel and Google Sheets). They fill the yellow column
"Corrected Urdu" only where something should change, add notes, answer the Questions sheet, and send it back.

## 2. Apply what comes back
```bash
python3 scripts/urdu-apply.py REVIEWED.xlsx --dry-run     # shows every change, refusals, notes and answers; writes nothing
python3 scripts/urdu-apply.py REVIEWED.xlsx               # writes src/i18n/ur.ts
npx tsc --noEmit                                         # every key must still exist
```
A correction is refused if its `{placeholders}` differ from the English text's. Their notes and answers are printed so
nothing is lost. Then rebuild and deploy. Style answers (for example "130,000 روپے") are decisions for the app: they
need code changes, not just text.

## 3. Make a fresh sheet after the app changes
```bash
npx vite-node scripts/urdu-export.ts docs/urdu-review/strings.json
python3 scripts/urdu-review-xlsx.py docs/urdu-review/strings.json docs/urdu-review/EPC-Urdu-review.xlsx
```
Both Python scripts need `openpyxl` (`pip install openpyxl`, or a virtual environment: `python3 -m venv .venv && .venv/bin/pip install openpyxl`).

The last groups (Reminders and alerts, Region and format) hold the newest texts. The Questions sheet asks about the money word
(Rs or روپے), lakh grouping, the time-of-day words, the week start, the appearance names and the delete-project warning: the app now has settings for
most of these, so the answers decide the default for Urdu readers.
