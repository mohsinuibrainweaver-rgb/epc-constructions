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
