# Storey: UX, UI and visual design review (Rihanna)

Scope: screenshots 01–30 (1440×900 unless noted), docs/brand.md, docs/studio-plan.md §1, docs/modes-brief.md, the shell, inspector, plan, 3D and review code. Read-only. The house is "listing 91770873" throughout.

---

## 1. Verdict in 5 lines

- **Simple: 6/10.** The Studio shell (top bar, five modes, dock, one inspector card) is the right skeleton, but every mode panel is still a developer form: native selects, colour wells, raw degrees, "px/m", percentages.
- **Intuitive: 5/10.** The modes read well, but the first 30 seconds are a generic `choose()` dialog over a half-visible empty state. Then a 3D view where the house fills about a third of the frame, white neighbour blocks dominate, and nothing invites a click.
- **Sexy: 5/10.** The Review page (07) and the brand tokens are genuinely good. The canvas isn't: flat lime ground, chalk-white neighbours, teal photo pins scattered over the roof, and stacked photo billboards in the front garden.
- **The three changes that would move it most:**
  1. A designed first run (a real welcome card that replaces the startup dialog, and a home view framed on the house, not the plots).
  2. One "inspector kit" of designed controls (swatch pickers, finish tiles, segmented angles, paired number fields, a proper danger zone), used in every mode and loaded with the shell, not with the plan.
  3. Clean up the 3D canvas: neighbours as quiet grey massing, photo pins only on demand, a softer ground, and the home view offset so the inspector card never covers the house.

---

## 2. First run and onboarding

### What happens now (01)
- The app opens on a grey veil with a small, generic 380 px dialog:
  - the question "Load the plans for listing 91770873 to see the house in 3D?"
  - three stacked full-width buttons: "Load As listed", "Load As listed and the proposed extension" and "Not now".
- Behind it, the empty state's teal **"Open layouts"** button pokes out under the dialog's bottom edge (y≈560). Two calls to action compete, and the one behind the veil looks broken.
- The top bar is fully drawn but dead. "As listed / Proposed" shows as ghost text, undo and redo are greyed, and the house menu says "House". So the first impression is of a disabled app.
- The copy is mechanical:
  - "Load As listed" uses a layout label as a verb object.
  - "the proposed extension" is the only place the extension is described, and nothing says what Proposed means.

### What a new user understands in 30 seconds
1. "This is a house app." They get that from the logo and the 3D view.
2. "There are five steps." They half-get it: Build / Decorate / Furnish / Plot / Review reads as a pipeline. That's good. But nothing says that Build means *correct the tracing*, not *design an extension*.
3. "I can compare before and after." They don't get it. The As listed / Proposed switch is a small grey pill on the far right. Compare is hidden in the dock as "Compare: Single", and Space-to-peek is only on the shortcut sheet.
4. "What do I click?" Nothing in the 3D view signals that rooms are clickable. The Build card's first button is "Lock all rooms", which is a protective action, not a starting point.

### Recommendation: a welcome card in place of the dialog and the empty state
Replace both the `choose()` prompt (`components/startupDialog.ts`) and the `.empty` block in `App.tsx` with one designed card, centred on a blurred blueprint of the plan (or the outline mark as brand.md asks):

```
┌───────────────────────────────────────────────────────────┐
│   [outline mark 72px, teal]                                │
│   Listing 91770873                     (Bricolage 28/600)  │
│   See the house in 3D, then plan what you'd change.        │
│                                                            │
│   ┌──────────────────────┐  ┌──────────────────────────┐   │
│   │ [thumb: house today] │  │ [thumb: with extension]  │   │
│   │ The house as listed  │  │ As listed + my plans      │   │
│   │ 2 floors · 118 m²    │  │ Adds a 2-storey side      │   │
│   │                      │  │ extension · 146 m²        │   │
│   └──────────────────────┘  └──────────────────────────┘   │
│                                       Start empty  →       │
└───────────────────────────────────────────────────────────┘
```
- There's one decision with two big picture tiles, and "Not now" becomes a quiet text link.
- After loading, show a 3-step coach strip above the dock, once (dismissed state in `panelPrefs`):
  - "1 Click a room to check its size"
  - "2 Decorate to try finishes"
  - "3 Press Space to flip between As listed and Proposed"
- Hide the layout switch, undo/redo and the palette until a model exists, rather than showing them disabled.

### Are the modes self-explanatory?
Mostly, yes: the five words are well chosen. Three fixes:
- Add a one-line subtitle under the card title per mode, in `InspectorCard` from `MODE_LABEL`:
  - Build: "Rooms, walls, doors and stairs"
  - Decorate: "Floors, walls and colours"
  - Furnish: "Place furniture"
  - Plot: "Garden, boundaries, neighbours and roof"
  - Review: "Areas, costs and planning"
- "Plot" hides the roof and exterior (the "Exterior" section is under Plot). A user looking for the roof will try Build first. Either move Exterior → Build (roof is structure) or rename the mode "Outside". My pick: **"Outside"**, which covers plot, exterior, neighbours and sun.
- Review is a page, not a mode. It's fine that it sits on the mode bar, but give it a visual difference: a right-aligned "Review" with a document icon, separated by a hairline from the four working modes.

---

## 3. Information architecture

### The map today
| Place | Holds |
|---|---|
| Top bar left | brand, **house menu** (Layouts…, Bring in updates…, Photos (n)…, Render quality, Look, Export/Import/Clear, version) |
| Top bar centre | modes |
| Top bar right | **As listed / Proposed**, undo, redo, palette (search + Ctrl K), ? |
| Dock (bottom) | Plan/3D, floors, Compare ▾, Sun, **View ▾**, **Views ▾** |
| Inspector card | mode panel |
| Plan only | tool rail (left), zoom cluster (bottom left) |

