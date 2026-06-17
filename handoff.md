# Handoff — SaltExperiment modernization

A working note for picking up this project in a new session. Read this top to bottom
before writing code.

---

## Where things stand

The simulator was rebuilt from a static ProcessingJS + jQuery page into an animated,
data-driven virtual lab.

- **Open PR:** #1 — https://github.com/SiamRahman29/SaltExperiment/pull/1
- **Branch:** `modernize-p5-lab` (8 fine-grained commits, pushed to origin)
- **Status:** NOT merged. Deliberately holding off — do not merge yet.
- **`main` is untouched.**
- **Stacked PR:** #2 — https://github.com/SiamRahman29/SaltExperiment/pull/2
- **Branch:** `polish-and-difficulty` (base: `modernize-p5-lab`, 3 commits, pushed). Adds the
  quick-polish items + the Easy/Hard difficulty system. Also NOT merged — same
  review-at-your-own-pace hold.
- **Stacked PR:** #3 (to open) — branch `flame-tests` (base: `polish-and-difficulty`). Adds
  the flame-test station: a Bunsen burner second scene on the bench. **This is the current
  tip of the stack** (`main` ← #1 ← #2 ← #3). Committed locally; push + `gh pr create
  --base polish-and-difficulty` when ready (not done unprompted — outward-facing).
- **Design doc (the blueprint):**
  `~/.gstack/projects/SiamRahman29-SaltExperiment/siamrahman-main-design-20260616-154431.md`
  (Approved. Approach A: p5.js, zero build step, data-driven spine, lab-notebook framing.
  The "Next Steps" build order in that doc is the master plan — steps 1–6 are done in PR #1,
  steps 7+ remain.)

---

## How to start the next session

The stack is `main` ← #1 (`modernize-p5-lab`) ← #2 (`polish-and-difficulty`) ←
`flame-tests`. The next feature stacks on the **current tip**, `flame-tests` — NOT off main:

```bash
cd /e/Code/SaltExperiment
git fetch origin
git checkout flame-tests
git pull --ff-only      # only if flame-tests has been pushed
git checkout -b <next-feature-name>     # e.g. gas-tests
```

When that work is ready, open its PR with `--base flame-tests` (stacked) so they review/merge
in order:

```bash
gh pr create --base flame-tests --head <next-feature-name> --title "..." --body "..."
```

Do not merge anything without the user's go-ahead. They want to review at their own pace,
bottom-up: #1 first, then #2, then flame-tests, then this. `flame-tests` is committed
locally but not yet pushed — push it + open its PR (`--base polish-and-difficulty`) when the
user gives the word.

---

## How to run and test it

No build step. Two options:

1. **Quick look:** open `index.html` directly in a browser (works from `file://` — the
   scripts are plain global `<script>` tags, not ES modules).
2. **Clean testing (recommended, needed for the browse tool):**
   ```bash
   python -m http.server 8765
   # then: http://localhost:8765/index.html
   ```

The gstack browse tool drives it headless. Useful commands:
```bash
B=~/.claude/skills/gstack/browse/dist/browse
"$B" goto "http://localhost:8765/index.html#salt=Fe3%2B~Cl"   # seed a known salt via URL
"$B" reload                                                    # hash-only nav does NOT reload; reload to re-init
"$B" js "<expr>"                                               # inspect state
"$B" screenshot "#stage canvas" /tmp/shot.png                  # capture the bench
"$B" console --errors
```
Gotchas learned:
- Navigating to the same URL with only a changed `#hash` is a same-document nav — `init()`
  won't re-run. Always `reload` after seeding a salt via the hash.
- The browse tool writes screenshots to a Git-Bash path like `/tmp/shot.png`. To open it
  with the Read tool, convert to a Windows path first: `cygpath -w /tmp/shot.png`
  (e.g. `C:\Users\USER\AppData\Local\Temp\shot.png`).
- `python -m http.server` is only a static file host so the browse tool has an `http://`
  URL — the app is 100% static client-side JS (runs from `file://` too). Nothing dynamic;
  no backend.

---

## Architecture (so you don't have to re-derive it)

The whole point of the rebuild: **chemistry is data, not control flow.**

