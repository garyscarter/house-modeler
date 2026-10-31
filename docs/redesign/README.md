# Redesign specs (for later)

These are the big changes from the review of 31 October 2026 (`docs/review-2026-11.md`), too large for that pass's quick wins. Each spec was written by an Opus planner, then checked against the code by a second Opus agent and corrected in place. They describe the code at `07e5fa8`, which is round 1 of the quick wins. Round 2 of the quick wins is assumed in the specs, which mark it as "still to land".

## The specs

| Spec | In one line | Effort | Questions |
|---|---|---|---|
| [phone-shell.md](phone-shell.md) | The phone loses its top bar and tab bar. A top-left chip and one dock with a mode menu replace them, and landscape gets a side sheet. Clear canvas goes from 67 % to about 86 % in portrait and from 28 % to about 69 % in landscape. | L | 8 |
| [modes-and-top-bar.md](modes-and-top-bar.md) | Five modes: Build, Decorate, Furnish, Electrics, Outside (Garden and Plot merged). Review becomes a top-bar button, Plan/3D moves to the top bar, a Settings dialog is added, and the house menu keeps project actions only. | L | 5 |
| [direct-selection.md](direct-selection.md) | Pick furniture, joinery and electrical points in 3D: hover, select, the inspector, keys, then drag on the floor. Stairs are selected by tapping their symbol on the plan. | L | 5 |
| [one-renderer-compare.md](one-renderer-compare.md) | One WebGL canvas for Wipe, Side by side and Overlay: shared textures, one context, instant Flip. DPR drops while the camera moves. | L | 5 |
| [image-sync.md](image-sync.md) | Images upload once by content hash; the server keeps the last revisions and starts safely; phones save less often. Photos have since left projects, so a typical edit is 321 KB today, not 5 MB. | M–L | 3 |
| [code-structure.md](code-structure.md) | ESLint, knip and type-checking for `server/` and `scripts/`. `planningCheck` becomes a table of rules, SiteEditor is split, the fixture catalogue moves into `lib`, and the chrome sizes become CSS tokens. | L | 4 |
| [visual-system.md](visual-system.md) | A 6-step type scale, radius and motion tokens, a Welcome screen with a real still of the house, a studio-sweep ground, and a plan hierarchy. | L | 6 |

Every spec has the same sections: why, goal, decisions already made, assumptions, design, technical design, build plan (chunks for parallel builders), acceptance checks, risks, open questions (each with a recommendation), out of scope, and effort.

## Suggested order

1. **code-structure, part A** (lint, knip, type-checking). It makes every later chunk safer. Parts B to D can run any time.
2. **Choose the phone's modes.** Answer phone-shell question 1 and modes-and-top-bar together: either the phone menu lists today's seven modes, or the five-modes change lands first.
3. **phone-shell.** The iPhone is a device that matters most.
4. **modes-and-top-bar.**
5. **direct-selection**, after code-structure part D moves `fixtureParts` out of `Fixtures.tsx`.
6. **visual-system.** It doesn't depend on the others, but its type-scale pass touches every CSS file, so don't run it alongside phone-shell's CSS work.
7. **one-renderer-compare.** Measure on a real laptop first; the review's frame counts come from software GL.
8. **image-sync.** Its question 1 decides how much of it is worth building now.

## Where the specs overlap

- **Phone chrome tokens:** phone-shell (the `--chrome-*` tokens and one `phone.css`) and code-structure part E (`--dock-h`, `--sheet-cover`, `--dock-top`) both turn the phone chrome's pixel sums into tokens. If phone-shell goes ahead, its chunk A replaces code-structure part E.
- **Modes on the phone:** phone-shell question 1 and the whole of modes-and-top-bar. Decide them together.
- **Furnish "+" on the phone:** phone-shell has it jump to the Plan picker, while direct-selection question 2 recommends placing in 3D. Whichever lands second updates the other.
- **`Fixtures.tsx`:** code-structure part D moves its catalogue and direct-selection adds picking to it. Land part D first.
- **Home camera and ground:** the quick wins lower the camera to about 25°. visual-system builds on that (studio sweep) rather than lowering it further.

## Picking one up

- Answer the spec's open questions. Each comes with a recommendation.
- Have an Opus agent re-check the spec against HEAD, because the code moves on and line numbers drift. It should update the assumptions and the build plan.
- Run the build plan's chunks as Sonnet builders in parallel worktrees. Merge, run `npm run check` and `npm run build`, check the screenshots, and push to `main`, following CLAUDE.md.