### Problems
1. **"View" next to "Views"** (02, 18). These are two different things with near-identical names, side by side.
   - "View ▾" is layers (Labels, Ceilings, Doors open, Exterior, Site).
   - "Views ▾" is saved cameras.
   - Rename them **"Show ▾"** (layers) and **"Cameras ▾"**, or fold saved views into the view cube as a bookmark icon. `Dock.tsx`, `SavedViewsMenu.tsx`.
2. **Three furniture entry points** (05, 11, 12):
   - "Add furniture" (primary)
   - "Add a piece I own" (appears twice: the Furnish card and the catalogue popover footer, `AddItem.tsx:110` and `MyFurniture.tsx:205`)
   - "Place furniture on the plan" (the 3D-only escape hatch in `ModePanel.tsx`)

   Make it one: **"Add furniture"**, with "Mine" as the first catalogue chip and "+ Add a piece I own" as the last row of that chip only. In 3D, the same "Add furniture" button should switch to Plan *and* open the picker, so the user never reads "Place furniture on the plan".
3. **Layouts dialog vs the As listed / Proposed switch** (21). The dialog is a management screen (remove, reset, bring in updates). The switch is the everyday control. That split is right, but:
   - The dialog's lists ("7 rooms, 12 doors and openings, 7 windows, 73 px/m") are debug output. Show a thumbnail and a total area instead.
   - "Bring in updates…" appears in three places: the house menu, the Layouts dialog and the README startup flow. Keep it in the Layouts dialog plus a badge on the house menu button when updates exist, and drop the always-on "Bring in updates… up to date" row from the menu (20).
   - "Remove" on As listed is a destructive action with the same grey button weight as "Reset to a copy of As listed".
4. **Compare is buried.** Comparing is the product's emotional payoff ("what will my house look like?"), yet it's a dropdown reading "Compare: Single" in the dock. Give it a proper home:
   - Make the layout switch in the top bar a three-way control, `As listed | Proposed | ⇆ Compare`. Choosing Compare shows the Wipe by default, with Side by side and Overlay as a small segmented control in the canvas's top-left.
   - This also answers "Is the Plan/3D switch in the right place?" (below).
5. **The house menu mixes project, settings and about.** That's acceptable for a power menu, but "Render quality" and "Look" are set once and forgotten, and "Clear all…" sits one click from "Export JSON". Move Settings and Project into a "Settings…" modal and keep the menu to Layouts, Photos, Export, Import and Settings…
6. **Stairs live under "Floor settings"** in Build (02), as a peer of "House". Stairs are a *thing in the plan*, so they should be selected by clicking the stair symbol, like a room. The summary row can stay, but the primary entry is the plan.

### Is the Plan/3D switch in the right place?
Not quite. Plan versus 3D is the *biggest* view change in the app, and it's a small segment at the far left of the dock, with the same weight as the floor buttons beside it.
- **Proposal:** move Plan/3D to the top bar's left, next to the house name, as a two-icon segment (plan icon / cube icon).
- The dock then becomes purely "what's in the view": floors, compare, sun, show, cameras.
- Tab stays.

```
[▲ storey] Listing 91770873 ▾  [▦ Plan | ◈ 3D]   Build Decorate Furnish Outside | Review   [As listed|Proposed|⇆]  ↶ ↷  ⌕  ?
```
This is a change to studio-plan §3.5 (dock item 1), which isn't one of the numbered §1 decisions. Flagging it for the owner anyway.

### Duplication in Plot (13)
- The card reads "Plot", then "Site plan (i)", then "Site ▾": three headings before the first control.
- In 3D (06) it's "Plot", then "Site", then a yellow note, then "Edit the site plan".
- Drop the `h3` inside `SitePanel` when it's inside a Section (the CSS already hides `.sect-body > .panel > h3:first-child`, but SitePanel's `h3.with-info` isn't the first child in plan mode).

---

## 4. The inspector panels, mode by mode

### Bug first: the inspector's styles load with the plan, not with the inspector
The rules that lay out the inspector (`.side .size-row`, `.side .colour-pick`, `.side .floor-angle`, the inline checkbox, `.anchor-grid`) live in `src/editor/PlanEditor.css`. That file is only imported by the **lazy** `PlanEditor`, so until the user has opened the plan once, the 3D inspector is unstyled:
- 03: the width and depth fields are stacked full width with a lone "×" on its own line, and the anchor arrows sit in a strip.
- 04: "Clear" falls under the colour well, and the angle buttons wrap.
- 09: after visiting the plan, the same fields sit side by side.

Fix: move every `.side .inspector*` and `.field*` rule into a `src/components/Inspector.css`, imported by `InspectorCard.tsx`. Effort S, and it immediately fixes "inconsistent layouts" (03 vs 09).

### Build (02, 03, 09)
- **"Lock all rooms" leads the card.** It's a safety toggle, not the first thing to do. Move it into "Floor settings" or into the plan's right-click menu ("Lock all rooms on this floor"). The floor summary should lead with *what to do*: "Click a room to check its size, or draw one with R".
- **The summary line** "7 rooms · 76.0 m² · 19 doors and windows · stairs up" is set in Bricolage semibold at 14 px. Bricolage at that size looks like a slightly wobbly Plex; reserve it for ≥18 px.
  - Make it a stat row: big numbers in Plex Mono, labels muted: `76.0 m²  ·  7 rooms  ·  19 openings`.
  - Drop "stairs up": it's on the Stairs row below.
- **Shape & size copy:**
  - "Traced size, width × depth (m)" → **"Size on this plan"**, with `W` and `D` prefixes inside the inputs and `m` as a suffix.
  - "Printed size on the plan (m)" → **"Size printed on the listing"**.
  - The orange paragraph reads "Traced 2.74 × 1.89 m against printed 3.05 × 1.86 m: -10.2% / +1.6%. More than 5% out: check the tracing or the floor's scale." It restates both pairs of numbers that are visible right above it. Replace it with a chip on the row: `⚠ 10% narrower than printed  [Fix scale…]`.
  - "Floor area 5.2 m² · 56 ft²" is a muted 12 px line. It's the most useful number, so make it the header stat under the room name.
