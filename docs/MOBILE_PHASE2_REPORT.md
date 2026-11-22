# Mobile phase 2: completion report

Status: implemented and tested in the preview pane. **Not committed or deployed.** Desktop and tablet were checked on the Ledger screen only.

## 1. Screens reviewed

All 16 routes that show content were measured at 320, 375, 390 and 430 px: Home, Phases, Vendors, Contracts, Ledger, Weekly payments, Cash forecast, Settlement, Reports, Compare, Statements, Files, More, Projects, Settings, Add payment. I also looked at the screens themselves for Home, Phases, Ledger (with its filter sheet), Statements, Compare, and Add payment. Reports, Forecast, Contracts, Vendors, Settlement and Settings were checked by measurement and code review rather than screenshot.

## 2. Redesigned this phase

| Screen or component | Change on phones |
| --- | --- |
| Compare | Key numbers in two columns. One sticky colour key (which project is which) under the app bar instead of four repeats. Smaller headline figure, tighter cards, intro and the two project pickers side by side. The pace chart is shorter. |
| Reports | Breakdown lists show their top 5 rows with "Show N more". Thinner bars, tighter spacing, a shorter trend chart, and denser material-price cards. |
| Forecast | Tighter headline card, a shorter chart (180 px), smaller secondary figures. |
| Ledger | Filters moved into a bottom sheet with a live "Show N payments" button and "Clear filters". Active filters show as removable chips under the search box. Payment rows are tighter. |
| Contracts | Cards become one divided list on phones, with smaller titles and a lighter next-payment line. |
| Statements | Print, Export and Share fit on one row (Export and Share are icon buttons with names for screen readers). From and To dates sit side by side. Checkbox rows are 44 px tall, and the statement card has less padding. |
| Payment rows | `py-4` to `py-3` and tighter gaps. |

Vendors and Settlement needed no layout change. Vendors is already one divided list.

## 3. Space-utilization changes

- Phone section gaps are 12 to 16 px, from 24 px.
- Repeated legends, and the duplicate heading on Home, were removed on phones. Long lists show a preview with a button for the rest.
- Charts are shorter on phones (Compare pace 184 px from 240, Reports trend 164 px from 200, Forecast 180 px from 230).
- Related fields share a row: dates, project pickers, KPI tiles.

## 4. Interaction improvements

- Filters are a bottom sheet, with chips you can tap to remove.
- Dialogs are bottom sheets with a sticky footer.
- The Compare colour key stays visible while scrolling.
- Screens ease in and rows have a pressed state. Both respect reduced motion.
- The tab bar hides when a field has focus.

Dropdowns were not converted to sheets. They are native-style controls, and the longest list (vendors) is short enough as it is.

## 5. Before and after (page height in px at 375 wide)

"Before" is the measurement at the start of this phase. Home and Phases are phase 1 figures.

| Screen | Before | After |
| --- | --- | --- |
| Compare | 3,665 | 3,120 |
| Cash forecast | 2,634 | 2,516 |
| Ledger | 2,804 | 2,564 |
| Statements | 2,653 | 2,463 |
| Reports | 2,868 | 2,766 |
| Home | 3,110 | 3,034 |
| Phases | 2,567 | 2,567 |

Other widths after the changes: Compare 3,054 at 390 and 430; Ledger 2,482 at 390 and 2,416 at 430.

Reports looks only slightly shorter, but its old figure hid a layout bug. At 320 px the cards were wider than the screen and clipped. Fixing that took more space, which is why this figure drops less than the others.

## 6. Accessibility and responsive testing

- **Widths:** 320, 375, 390 and 430 px, all 16 routes.
- **Clipping:** nothing clipped or overflowing beyond the viewport, apart from the one Reports bug above (fixed on both Reports and Material prices).
- **Targets:** no interactive element under 24 px.
- **axe-core WCAG 2.2 AA:** zero violations on all 16 routes at every width.
- **Automated checks:** the TypeScript check, production build (service worker still generated), and the contrast, mesh contrast, sort, password, avatar and media scripts all pass.
- **Desktop:** the Ledger screen looks unchanged, with all filters inline.

## 7. Limits and unfinished work

- **No real devices.** Everything was tested in an emulated pane. Installed iOS and Android PWAs, safe areas, the on-screen keyboard and the standalone display mode were not verified on hardware.
- **Not fully redesigned:** Compare is still about 3,100 px tall, and Home and Reports remain long. Getting them much shorter would mean hiding or reordering content, which needs your decision.
- **Filter sheet labels:** once a filter is set, its control shows only the value ("Planned"), not "Status: Planned". The chips under the search box carry the full label.
- **Reports and Forecast** were checked by measurement and code review, not screenshots.
- **Back navigation and tab state:** I did not change them, and I did not test them.
- **Desktop and tablet:** only the Ledger screen was visually checked.
- **Weekly payments, Files and Settings:** no layout changes. They had little or no content in the test data.
