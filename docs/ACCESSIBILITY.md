# Accessibility audit

Last full audit: 2026-11-16, version 0.20.0. Standard: WCAG 2.2 level AA. The app is checked in light and dark, English and
Urdu (right to left), at desktop width, 800 px (icon sidebar), 375 px and 320 px.

## What is checked, and how

| Area | Check | Result |
| --- | --- | --- |
| Colour tokens | `npx vite-node scripts/contrast-test.ts` reads `src/index.css` and checks 42 text and interface pairs in both themes (body, help text, links, buttons, badges, field borders, focus rings, sidebar). It also checks that every grey is neutral (red = green = blue). | Pass. Tightest pair: dark danger button 4.83 : 1 |
| Colour on screen | Every visible text node on every page: its colour against the colour actually behind it, light and dark | No failures |
| Automated rules | axe-core, WCAG 2.0, 2.1, 2.2 A and AA, plus best practice, on 22 routes x 2 themes (desktop), 18 x 2 (375 px), 10 x 2 (Urdu) | No violations |
| Dialogs and popovers | 6 dialogs, the alerts popover and a toast: axe, accessible name, focus inside, Escape closes, focus returns to the button that opened it | Pass after the fixes below |
| Structure | One h1 per page, no skipped levels, one main landmark, language and direction set, skip link, page title | Pass after the fixes below |
| Touch targets | Every control on every page at 375 px: 44 px minimum (24 px is the WCAG minimum) | Pass after the fixes below |
| Reflow | 20 routes at 320 px: no horizontal scroll | Pass |
| Text spacing | WCAG 1.4.12 (line height 1.5, letter spacing 0.12 em, word spacing 0.16 em): no clipped text | Pass |
| Keyboard | Tab and Shift+Tab with real key presses: visible focus ring in the sidebar (light indigo, 8.6 : 1 on the dark sidebar) and in the page (indigo, 3 px); no component removes its outline except the main area, which is a focus target, not a control | Pass |
| Reduced motion | One global rule shortens every animation and transition | Present |

## Fixed in this audit