- **Anchor arrows** (↖ ↗ ↙ ↘). They're unexplained until you open the (i). Use a 3×3 mini-diagram of the room with a draggable dot at a corner (titled "Corner that stays put"), or simply default to the top-left and put the anchor choice in the (i). Most people never need it.
- **"Delete room"** sits at the bottom as a grey button with red text. The pattern also appears for "Remove" in Layouts and "Clear all…" in the house menu.
  - Standardise on a **"danger zone"**: a ghost button (no fill, red text, red outline on hover) after a hairline, at the end of the card.
  - Always confirm with `ask(..., { danger: true })`, which Delete room already does.
  - Never put a grey-filled red-text button next to grey-filled neutral buttons.
- **Floor settings "Level 0 · 73.0 px/m"**. "px/m" is internal calibration. Show "Scale checked ✓", or "Scale: 1 m = 73 px" only inside the expanded section. "Level 0" should read "Ground floor".

### Decorate (04, 10)
This is the mode that should feel the most like a design app, and it feels the most like a form.
- **Floor finish** is a native `<select>` with a long list of beautiful things (herringbone, encaustic, terrazzo…) shown as plain words.
  - Replace it with a **finish grid**: 4 columns of 56 px tiles rendered from the same procedural textures (`three/textures.ts` can draw to a small canvas), with the name under each.
  - Group them: Wood, Tile, Stone and concrete, Soft.
- **Pattern direction (degrees)** is a number field plus "0° 45° 90° Along room". Drop the field and keep the segmented control. Add a small rotating-arrow icon, and put the exact degree in the (i) or an "Other…" option.
- **Colour wells** (`<input type=color>`) render as a 250 px-wide brown bar (04, 10). Replace each one with:
  - a swatch row (the "quick colours" that already exist)
  - plus a 28 px round "custom" well with a "+" in it
  - plus a "Reset" icon button (↺) instead of the underlined "Clear" text link.

  Today the quick colours are a *separate* block below all the wells ("Paper colour: quick colours", "Flower colour: quick colours"), so the user has to work out which well each palette feeds.
- **Wall covering "Floral wallpaper"** with "Paper colour / Skirting colour / Flower colour" also wants a tile grid like floors, with the colour slots shown as small swatches *on the tile*.
- **The Decorate card is the only place Bricolage headings help.** Use a room-name header ("Kitchen", 18 px display) with the area under it. In 10 that's done well: carry it into Build.

Sketch:
```
Kitchen                                  14.8 m²
─────────────────────────────────────────────────
FLOOR                                     Vinyl ▸
[▒][▓][░][▤]  [▥][▦][▧][▨]   ← finish tiles
Direction   [0°][45°][90°][Along room]
Colour      ● ● ● ● ● ● ● ● ⊕  ↺
─────────────────────────────────────────────────
WALLS                           Floral wallpaper ▸
[tile grid]
Paper ● ● ● ● ⊕   Flowers ● ● ● ⊕   Skirting ● ● ⊕
─────────────────────────────────────────────────
Each wall · 4 walls, 1 feature                  ▸
```

### Furnish (05, 11, 12)
- The empty state copy is good ("Add the furniture you already own, with its real sizes, to see where it fits"), but it sits under "My furniture" as a subheading when there is no furniture. Show it only when "My furniture" is empty.
- **"14 items · Kitchen (galley) 8, Kitchen 2 …"** is truncated mid-list. Show "14 items on this floor" and put the per-room list behind it, or drop it.
- The tip "Shift+click adds items to the selection; Ctrl/⌘+G groups them so they move together" is power-user help shown to every first-timer. Move it to (i) or the shortcut sheet.
- **The catalogue popover (12) is the best-designed control in the app.** It has search, category chips and sizes in mono. Two things to improve:
  - Add a 32 px top-view icon per row (the plan symbols already exist).
  - Remember the last-used category (it already does, through `addCategory`) and show "Recent".
- **The catalogue shouldn't open over the plan's left half.** Anchor it beside the rail, which it is, but at 320 px wide it hides the rooms you're furnishing. Fine for now.

### Plot (06, 13)
- There's a yellow `.note` at the top: "Editing the plot for As listed. Proposed keeps its own." It's useful, but it's the only yellow box in the app and it's on every visit.
  - Show it only when both layouts exist *and* the plots differ.
  - Or better: put a small "As listed's plot" label in the card header, coloured by layout.
- "See-through neighbours" and "Neighbours in their own colours" are view settings. Move them to the dock's "Show ▾" menu (in 3D only), next to Exterior and Site.
- **"House to boundary"**:
  - The four cards (Front 2.90, Rear 5.65, Left on boundary, Right on boundary) are a nice idea. But "on boundary" wraps over two lines in a bold 13 px face, so the cards misalign.
  - Use "0" with a small "on boundary" caption, or an icon.
  - The caption "metres, shortest, any floor" reads like a code comment. Use "Shortest distance, in metres".
- **Neighbouring buildings** is a list of text inputs, each with a height field, a native select ("Hipped") and a ×. Make each neighbour a row: `Attached neighbour   4.96 m · Hipped   ›`, which opens an editor or selects it on the site plan.
- **The compass dial** is good. Keep it. "162 ° SSE" has the degree sign floating outside the input. Put "°" inside as a suffix and "SSE" as a chip.
- The latitude and longitude fields with "The town is close enough for the location; east is positive longitude." are expert-only. Collapse them under "Location".

---

## 5. The plan editor (08, 09, 28, 30)

- **Double labels.** Every room shows Storey's label ("Kitchen 14.8 m² · 160 ft²") *on top of* the printed floorplan's own label ("Kitchen 4.xx × 3.xx m"), slightly offset, so the plan reads as a blurred double exposure. The galley also gets "Gas hob, double oven" overlapping "Kitchen (galley)". Options, best first:
  1. When the floorplan image is shown, **dim the image to about 35%** by default (the opacity slider exists, `planImage.opacity`) and use Storey's labels.
  2. Offer "Image: Off / Faint / Trace" as a three-state toggle on the rail's image button instead of a slider in a popover.
  3. Hide Storey's labels while the image opacity is above 60% (tracing mode).