| File | Role |
|------|------|
| `js/reactions.js` | **The spine.** `IONS`, `REAGENTS`, and `REACTIONS[ion][reagent]` (each row: colour, precipitate/gas flags, ionic equation, observation). `lookupReaction(salt, reagent)` is the engine. Everything reads from here. |
| `js/sketch.js` | p5.js renderer. Dumb — draws whatever is in `SimState` and runs the animation clock. Exposes `window.Lab` API: `setBaseColor`, `loadReagent`, `addReagent(reaction, onDone)`, `freshSample`, `isBusy`. |
| `js/app.js` | The workflow. Builds dropdowns from data, runs tests, drives `Lab`, logs the notebook, handles identify + scoring (localStorage), URL-seeded challenges. |
| `css/styles.css` | All styling. |
| `index.html` | Markup + script includes. No inline JS. |
| `vendor/p5.min.js` | p5.js 1.9.4, vendored (no CDN). |

**To add a reaction or a reagent: edit `reactions.js` only.** A new reagent is one entry in
`REAGENTS` + its reaction rows; the dropdowns and engine pick it up automatically.

---

## Next steps (prioritized)

These come from the design doc's build order (step 7 = "polish + breadth") plus items
flagged during the build. Suggested order:

### 1. Quick polish — ✅ DONE (branch `polish-and-difficulty`)
- ~~Clean `name` field per ion for prose ("iron(III) chloride").~~ Done — `name` added to
  every ion in `reactions.js`; `identify()` uses it. `label` still drives the dropdowns.
- ~~Precipitate settle easing/jitter.~~ Done — `stepParticles()` in `sketch.js` now
  accelerates, decelerates into the heap, sways, and shudders on landing.

### 2. Difficulty + hints — ✅ DONE (branch `polish-and-difficulty`)
- Easy/Hard segmented toggle in the score bar (persisted to localStorage).
  - Easy: colour-clue hint in the Observe-first panel, from a new `clue` field on the
    coloured cations (colourless solution → "rules out iron and copper").
  - Hard: hints withheld + a 5-test budget (`HARD_TEST_LIMIT` in `app.js`); a counter shows
    tests left and "Add to sample" locks when spent. See `updateTestGate()`/`testsExhausted()`.
- Best-score tracking: leanest winning solve ("best N tests") in the score bar, persisted
  (`readScore()` is back-compat with the old `{solved, attempts}` shape).

### 3. Full lab bench (the big one — "Full bench" pillar from office hours) — IN PROGRESS
- **Flame tests** — ✅ DONE (branch `flame-tests`). A second station on the bench:
  - `flame` field per cation in `reactions.js` (`{color, name, observation}`, or `null` for
    no characteristic colour). Engine helper `lookupFlame(salt)` mirrors `lookupReaction`.
    Coloured flames: Na⁺ golden-yellow, Cu²⁺ green/blue-green, Ca²⁺ brick-red. The rest are
    `null` (genuinely diagnostic — a null result rules those three out).
  - `sketch.js` now has a **station concept**: `SimState.station` is `"tube"` | `"flame"`,
    and `p.draw()` branches on it. The flame scene draws a Bunsen burner with a layered,
    flickering, emissive flame (uses `p.blendMode(SCREEN)`) and a nichrome wire that dips in
    with a glowing salt bead. New Lab API: `setStation(name)`, `flameTest(flame, onDone)`;
    `isBusy()` and `freshSample()` are flame-aware.
  - UI: a segmented **Reagent test / Flame test** toggle at the top of the Step 1 card swaps
    `#reagent-station` / `#flame-station`. `app.js` `setStation()` drives it; `runFlameTest()`
    runs the test, logs to the notebook + explain panel. Flame tests **count against the
    Hard-mode budget** (both test buttons lock when spent). Station switch is blocked
    mid-test. Verified via the browse tool (Na gold, Cu green, Zn null, budget, guards).
- Heating a tube / gas tests (e.g. warming for the NH4+ + NaOH ammonia smell, which is
  already in the data as `gas: true` but has no dedicated visual) — STILL OPEN. The station
  concept is now in place, so this is a third scene rather than a refactor.

### Design-doc open questions still live
- p5 via vendored file (done) vs CDN — kept vendored.
- Keep "guess cation + anion" framing, or move toward the full "investigation / suspect list"
  deduction mode (Approach C) where every test narrows a live list of possible ions. This is
  the biggest experience upgrade still on the table.

---

## Things NOT to do
- Don't merge PR #1 (or stacked PRs) without the user asking.
- Don't push to `main`.
- Don't reintroduce a build step or framework unless the user decides to move to Approach B
  (the design doc explains when that becomes worth it).
- Don't re-hardcode chemistry into UI handlers — keep it in `reactions.js`.

---

## This file
`handoff.md` is a working note that now travels with the work — it's tracked on
`polish-and-difficulty` (committed there, part of PR #2). Keep updating it at the end of
each session and commit it to whatever branch you're on.