| Finding | Why it matters | Fix |
| --- | --- | --- |
| After a dialog closed, keyboard focus went to the top of the page | A keyboard or screen-reader user lost their place (2.4.3) | `Dialog` remembers the element that opened it and gives focus back |
| Every page had the same tab title, "EPC Construction" | Pages could not be told apart in the browser history, the task switcher or by a screen reader (2.4.2) | The title follows the page heading, in both languages ("Ledger · EndPoint Construction") |
| Success and warning text had only 4.5 to 4.6 : 1 on their tinted badges | Passed by a hair; a small change would fail it | Darker success (#166534) and warning (#92400e) text, now 6 : 1 or more |
| Two search landmarks with no names on the Ledger | A screen reader could not tell them apart | Each has its own label |
| Small targets at 375 px: small buttons 36 px, text links 20 px tall, checkboxes 16 px, the project name in the header 24 px | Hard to hit with a thumb (2.5.8 asks for 24 px, platforms advise 44) | Small buttons grow to 44 px on phones, links and the header name are 44 px tall, checkboxes are 24 px inside a 44 px row |
| The "not found" page had no heading | No h1 for a screen reader to land on | Its title is the h1 |
| Alert component used a red that was too dark on the dark theme | 4.1 : 1 | Uses the checked `danger` text colour |

## Notes added later

- **Sidebar items are 36 px tall** (14 px text) on screens 600 px wide and up, where the sidebar shows; phones have no sidebar and keep 44 px targets.
  36 px is above the WCAG 2.5.8 minimum of 24 px. The sidebar fits without scrolling from about 676 px of window height and scrolls below that.
- **The selected sidebar item** is the brand indigo (#4338CA) with white text and icon (7.9 : 1). Its fill against the dark sidebar is 2.3 : 1, below
  the 3 : 1 that a state indicator is meant to have; the state is also carried by `aria-current="page"`, which screen readers announce. Add back an
  outline (`ring-1 ring-white/25 ring-inset`, 4.0 : 1) if a visual-only user needs more.

- **The sync chip lives in the sidebar** (under the app name) from 600 px up, and in the top bar on phones. On the dark sidebar it sits on the raised
  fill (`--sidebar-accent`) with a light status colour per state (`--sidebar-info`, `-warning`, `-danger`; all 4.5 : 1 or better, checked by
  `contrast-test.ts`), always with an icon and a word. In the icon sidebar (600 to 1199 px) it shrinks to a 32 px icon; the word stays for screen
  readers (`role="status"`) and as a hover title. The "Sync problem" state is a link to Settings, 28 px tall.

## Drop-downs (added 2026-11-16)

Every drop-down in the app is the designed `Dropdown` (`src/components/ui/dropdown.tsx`, Radix Select) instead of the browser's own select. Checked:

- **Keyboard:** Enter, Space or Arrow Down opens it; Arrow keys, Home and End move; typing jumps to an item; Enter chooses; Escape closes and focus returns to the field. Inside a dialog Escape closes only the list first.
- **Screen readers:** it is a combobox with a listbox of options; the label, hint and error reach it through `id`, `aria-label`, `aria-describedby` and `aria-invalid`, as before.
- **Touch:** rows are 44 px tall on phones; the panel is as wide as the field and never leaves the screen (8 px from the edges).
- **Colour:** the chosen row has a check mark and bold text (not colour alone); the row under the keyboard or pointer has a fill and a 2 px outline (3 : 1 or better in both themes); the sidebar's list is a lifted dark panel.
- **Right to left:** the list lines up with its field in Urdu; the check mark and padding follow the reading direction.
- **While a list is open** axe reports only what any modal list causes: the page behind is hidden from assistive technology on purpose, so rules about "no h1" and "focusable elements in hidden content" fire; they are not defects.
- **Found and fixed on the way:** Radix keeps a hidden input beside each choice and moves it one width to the left; on a right-to-left page that area scrolls, so Add payment could be dragged sideways at 375 px in Urdu (and a list opened there appeared misplaced). One CSS rule keeps those inputs in place. The 8 px page gap also moved from the body to the root element, because an open dialog or list locks the body and reset its padding, nudging the page by 8 px.

## Create account: password and confirmation (added 2026-11-22)

Rules (`src/lib/password.ts`, checked by `scripts/password-test.ts`): 8 or more characters, a capital and a small letter, and a number
are required to create an account. A symbol and 12 or more characters are optional and raise the level. Common passwords
(Password1, Qwerty123!, the project's own name) are shown as Weak even when they meet the rules. Signing in is not checked, so an
older, shorter password still works.

What was tested (axe-core WCAG 2.0 to 2.2 A and AA, plus manual checks on the fake-sync server):

* Zero violations for weak, fair, good, strong and mismatch states, in light and dark, and in Urdu (RTL) at 375 px; no sideways scroll.
* The label focuses its input (the old field put the id on a wrapper div). The password field is described by the rules panel; the
  confirm field by its match status. A wrong submit moves focus to the first invalid field.
* The strength level is written as a word and sits in a polite live region that changes only when the level changes; each rule has a
  tick or an empty circle plus the words "done" or "not yet" for screen readers; colour is never the only signal.
* "Passwords do not match" appears only once the confirmation is as long as the password, or the field is left, so a half-typed
  confirmation is not called an error. The match status and the field error are never both announced.
* Show / hide buttons are separate for each field and say whether the password is visible (`aria-pressed`).
* The language drop-down is 44 px tall on phones (it was 36).

Not covered: a real screen-reader pass (VoiceOver, TalkBack) and password-manager behaviour on real phones.

## Compact tabs (added 2026-11-22)

`ViewTabs` (settings rows, filters, view switches) use the `xs` size of Tabs: 28 px tall buttons in a 32 px group, 13 px text, from 640 px up.
That is above the 24 px minimum of WCAG 2.2 (2.5.8). On phones they stay 44 px tall, as every other target does. The main Sign in /
Create account tabs keep the default size. Axe was clean in light, dark and at 375 px.

## Sortable table columns (added 2026-11-22)

The payments table (Ledger, Home, Vendors, Contracts, Phase detail) and the Statements table sort by any column in the browser. Each
heading holds a real `<button>` that fills the cell (40 px tall) and the cell carries `aria-sort` (ascending, descending or none), so a
screen reader says "Amount, sorted ascending". Click once to sort up, again to sort down, a third time to return to the order the
page came in. The arrow shows the state to the eye and the words stay. Keyboard: Tab to a heading, Enter or Space to sort, and focus
stays on it with the usual focus ring. Rows with nothing in a column (no phase) always come last. On the phone the table becomes a
list of cards, which has no headings, so it follows the same order as the table without controls. Statements print what is on screen;
the CSV and the shared text keep date order. Axe was clean in light and dark on Ledger, Home, Phase detail, Vendors and Statements.

Not sortable on purpose: the Forecast and Compare "details" grids, which are two or three row comparisons whose row order carries meaning.

## Statistics cards: mesh gradients (added 2026-11-22)

Figure and KPI cards (Home, vendor detail, Contracts summary, Compare tiles, Budget outlook tiles) use six four-colour mesh gradients
(`.mesh-amethyst`, `-arctic`, `-champagne`, `-rose`, `-sage`, `-periwinkle` in `src/index.css`, picked by position with `src/lib/mesh.ts`).
They are never used on general cards, forms, tables or navigation.

* Text inside a mesh card uses ink `#172033` (at least 7.2:1) and labels `#2a354b` (at least 5.4:1), measured on the darkest stop of every
  palette. A blend of stops is never darker than its darkest stop, so that covers the whole card. Links and status text inside a card
  use deeper shades (primary `#2e2a86`, success `#0d4a22`, warning `#5f2108`, danger `#7a1313`, info `#172554`), all 4.6:1 or better.
* Axe cannot judge text over a gradient (it lists those nodes as "needs review"), so `scripts/mesh-contrast-test.ts` reads the palettes and
  text colours from the stylesheet and checks every palette x colour x theme; it fails if a colour is changed to something below 4.5:1.
* In light mode the palettes are mixed toward white (`--mesh-strength: 55%` in `.mesh-card`; raise it for stronger colour, lower it for paler cards), which only makes the text contrast higher; the test reads that value. Dark mode uses the same palettes mixed 26% into near-black, with light text (also checked by the test).
* Icons sit in a liquid-glass tile (frosted translucent surface with blur, a bright rim and a soft shadow) with dark ink, so they read on all six. The tile is decoration; the label and figure carry the meaning. With the system setting "reduce transparency" the tile becomes solid with no blur.
* Status and trend colours stay meaningful: the white pills (Over by, On estimate) and the red "past the budget" alert tile keep their own
  styling and are not given a gradient.
* The cards have no visible border (the 1 px is kept, transparent, so sizes do not change). A card you press (the vendor Paid and Planned filters) still gets a dark outline, because that outline is how its on/off state is shown. Printing: a mesh card prints on white with black text.

## Not covered, and worth doing with real people

- A screen reader pass (VoiceOver on iPhone, TalkBack on Android) of the main flows: add a payment, approve an entry, read a statement.
- Urdu text read aloud: the draft translation is waiting for a native reviewer (`docs/urdu-review`).
- Text zoom to 200% and the phone's large-text setting on a real device.
- Windows high-contrast mode.
- Colour-blind simulation: status badges always carry an icon and a word, and charts carry labels, so colour is never the only signal, but it has not been viewed through a simulator.

## How to repeat it

```bash
npx vite-node scripts/contrast-test.ts       # tokens, both themes (also part of the normal test run)
npm run dev                                  # then, in the browser, run axe on each route in light, dark, Urdu and at 375 px
```
New screens: use the `SettingRow`, `EmptyState` and `Dialog` components, keep help text on `muted-foreground`, and keep interactive controls at 44 px on phones.