- **The tool rail is icon-only and ambiguous.** Look at the third and fourth group in 08: the wall icon (▭▭), the canopy icon (a roof outline), the door icon and the window icon (⊞), and a "gap" icon (>|<), with Measure (a ruler at 45°) and Image below. The tooltips carry the names, but there's no label anywhere.
  - Option A: a labelled rail, 64 px wide, with an 11 px caption under each icon (Select, Room, Shape, Wall, Canopy, Door, Window, Gap, Measure, Image).
  - Option B: keep it icon-only, but show a rail-flyout label on hover *instantly* (not the 1 s native `title`), styled as a dark pill with the shortcut: `Door  D`.

  My pick is B, with A as a toggle in Settings.
- **Group the rail by intent:**
  - [Select]
  - [Room ▭, Shape ⬠, Wall, Canopy]
  - [Door, Window, Gap]
  - [Measure]
  - [Image ▾, Info]

  This is already nearly the order. The polygon room icon (a pentagon) and the canopy icon (an arch) are the weakest glyphs.
- **The stair symbol** (08) is a violet hatched rectangle with an X, crossed by the door swing of the kitchen. It's the only saturated violet in the app, and it reads as a selection.
  - Draw it as architectural treads: thin parallel lines, a direction arrow, and "UP" in 9 px caps, in `--text` at 60%.
  - Use the accent only when it's selected.
- **Colours.** The rooms are tinted from their floor finish (tan kitchen, pink hall, grey garage), and the canopy is a cyan hatch. On top of that come a red "garage door" bar, violet stairs, orange selection and blue vertex dots, so that's about six hues with no legend.
  - Proposal: neutral room fills (white, at ≤8% of the floor colour) in Build.
  - Finish colours only in Decorate.
  - One accent for selection (teal, not orange: orange is `--warn` in the tokens).
  - Vertex handles only on the selected room. Today blue dots sit on every corner of every room (08), which is noisy and suggests everything is draggable at once.
- **Selection affordances (09).** An orange outline, orange handles and orange dimension chips ("3.36 m", "4.42 m" rotated). These are good, but:
  - orange is the warning colour
  - the chips are rotated 90° on vertical edges, so they read sideways.

  Keep the chips horizontal and place them just outside the edge.
- **The "Hallway 1.40 x 0.90 m" ghost label floating in empty space** at the left of the plan (08, 09, 28) is part of the printed image outside the traced rooms. Crop the image to the floor's bounds plus a margin, or fade the image outside the traced footprint.
- **Fit ignores the inspector card.** "Fit the rooms" frames the plan under the card, so Living Room (rear) runs under it in 08. Fit to the visible rect: canvas width − card width − gaps.
- **The context menu (30)** is excellent: Rename…, Decorate this room, Lock shape, Knock through into…, Delete room. Make it discoverable: show "Right-click for more" once in the status line on the first selection.
- **What a first-timer would do wrong:**
  1. Drag a room's interior expecting to move it, and get a selection or nothing.
  2. Try to type sizes in "Printed size" thinking it resizes the room.
  3. Click the printed labels thinking they're Storey's.
  4. Not find how to leave a drawing tool (Esc). The status line helps here; keep it.
  5. Lose track of which floor they're on. The floor segment in the dock is the only cue, so put the floor name in the canvas's top-left as a quiet caption ("Ground floor · As listed").

---

## 6. The 3D view

- **Home view composition (02).** The house takes about 30% of the frame. Two large white neighbour blocks and a lime field take the rest, and the inspector card sits over the right neighbour. Decision §1.6 frames the *union of both plots and both layouts*. That's correct for camera parity, but it's too generous for the eye.
  - **Proposal:** frame the union of both layouts' *houses* (not plots), with a 15% margin.
  - Offset the target left by half the card width, so the house sits in the visible area.
  - Pitch down slightly less (about 35° instead of about 45°), so the eye reads the façade, not the roof.

  This **changes decision §1.6** (the union of floors *and plots*). The owner should decide; parity between layouts is kept either way.
- **The flat white neighbours.** They're pure `#eef0ee`/`#f7f7f5` boxes with a grey fascia, brighter than the house itself. That makes them the brightest, largest thing on screen and pulls the eye away from the subject.
  - Use a mid-warm grey (around `#d9dbd6` walls, `#c3c5c0` roofs), matte, at about 85% opacity. Or try "See-through neighbours" on by default.
  - The house should be the only saturated, textured object.
- **The ground.** The lime-sage field (`#b5c4a0`-ish) runs to the horizon edge with a hard cut against a white sky band at the top (02: the white strip under the top bar).
  - Fade the ground into the backdrop (the fog starts at 140 m, too far for this camera) or use a radial vignette.
  - Tone the green down 20% towards `--bg`.
  - The ideal canvas reads like an architectural model on a table: neutral ground, one colour object.
- **Photo pins (24, 25, 27, 29).** There are numbered teal dots (2, 3, 4, …) floating over the roof, one per room with photos. The number is the *photo count*, which means nothing at this distance. Five exterior photo billboards are also stacked diagonally across the front garden and the street.
  - Pins: off by default. Add a "Photos" toggle in "Show ▾".
  - When on, show camera-icon pins *at the room's floor level*, visible only for the floor slice in view.
  - Exterior photos: a single camera pin per side of the house; hover shows the thumbnail and click opens the lightbox.
  - **Bug:** the pin badges are drei `<Html>` with the default z-index range (`three/House.tsx:605`), so they draw **above every modal**. They sit on top of the Photos dialog (23), the command palette (24) and the shortcut sheet (26). Pass `zIndexRange={[10, 0]}` as `RoomLabels.tsx` does. Effort S.
