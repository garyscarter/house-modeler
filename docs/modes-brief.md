# Modes redesign: brief

Status: agreed, not started. A planning pass (Opus) was begun and interrupted by a usage limit before it produced a spec; nothing has been built.

## What the owner asked

> "The settings/config pane has absolutely everything in it (I think?) rather than things that just relate to the selected room. Surely there's a better UI for that? Suggest some options."

They asked for an opinion first, then chose the recommended option: **"Go with your pick."**

## What is actually cluttered today

The right-hand panel in Check plan is already contextual (it shows the inspector for the selected room, opening, wall, canopy or item), but:

1. **The room panel is one long form**: name, area, printed size, notes, unheated, floor finish / colour / angle / grout, skirting, wall covering and paint swatches, every per-wall finish, Knock through, delete. The new floor and wall finishes made it longer.
2. **With nothing selected** the same panel shows the whole furniture catalogue followed by the floor's settings (name, level, scale, stairs).
3. **The left drawer mixes project-wide things** (layouts, photos, exterior, site, report, planning check, settings) with things only needed while editing.

## Options that were offered

| | Idea | Outcome |
|---|---|---|
| A | Collapsible sections in the room panel (Shape & size / Floor / Walls / Ceiling / Knock through), each with a one-line summary when closed, remembering which are open | **Chosen**, inside C |
| B | Separate "what's selected" from "what's being added": catalogue behind an **Add** button (popover / bottom sheet with search and categories), floor settings behind a link, a short floor summary when nothing is selected | **Chosen**: comes with C |
| C | **Modes**: Build / Decorate / Furnish / Plot / Review, each showing only its own tools and panel | **Chosen** (the recommendation) |
| D | A floating quick bar next to the selection (rotate, copy, delete, finish picker; "More…" opens the full panel) | Not now; possible later for the iPad |

## Decisions

- **Modes** (a switch at the top):
  - **Build**: rooms, walls, doors, windows, gaps, archways, stairs, canopies, floor settings (name, level, scale, calibrate, stairs), knock through.
  - **Decorate**: floor finishes (incl. herringbone, angle, grout), wall coverings, paint palette swatches, skirting, per-wall feature finishes. **Tap a floor or a wall, in the plan and in the 3D view**, then pick a finish or swatch; a tapped wall edits that wall's own finish, a tapped floor the room's floor.
  - **Furnish**: the catalogue behind an **Add** button with search and categories; a selected item shows its inspector; arrow-key nudging, copy and paste stay as they are.
  - **Plot**: the site editor and the Site and Exterior panels.
  - **Review**: Report and Planning check (and the As listed vs Proposed comparison if it fits).
- **Within a mode** the right panel shows only that mode's fields for the selection; where it is still long, use collapsible sections (option A) with a summary line when closed and remembered open/closed state.
- **Nothing selected**: a short summary of the floor for that mode instead of the catalogue and floor settings.
- **Project-level things** (switching As listed / Proposed, Photos, Settings, sync, import/export) stay reachable from a project/menu area, not mixed into mode panels.
- **Keep everything that works today reachable**, keep the keyboard shortcuts (arrows, R, Ctrl/⌘ C/V/D, Delete, Shift+click knock through), and don't rename on-screen labels without reason.
- **Must work well on the iPad (about 1024 px, touch) and at phone width (390 px).**

## How it is to be built

- It was held back until the floor finishes, wall coverings and knock-through work (all in the room panel) had landed; they have.
- Per the standing rules: an Opus agent plans it first and writes a tight spec (store field for the mode and its interaction with 3D / plan view, selection and site editing; component changes file by file; a field-by-field mapping of every current inspector field to a mode; Decorate-mode picking in plan and 3D, reusing the existing selection code; the left drawer's new grouping; responsive rules; acceptance checks; what not to change), split into two or three independent chunks. Sonnet agents then implement the chunks in parallel worktrees.
- The planning agent's working name was Taylor Swift ("The Eras Tour": five modes, each with its own look).
