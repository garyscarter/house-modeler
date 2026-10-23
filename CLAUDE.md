# House Modeler

Browser-only React + react-three-fiber + zustand app for one house the owner is buying ("listing 91770873") and its renovation. See README.md for what it does and reference/listing-91770873/NOTES.md for the facts behind the built-in model.

## Standing rules

- **Delegate to subagents.** Split work into independent pieces and hand each to a subagent, as many as the job needs. Run independent ones in parallel, each in its own git worktree, and merge, check and push the results yourself.
- **Name every subagent after a famous pop star** (Madonna, Beyoncé, Adele, Prince, Kylie, Dua Lipa, ...), and use the name in the agent's description and in its prompt.
- **Pick the model and effort to fit the job.** Use Opus with high effort for judgement-heavy or visual work (matching photos, rendering, geometry, reviews). Use Sonnet with medium to high effort for well-specified changes (removals, refactors, wiring, data edits). Use Haiku with low effort for quick lookups and mechanical edits.
- Tell the user which subagents you launched, what each is doing, the model and effort each was given, and a quick, light-hearted "why this name" (a short table), and repeat that summary when reporting their results. Pick names that suit the job.
- **End every task by republishing the hosted version, fire and forget.** After merging and pushing, run `npm run build:hosted` and publish `dist-hosted/house-modeler.html` with the Artifact tool to the same URL, https://claude.ai/artifact/T9t6mnk6DjA4vGxw25pvTg (pass it as `url` from a new session, with `root: "dist-hosted"` and every file under `assets/` in `files`, mapping files that no longer exist to null). Do not open, screenshot or verify the published page, and do not re-check the result; if the build or publish errors, say so in one line and move on. Then give the user the link.
- Give each subagent a self-contained prompt: the goal, the files it owns, the files other agents are touching (to stay out of), how to verify, and the commit trailer to use.

## Working on it

- `npm ci`; if npm 10 fails with an "edgesOut" error, use `npx -y npm@11.6.2 ci` (or `install`).
- `npm run check` (typecheck plus vitest) and `npm run build` must pass before pushing.
- Check UI changes in headless Chromium with Playwright from /opt/node22/lib/node_modules, launched with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. In dev builds the store is on `window.__houseStore`.
- Pure logic goes in src/lib with tests; world frame: x right, world z = plan y (+z is the front of the house).
- Privacy: never put the property's address, postcode, title number or any owner's name in the repo; refer to it as "listing 91770873".