- **The view cube (02)** is a white card with letters L, B, Top, R, F and a compass ring (N, S, E). "B" next to the red "N" makes people think "B = North?". Consider:
  - a real mini cube (3 visible faces, labelled Front / Side / Top), or
  - a compass ring with "Front" marked by the house's front icon.

  The house icon at the top-left of the card (home view) is good but tiny (16 px).
- **The overlay legend pill (15)** reads "Proposed (solid) vs As listed (red = removed, green = new)". That's a sentence in a pill. Make it a legend: `● New  ● Removed  ○ Unchanged`, with real colour dots and the layout names in the title.
- **The sun panel (17).** It's a floating card whose only content, until you tick it, is a checkbox "Sun study" and a ×. Clicking the sun icon in the dock *is* the intent.
  - **Opening the panel should enable the sun.** Closing it turns the sun off (or keeps it, with the icon showing active).
  - The checkbox goes. The panel opens straight on Date / Time / Play.
  - `SunControls.tsx`: `setSun({ enabled: true })` on open. `Dock.tsx`: toggle both.
- **Side by side (14).** The inspector card covers the top-right of the right-hand (Proposed) view, exactly where the extension is.
  - In side by side and wipe, **collapse the card automatically**: header only, with a "Build ▸" pill.
  - Or dock it to the right as a narrow column that shrinks the canvas.
  - The two "As listed" / "Proposed" pills are good. Keep those.
- **Wipe (16)** is lovely. The handle (a round "‹›" button) should be bigger (32 px), and the divider should carry a subtle shadow.

---

## 7. Visual design system

### Type
- Bricolage Grotesque (display) and IBM Plex Sans/Mono is a strong, slightly editorial pairing. It shines on the Review page (07: "Needs planning permission", "118.5 m² → 145.7 m²").
- In the shell, Bricolage is used at 14–15 px for the card title ("Build") and the summary line, where it's indistinguishable from bold Plex but with odd metrics.
- **Rule:** Bricolage only at ≥18 px (card room name, Review, dialog titles, welcome). Card titles become Plex 600 12 px all-caps tracking 0.06em ("BUILD"), as the Review tiles already do ("WHOLE HOUSE").
- The numbers in inputs use Plex Mono (good). Areas in summaries should too.

### Colour
- Teal `#0f6e66` is a good, distinctive accent, and it's used with restraint. Good.
- **Problems:**
  1. **Orange selection on the plan** competes with `--warn` (`#b45309`) for the 5% warning text.
  2. **The violet stairs** and **cyan canopy hatch** sit outside the token set.
  3. `.note` uses raw hex values (`#fbf6e6`, `#efe2b8`) and `.seg button:disabled` uses `#b0b6bf`, which breaks brand.md's "CSS tokens only".
  4. The red/green overlay is the only colour coding in 3D, and it isn't colour-blind safe. Use teal (new) and a warm red with a hatch (removed).
- Add tokens: `--sel` (selection, = accent), `--plan-stair`, `--plan-canopy`, `--note-bg`, `--note-line`, `--disabled`.

### Radii, shadows, spacing
- Radii are consistent (6 / 10 / 14 / pill).
- Shadows are well tuned (`--shadow-card` is soft and believable).
- Spacing inside the inspector is uneven:
  - label to field is 3 px
  - field to next label is 8 px
  - section heads are 36 px
  - the "Clear" links get their own line in 04.

  Adopt a 4 px grid: label→field 4, field→label 12, section padding 12/16.

### Pill overload
At 1440×900 in 3D (02) I count **six pill groups** on screen at once:
- the mode bar
- the layout switch
- the Plan/3D segment
- the floor segment
- the Compare button
- the View and Views buttons

Plus the "Ctrl K" keycap, and in Glass the top bar itself is a pill. Everything is a rounded grey capsule, so nothing is primary.
- **Proposal:** the mode bar stays as underline tabs, not a pill: text with a 2 px teal bar under the active one. The layout switch stays a segmented pill. The dock keeps its pill. Everything else becomes plain text buttons.
- That leaves three pill shapes with clear meanings.

### Studio vs Glass (27, 28)
- **Glass:**
  - runs the canvas under a floating top-bar pill, which is nice: about 60 px more canvas and a modern feel
  - **swaps the teal accent for ink `#1d2422`** (the photo pins go black, and the active mode is just white)
  - adds 62% translucent cards that, over a busy plan (28), make the inspector text sit on blurred floorplan, so legibility drops.
- **Studio** is clearer, keeps the brand, and reads as a tool.
- **Neither is clearly "sexier".** Glass looks more current in 3D, but worse on the plan.
- **Recommendation: one look.** Take Studio's solid cards and teal accent, and Glass's full-bleed canvas with a floating top bar *in 3D only*. The plan keeps the solid top bar, because the plan wants edges.
  - Then remove the Look setting.
  - This **changes decisions §1.15 and 2C** (two looks, a per-browser toggle) and halves the visual test surface. Owner to decide.

### Dark mode
- It's absent, which is fine for a desktop planning tool used in daylight.
- Don't build a full dark theme now. *Do* offer the 3D canvas an "evening" backdrop (the night backdrop already exists in `Lighting.tsx`) as a sun-study side effect.
- Tokens are already centralised, so a later dark theme is a single `:root[data-theme=dark]` block, plus the plan's white canvas (`.plan-canvas { background: #fff }` is hard-coded).

### Canvas background
- The 3D backdrop is a day-sky gradient (`#8fb2e0` → `#e2e9f0` → `#d9ddd6`), but the camera never sees the sky at the home pitch. The visible result is green ground plus a white strip.
- Either lower the pitch so the horizon gradient shows, or fade the ground to `--bg` so the canvas feels like the page.

### Iconography
- The line icons (the `components/icons` set) are consistent at 1.5 px stroke.
- The weak ones:
  - the polygon room, wall and gap glyphs on the rail
  - the "?" in the top bar, which is a bare character rather than an icon
  - the anchor arrows (Unicode ↖ ↗).

  Draw these as proper glyphs.

