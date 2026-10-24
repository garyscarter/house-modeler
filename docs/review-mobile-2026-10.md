# Storey on phones and tablets: UI review and the chassis plan (October 2026)

Status: reviewed and decided; built on branch `mobile-tablet`. The app was read at `9b97809` and run in headless Chromium with touch at 390×844 (phone), 820×1180 (iPad portrait) and 1180×820 (iPad landscape), in every mode, on the 3D and Plan tabs. The house is "listing 91770873" throughout.

The brief: review the whole UI, make it work on phones and tablets, keep it simple, intuitive and sexy, and propose what to drop where it doesn't fit.

## 1. What was found

The Studio redesign (docs/studio-plan.md) was built **desktop only** on purpose: its decision 14 removed the drawer, the `pointer: coarse` rules, the phone breakpoints and the touch wording. Everything below follows from that one choice; the skeleton itself (top bar, five modes, dock, one inspector card) is sound.

| # | Finding | Where it bites |
|---|---|---|
| 1 | **Top bar** is a `1fr auto 1fr` grid that never wraps: at 820 px the layout switch runs under the mode bar ("…ed · Proposed"), at 390 px the brand, house name and mode bar overprint each other. The "works best at 1180 px" note then appears under it. | `styles.css` top bar |
| 2 | **Inspector card** is fixed at 320 px, top right. On a phone it covers 85 % of the width and all of the plan; the plan's "fit" insets by the card, so the floorplan is squeezed into a sliver on the left (Furnish shows it as a thumbnail in the corner). | `InspectorCard`, `planMath.INSPECTOR_INSET` |
| 3 | **Dock** is a 600 px pill centred at the bottom; on a phone both ends are clipped (Plan/3D gone, Views gone). | `Dock.css` |
| 4 | **Coach strip and view cube** collide bottom-right; the coach text overflows its card. | `Welcome.css`, `ViewCube.css` |
| 5 | **Review page** keeps three tiles and two columns at any width: at 390 px the Areas table wraps its headers one letter per line. | `ReviewPage.css`, `ReportPanel.css` |
| 6 | **Plan rail** has ten tools in a 46 px column with hover flyouts (no hover on touch) and single-key shortcuts (no keyboard). "Right-click a room for more" has no touch equivalent; Shift+click knock-through, Space to peek, ⌘K and arrow nudging are all keyboard. | `ToolRail`, `PlanStatus`, `useStudioKeys` |
| 7 | **Popovers** are fixed widths anchored to desktop positions: house menu 340 px, Add-furniture 320 px to the right of the rail, the site north badge offset by 332 px for the card. | `HouseMenu.css`, `PlanEditor.css`, `SiteEditor.css` |
| 8 | **Touch targets**: 28–32 px icon buttons, 18 px info buttons, 22 px anchor grid, 14 px checkboxes, 30 px inputs with 13 px type (iOS zooms the page on focus under 16 px). | everywhere |
| 9 | **Handles** on the plan use fine-pointer sizes since the coarse-pointer code was removed. | `editor/core/components.tsx` |
| 10 | **Side-by-side compare** at phone width gives two 190 px 3D views. | `App.tsx` |
| 11 | **Glass look** blurs five layers of 16 px backdrop filter; on phone GPUs that is a frame-rate cost for no gain at that size. | `styles.css` |
| 12 | **Modals** are centred cards with 24 px margins and `max-height: 86vh`; the Layouts dialog is a two-column grid. | `Modal.css` |

## 2. Decisions (owner, one round of questions)

1. **Phone scope: everything except drawing.** Orbit, tap rooms, decorate, measure, type sizes, move, rotate and add furniture, edit plot fields, review and export all work on a phone. Drawing new rooms, walls and canopies, gaps and calibrating stay on tablet and desktop.
2. **Phone layout: tab bar and bottom sheet.** The five modes are a bottom tab bar with icons; the inspector is a draggable bottom sheet with three detents (peek, half, full); Plan/3D and floors sit in a compact dock pill over the canvas; a slim top bar keeps the house menu, undo, redo and the command palette.
3. **Tablet: landscape is desktop, portrait is phone.** iPad landscape keeps the Studio skeleton with a compact top bar, 44 px targets, tap-to-label tools and a 300 px inspector. iPad portrait uses the phone chassis, because a 320 px card over an 820 px canvas leaves no room to work.
4. **Removed off the desktop:** side-by-side compare (Wipe becomes the headline compare on touch; Overlay stays) and the saved camera views menu and the Glass look. **Kept:** the keyboard affordances (palette button, `?` shortcuts, keycap hints) and every export; on phones `?` moves into the house menu.

## 3. The chassis

One pure module, `src/lib/chassis.ts`, decides the chassis from width, height and pointer, and `FEATURES` says what each offers. `useChassis` keeps it current; App sets `data-chassis` and `data-touch` on `.app`, and every change is scoped under those attributes so the desktop is untouched.

| Chassis | When | Shell |
|---|---|---|
| **phone** | width ≤ 899 px, or height < 480 px (phones both ways, iPad portrait) | top bar 48 px · canvas · sheet (64 px at peek) · tab bar 56 px + safe area |
| **tablet** | width 900–1179 px, or any touch screen from 900 px | Studio skeleton, compact top bar, 300 px card, 44 px targets |
| **desktop** | 1180 px and up with a mouse | Studio skeleton as designed |

Canvas chrome on the phone, so nothing collides: top-left the tool rail (fewer tools); top-centre the "Listed | Proposed" pill; top-right the view cube (3D) or the fit buttons (plan); bottom, above the sheet, the full-width dock; above that the status pill or sun panel. The dock and status fade while the sheet is half or full.

What changes on touch: 44 px targets and 16 px inputs; a tap selects and raises the sheet, a tap on empty canvas lowers it; touch-and-hold opens the actions menu as an action sheet; the rail shows a tool's name for a moment after a tap; hints say "Tap" and "pinch", not "Click" and "mouse wheel"; the plan fits to the canvas above the sheet rather than beside a card.

## 4. Not done, on purpose

- Landscape phones (844×390) get the phone chassis with a very short canvas. Usable, not designed for.
- No haptics, no pull-to-refresh, no PWA changes; "Add to Home Screen" works as before.
- Drawing tools on the phone: if they turn out to be wanted, the rail already filters by `FEATURES[chassis].draw`, so it is one line to allow them.
