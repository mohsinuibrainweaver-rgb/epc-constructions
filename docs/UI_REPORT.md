# Work report: EndPoint Construction UI

Everything below is committed and live at https://epc-construction.vercel.app. The latest commit is `c985aea`.

## Sidebar and navigation (desktop)

- The sidebar uses a dark four-corner gradient (`#34373C`, `#4C5159`, `#282D34`, `#0C0E12`), flipped vertically at the request, with the inner padding raised to 16 px.
- Hovering a menu item shows a frosted liquid-glass pane that fades in.
- The selected item uses a vivid violet gradient (`#4939D2`, `#9C65FA`, `#7952ED`, `#3920A0`). It has no inner shadow and no hover effect.
- The logo is the supplied `logo-epcc.svg`, in the white logo slot used on dark surfaces.

## Buttons and colour

- All primary buttons and the sidebar avatar use the same violet gradient with white text in both themes. Measured white-text contrast is at least 6.3:1.
- The sign-in background is a pale lavender gradient (`#E5DDFF`, `#EEE7FF`, `#E8EBFF`, `#F9F6FF`). A lavender sign-in card was tried, then reverted.

## Cards and tiles

- All data cards (Home, Contracts, Vendors, Compare, Budget outlook) use one soft grey gradient (`#E8EAED`, `#F3F4F6`, `#E1E5EA`, `#FAFAFC`).
- The Contracts summary cards got icon tiles in the same glass style as Home.
- Empty screens show a rounded-square glass icon tile instead of a grey circle.
- Field borders are gray 200, and tabs have a sliding highlight across the app.

## Mobile

- **Shell:** the bottom bar is full width and flush to the screen edges. The Add payment button is a circle with a slowly turning gradient and a soft pulsing ring (off for reduced motion). The phone layout runs edge to edge with no outer margin, border, rounded corners or shadow.
- **Payment rows:** a phase icon, the phase name, the purpose and the vendor, with the amount and status pill on the right. A quiet line below shows the date, mode and who paid.
- **Dialogs:** on phones every dialog is now a bottom sheet with a grab handle and a 44 px close button.
- **Polish:** screens ease in, the tab bar hides while a field has the keyboard, and tappable rows show a pressed state.
- **Page spacing:** the phone page gap is 16 px.
- **Home:** the heading that duplicated the app bar is now for screen readers only, approval and due rows put the status pill beside the title, and amounts no longer wrap.
- **Phases:** the budget outlook has a compact legend in place of the four tiles. Phase rows have chips on their own line and the tick action moved into the three-dot menu. Phases is about 19% shorter (3,177 px to 2,567 px) and Home about 6% (3,306 px to 3,110 px).

## Checks

- **Type check and build:** both pass.
- **Contrast:** the contrast tests pass, including the mesh test updated for the shared grey palette.
- **Overflow:** no sideways scrolling on 16 screens at 375 px.
- **Accessibility:** axe found no violations on the screens scanned.
- **Desktop:** the centred dialog and the Phases layout look the same as before.
- **Limits:** tested in the preview pane only, not on real iOS or Android devices or an installed PWA.

## Not done

- **Other long screens:** Compare, Reports, Forecast and the others were not restructured for phones.
- **Select menus:** dropdowns and filters are not bottom sheets.
- **Brief mismatches:** the mobile brief named Next.js, Plus Jakarta Sans and Phosphor Icons. The app uses Vite, Inter and lucide, so those were left alone.
- **Urdu font:** Urdu text uses Noto Naskh Arabic, not Nastaliq.