---

## 8. Microcopy and tone

The tone is plain and British, which is good. The jargon leaks are below.

| Where | Now | Better |
|---|---|---|
| Startup | "Load As listed" | "Show the house as listed" |
| Startup | "Load As listed and the proposed extension" | "Show it with my planned extension" |
| Build card | "Lock all rooms" | (move) "Lock rooms on this floor" |
| Build | "Traced size, width × depth (m)" | "Size on this plan" (W / D inside the fields) |
| Build | "Printed size on the plan (m)" | "Size printed on the listing" |
| Build | "Traced 2.74 × 1.89 m against printed 3.05 × 1.86 m: -10.2% / +1.6%. More than 5% out: check the tracing or the floor's scale." | chip: "10% narrower than printed · Check scale" |
| Build | "Floor settings · Level 0 · 73.0 px/m" | "Floor · Ground floor · scale set" |
| Build | "Knock through · 2 neighbouring rooms" | "Knock through · into 2 rooms" |
| Build | "Not heated (garage, store): left out of the heated area" | "Unheated (garage, store)" + (i) |
| Build | "Part of an extension (separate roof)" | "Extension room (gets its own roof)" |
| Decorate | "Pattern direction (degrees)" | "Direction" |
| Decorate | "Floor texture from photo" | "Use a photo as the floor" |
| Decorate | "Paper colour: quick colours" | (merge into the swatch row) |
| Decorate | "Clear" (links) | ↺ icon, tooltip "Back to default" |
| Furnish | "Place furniture on the plan" | (remove; "Add furniture" does it) |
| Furnish | "Add a piece I own" | "Add my own piece…" (once, inside Mine) |
| Furnish | "14 items · Kitchen (galley) 8, Kitchen 2 …" | "14 pieces on this floor" |
| Plot | "Editing the plot for As listed. Proposed keeps its own." | header tag "As listed's plot" |
| Plot | "metres, shortest, any floor" | "Shortest distance, metres" |
| Plot | "Drag the dial or type a bearing. The town is close enough…" | (i) only |
| Dock | "Compare: Single" | "Compare ▾" (or move, §3) |
| Dock | "View" / "Views" | "Show" / "Cameras" |
| Overlay | "Proposed (solid) vs As listed (red = removed, green = new)" | legend "● New ● Removed" |
| Sun | "Sun study" checkbox | (remove; opening the panel turns it on) |
| House menu | "Bring in updates… up to date" | (hide when up to date) |
| House menu | "Export JSON / Import JSON…" | "Save a copy… / Open a copy…" |
| House menu | "Clear all…" | "Start over…" (danger, in Settings) |
| Layouts | "7 rooms, 12 doors and openings, 7 windows, 73 px/m" | "7 rooms · 76 m²" |
| Palette | "Go to Kitchen · Ground floor" + right column "Ground floor" | "Kitchen" + right column "Ground floor" |
| Palette | "Search rooms and commands" | "Jump to a room or do something…" |
| Photos | "remove" (lower-case link under each photo) | trash icon on hover |
| Plan | "Nothing selected (i)" | "Click a room to edit it" |

---

## 9. Review page (07)

**What works:**
- Three tiles with uppercase micro-labels and big display numbers: "WHOLE HOUSE 118.5 m² → 145.7 m² +27.1 m²", "ROUGH COST Add your rates", "PLANNING Needs planning permission".
- A red left rule for a bad outcome.
- Plain-English reasons in bullets: "The side extension is about 7.3 m high (limit 4 m)."
- A clean areas table with mono numbers and a m²/ft² switch.
- Generous whitespace, a max-width of 1180 px, and white cards on `--bg`.

This is the most "designed" screen, and it proves the system works.

**Carry into the rest of the app:**
1. **Micro-label + big number** for every summary: the Build card, the Furnish card, the Plot boundary cards.
2. **Status colour as a left rule**, not as coloured paragraphs. The 5% tracing warning becomes a warn-ruled row.
3. **Reasons in plain bullets** with the limit in muted brackets. Use the same for "why this neighbour is flagged" and the listing-update reasons.
4. **Cards with real padding** (22/26 px). The inspector is at 14 px and feels cramped next to it.

**Improve:**
- "Add your rates" is a CTA tile with no button look. Add a "Set rates →" affordance.
- The Listed / Proposed columns are identical for the ground floor. Grey out the unchanged rows and highlight the changed ones (the "±" column is empty here), so the eye goes to the change.
- Put a small 3D thumbnail of each layout in the header.

---

## 10. Robustness at 1024–1280 px

- **At 1024 (29) the layout switch overlaps the mode bar.** "Rev" is cut and "As listed" sits on top of it. The cause: `header.topbar` is `grid-template-columns: 1fr auto 1fr`, and the right column's content (about 360 px) is wider than its 1fr share.
- The `.narrow-note` only appears below 899 px (`styles.css`), although studio-plan §3.1 specified 1099 px. So at 1024 there's no note either.
- **At 1280 with a browser sidebar** (a typical 13" laptop with a bookmarks or side panel open gives about 1100–1200 px), the same collision is imminent.

**Recommendation:**
- **Minimum supported width: 1180 px; designed for 1280 and up; best at 1440.**
- Degrade the top bar in steps (CSS container queries on `header.topbar`, or media queries):

| Width | Change |
|---|---|
| < 1360 | wordmark → mark only; "Ctrl K" keycap hidden (search icon stays) |
| < 1240 | layout switch → compact `Listed \| Proposed`; mode buttons padding 16 → 10 px |
| < 1180 | layout switch moves into the house menu button: "Listing 91770873 · Proposed ▾"; undo/redo stay; the narrow note appears |
| < 1000 | modes become icons + tooltip; note: "Storey works best on a laptop or larger" |

- Also make the grid `minmax(0,1fr) auto minmax(0,1fr)` with `overflow: hidden` on the sides, so nothing can ever overlap.
- The dock at 1024 (29) fits, but only just. Collapse "Ground floor / First floor" to "G / 1" below 1100.
- The inspector card at 320 px on a 1024 canvas covers 31%. Below 1240, start collapsed in 3D.

---

## 11. Accessibility quick pass (from the code)

- **Contrast:**
  - `--muted #6a736f` on `--bg #eef0ec` is **about 4.3:1**, which fails AA for normal text (4.5). It's used for Review subtitles, the narrow note and the plan status.
  - On `--panel #fff` it's 4.9:1 (passes).
  - On `--surface-2 #f4f5f2` it's about 4.5:1 (borderline).
  - Darken `--muted` to about `#5f6864` (≈5.3:1 on `--bg`).
  - In Glass, muted text on 62% white over the canvas is uncontrolled, and the plan doc itself says "never `--muted` below 12 px". `.sect-sum` is muted at 12 px, and `.room-label span` is muted at 11 px.
- **Disabled seg text** is `#b0b6bf` on `#f4f5f2`, about 2:1. Disabled controls are exempt, but in 01 the disabled layout switch looks like an error. Hide rather than disable before a model exists.
- **Focus:**
  - `button:focus-visible` has a 2 px accent outline. Good.
  - But `input:focus` uses `outline: 2px solid var(--accent-soft)` (`#e2efed`), which is almost invisible on white. The border change to accent carries it, at only 1 px. Use `box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent)`.
  - In Glass, `--accent` becomes ink, so the focus rings go black. Acceptable.
- **The dock** is `role="toolbar"` but has no roving tabindex or arrow-key navigation, so screen readers announce a toolbar and then nothing works as one. Either implement arrow keys or drop the role (a `div` with `aria-label="View"` groups is fine).
- **Segmented controls** use `.active` without `aria-pressed` (top bar layout switch, dock Plan/3D, floors, house-menu Look/Quality). Add `aria-pressed`, or model them as `role="radiogroup"` with `role="radio"`/`aria-checked`, as Compare already does.
- **Mode bar:** check that `ModeBar` marks the current mode with `aria-current="page"` (or similar). The visual `active` class alone isn't enough.
- **Command palette:**
  - the input has no `aria-label`
  - the panel isn't `aria-modal`
  - there's no `aria-activedescendant` or `aria-controls` linking the input to the listbox.

  So arrowing changes nothing for a screen reader.
- **The inspector card** is a `section` with `aria-label="Build inspector"`. Good. The collapse toggle has `aria-expanded`. Good. The `Section` heads have `aria-expanded` and `aria-controls`. Good.
- **The tool rail:** `aria-label` = tooltip text with the shortcut, `aria-pressed` for toggles, and a visible focus ring with -2 px offset. Good. But there's no `aria-pressed` or `aria-current` on the active *tool* (only on toggles), so the selected tool isn't announced.
- **Hit sizes:**
  - Rail 36 px. Good.
  - Top bar icons 32 px. OK.
  - The `.rail-chev` is 14 px, too small.
  - The anchor-grid buttons are 24×22 px, small.
  - The `.info-btn` is 18 px, small.
  - The "Clear" links are 2 px padded text.
  - The photo "remove" links.

  Desktop-only lowers the bar, but aim for 24 px minimum (WCAG 2.2 target size).
- **The 3D canvas** has no keyboard alternative for selecting a room except the palette ("Go to Kitchen"), which is a decent fallback. Mention it in the shortcut sheet.
- **Motion:** the loaders respect `prefers-reduced-motion`. Check the camera eases (`easeInOut` jumps) too.

---

## 12. Prioritised recommendations

### Quick wins (S, a day or less each)

1. **Load the inspector's CSS with the inspector.**
   - What: move the `.side .field / .size-row / .colour-pick / .floor-angle / .anchor-grid / checkbox` rules from `PlanEditor.css` into `components/Inspector.css`, imported by `InspectorCard.tsx`.
   - Why: in 3D before the plan has opened, the inspector renders unstyled (03 vs 09, 04 vs 10).
   - Effort: S.
   - Files: `src/editor/PlanEditor.css`, `src/components/InspectorCard.tsx`, new `src/components/Inspector.css`.
2. **Keep photo pins under modals.**
   - What: `zIndexRange={[10, 0]}` on the pin `<Html>`.
   - Why: the badges draw above the Photos dialog, the palette and the shortcut sheet (23, 24, 26).
   - Effort: S.
   - Files: `src/three/House.tsx` (≈line 605).
3. **Opening the sun panel turns the sun on.**
   - What: drop the lone checkbox.
   - Why: 17 is a card with one checkbox; it's two clicks for one intent.
   - Effort: S.
   - Files: `src/components/SunControls.tsx`, `src/components/Dock.tsx`.
4. **Rename "View" / "Views" → "Show" / "Cameras".**
   - Why: two identical words side by side.
   - Effort: S.
   - Files: `src/components/Dock.tsx`, `src/components/SavedViewsMenu.tsx`, `src/lib/commands.ts` (titles).
5. **Top bar can't overlap.**
   - What: `minmax(0,1fr) auto minmax(0,1fr)`, hide the wordmark under 1360, compact the layout switch under 1240, narrow note at 1179 (not 899).
   - Why: 29.
   - Effort: S.
   - Files: `src/styles.css`.
   - Note: this changes the 899 px breakpoint back towards studio-plan §3.1's 1099, so it's in line with the recorded plan.
6. **Darken `--muted` to about `#5f6864`, and give inputs a visible focus ring.**
   - Why: 4.3:1 fails AA on `--bg`; the `--accent-soft` outline is invisible.
   - Effort: S.
   - Files: `src/styles.css`.
7. **Furnish: one entry point.**
   - What: remove "Place furniture on the plan" (3D "Add furniture" switches to Plan and opens the picker), and show "Add my own piece…" only inside the Mine chip.
   - Effort: S.
   - Files: `src/components/ModePanel.tsx`, `src/editor/ModeSummaries.tsx`, `src/editor/AddItem.tsx`, `src/editor/MyFurniture.tsx`.
8. **Build card: lead with an instruction, not "Lock all rooms".**
   - What: move the lock into Floor settings or the context menu. Show "Click a room to check its size" as the empty-selection hint. Change "Level 0 · 73.0 px/m" to "Ground floor".
   - Effort: S.
   - Files: `src/editor/ModeSummaries.tsx`, `src/lib/modeSummary.ts`, `src/editor/Inspectors.tsx` (`floorSettingsSummary`).
9. **Rewrite the tracing warning as a chip, plus the microcopy table in §8.**
   - Effort: S.
   - Files: `src/editor/Inspectors.tsx`, `src/editor/DecoratePanel.tsx`, `src/components/SitePanel.tsx`, `src/components/startupDialog.ts`, `src/lib/commands.ts`.
10. **ARIA fixes.**
    - What: `aria-pressed` (or radio roles) on all `.seg` buttons; drop `role="toolbar"` on the dock or add arrow keys; label the palette input and add `aria-activedescendant`; mark the active rail tool.
    - Effort: S.
    - Files: `src/components/TopBar.tsx`, `Dock.tsx`, `HouseMenu.tsx`, `CommandPalette.tsx`, `src/editor/ToolRail.tsx`.

### Bigger moves (M–L)

11. **A designed first run.**
    - What: a welcome card with two picture tiles replaces the `choose()` startup prompt and the `.empty` block, plus a one-time three-step coach strip. Hide the top-bar controls until a model exists.
    - Why: §2 and 01 (the competing "Open layouts" button, the disabled-looking shell).
    - Effort: M.
    - Files: `src/App.tsx`, `src/components/startupDialog.ts`, new `src/components/Welcome.tsx/.css`, `src/components/panelPrefs.ts`.
    - Note: studio-plan §3.9 lists "the startup prompt flow" as not changing, so the owner should confirm.
12. **The inspector kit.**
    - What: designed controls that replace native `<select>` and `<input type=color>`:
      - `FinishPicker` (a tile grid with procedural thumbnails)
      - `SwatchField` (a swatch row, a custom well and a reset icon)
      - `PairField` (W × D, with unit suffixes)
      - `DangerZone`
      - a stat header (micro-label + mono number, as on Review).

      Apply it to Decorate first, then Build and Plot.
    - Why: §4. This is the single biggest "sexy" lever.
    - Effort: L.
    - Files: new `src/components/inspector/*`, `src/editor/DecoratePanel.tsx`, `src/editor/Inspectors.tsx`, `src/components/SitePanel.tsx`, `src/components/ExteriorPanel.tsx`, `src/three/textures.ts` (thumbnail export).
13. **The canvas glow-up.**
    - What:
      - frame the home view on the houses (not the plots), offset for the card, and pitch down less
      - mid-grey matte neighbours
      - a ground faded into `--bg`
      - photo pins off by default (a "Photos" toggle in Show), shown as camera icons at floor level
      - exterior photos as one pin per side.
    - Why: §6 (02, 25, 27).
    - Effort: M.
    - Files: `src/lib/cameraViews.ts`, `src/three/Viewer.tsx`, `src/three/Site.tsx` (`NEIGHBOUR_*`, `CARD_WALL`), `src/three/Lighting.tsx` (fog, ground), `src/three/House.tsx` (pins and billboards), `src/components/ViewMenu.tsx`.
    - Note: this **changes decision §1.6** (home framing = union of floors *and plots*).
14. **Plan clarity.**
    - What:
      - the floorplan image faint by default, with a three-state Image toggle (Off / Faint / Trace)
      - Storey labels hidden while tracing
      - handles only on the selected room
      - teal selection (not orange)
      - architectural stair symbol
      - neutral room fills in Build
      - horizontal dimension chips
      - Fit that respects the inspector card
      - instant labelled flyouts on the rail.
    - Why: §5 (08, 09).
    - Effort: M.
    - Files: `src/editor/PlanEditor.tsx`, `src/editor/PlanEditor.css`, `src/editor/ToolRail.tsx`, `src/editor/usePlanCamera.ts`, plan symbol files.
15. **Rethink the top bar and dock.**
    - What:
      - Plan/3D moves to the top bar beside the house name
      - the layout switch gains "⇆ Compare" (Wipe by default, with in-canvas Side by side / Overlay)
      - the dock becomes floors · sun · Show · Cameras
      - the mode bar becomes underline tabs, with Review set apart
      - "Plot" becomes "Outside"
      - side by side and wipe auto-collapse the inspector card.
    - Why: §3, §6 and §7 pill overload, and comparing as the hero feature.
    - Effort: M.
    - Files: `src/components/TopBar.tsx`, `src/components/Dock.tsx`, `src/components/ModeBar.tsx`, `src/styles.css`, `src/lib/modes.ts` (label), `src/components/InspectorCard.tsx`.
    - Note: this changes studio-plan §3.2/§3.5 (layout, not a numbered §1 decision). Renaming Plot touches the modes-brief decision "don't rename on-screen labels without reason", and the reason here is that the roof lives there.
16. **One look.**
    - What: Studio's solid cards and teal, plus Glass's full-bleed canvas and floating top bar in 3D only. Remove the Look setting.
    - Why: §7. Glass loses the brand accent and legibility on the plan, and two looks double the QA.
    - Effort: M.
    - Files: `src/styles.css`, `src/components/HouseMenu.tsx`, `src/components/panelPrefs.ts`, `src/lib/commands.ts` ("Look:" commands).
    - Note: this **changes decisions §1.15 and 2C**. The owner decides.

### Suggested order
1, 2, 3, 5 and 6 first (bugs and breakage). Then 11 and 13, because they're what a first-time viewer sees. Then 12, which is the biggest polish gain. Then 14, 15 and 16 once the owner has ruled on the decision changes.
