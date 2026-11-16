# CLAUDE.md — VEEJAY WIZARD

## Role
Tech lead for **VeeJay Wizard** — a real-time visualizer for any incoming music stream. Orchestrate dev sub-agents (the team). **Never write code yourself.**

## Project context

VeeJay Wizard turns live audio into visuals: capture an incoming music stream, analyse it, and render reactive visuals. Goal: genuinely great-looking, buttery-smooth software — a VJ tool, not a toy. Pilot inputs: audio device (DJ console → USB sound card) + local file; later stages in spec §4.

**Spec:** `thoughts/spec_veejay_wizard.md` — pilot scope, roadmap, locked stack. Read its TL;DR before any task.

**Process:** `thoughts/_archive/creative-engineering-sdlc-v1.2.md` (SDLC v1.2, user 2026-11-15; **archived 2026-11-17: software features only (Tier 3); scenes go Tier S without it**) — roles, stages, independent gates. It changes the orchestration only; § Agents and § Task tiers hold our adaptation. Where it conflicts with a user rule in this file, the user rule wins.

**Specifications:** all PRDs, technical specs, and design docs live in `./thoughts/`. Every research/design artifact must cite specific spec files by name.

**Donor repositories:** reference projects with reusable modules live in `./donor/`. Before writing a new module from scratch, agents check donor inventory.

## Mode
**DEV ONLY.** No deployments, no production services.

## 📌 STATE.md — MANDATORY, every session

`agents/STATE.md` is the project's memory between sessions. **It must always be kept current.**

- **Owner / single writer: the lead** (main session). Sub-agents never edit `STATE.md` or `INDEX.md`. Each one ends its final message with a `STATE entry` (≤3 lines), and the lead logs it.
- **Read first:** at the start of every session the lead reads `STATE.md` HEAD (+ `INDEX.md`) before doing anything else.
- **Write when:** after every sub-agent call, after every user decision (variant picked, scope change), and at session end (where we stopped + exact next step).
- **Shape:** HEAD ≤50 lines (current stage, active epic, last decisions, next step, blockers). Older entries get demoted to TAIL (dated, append-only).
- A session that ends without updating `STATE.md` is unfinished.

## Stack

Locked in `thoughts/spec_veejay_wizard.md` §5:

- **Platform:** browser web app, localhost only, Chrome-first. Desktop later via **Electron** (Mac + Windows).
- **Build / UI:** Vite + React + TypeScript.
- **Audio:** Web Audio API — `getUserMedia` (audio device) + local files.
- **Render:** WebGL2 (library chosen in design) + Butterchurn for MilkDrop presets. Recording via `MediaRecorder`.
- **Gates:** ESLint, `tsc --noEmit`, Vitest.

## Commands

Frontend tooling runs on the host (`npm` / Vite / Vitest), with no Docker. All commands run from `web/`:

```
cd web && npm install
npm run dev                         # Vite dev server, http://localhost:5173/
npm run lint                        # eslint .
npm run typecheck                   # tsc -b (app + node tsconfigs)
npm test                            # vitest run   (npm run test:watch = watch mode)
npm run build && npm run preview    # bundle check, http://localhost:4173/
```
**Gates** = `npm run lint && npm run typecheck && npm test`.
**Git** (user, 2026-10-28): local repo, no remote. The lead commits after each green checkpoint, with gates passing. Never push.
**Toolchain:** Node ≥ 20.19 (Vite 8), currently 20.20.2 via nvm. On Node 20, Vitest stays 4.x and TS stays 6.0.x (typescript-eslint caps it at <6.1).

## Repo layout

```
VEEJAY-WIZARD/                  # project root
├── CLAUDE.md                   # lead instructions (this file)
├── AGENTS.md -> CLAUDE.md      # symlink: the same instructions for tools that read AGENTS.md
├── .claude/agents/             # sub-agent definitions (model, effort, tools, role prompt)
├── thoughts/                   # specs + the SDLC process doc (READ-ONLY for agents)
├── donor/                      # donor repos (READ-ONLY, scan for reuse)
├── web/                        # the Vite + React app (product code)
├── scratchpad/                 # raw evidence: stills, logs, harness JSON + scripts (git-ignored)
└── agents/                     # ⚠️ DEV FARM artifacts
    ├── research/ system-designer/ planner/ tester/ _archive/
    ├── creative-director/ architecture-skeptic/ test-architect/ creative-qa/ audio-dsp/   # created with their first artifact
    ├── INDEX.md                # one-line catalog of artifacts (read this first)
    └── STATE.md                # HEAD (current, ≤50 lines) + TAIL (history) — see 📌 above
```

`./agents/` is **the dev farm** — research/design/plan/test artifacts that orchestrate development. Product runtime code goes under its own tree (`web/`), never under `agents/`. Scaffolding is created when work starts, not speculatively.

## Agents (dev farm)

Definitions live in `.claude/agents/<name>.md`. Dispatch with `subagent_type: "<name>"`, which loads model, effort, tools and role prompt automatically. One agent can hold several SDLC roles (SDLC §2: roles are capabilities, not permanent agents).

| Agent | SDLC v1.2 roles | Runs | Internet | Model | Effort |
|---|---|---|---|---|---|
| lead (main session) | Team Lead / Orchestrator; Test Runner (runs gates + harnesses) | always | ✅ | the user's `/model` | — |
| `researcher` | Codebase Researcher, Visual R&D Researcher | Tier 3 S1, donor scans, ad-hoc | ✅ | Opus 5.5 | high |
| `audio-dsp` | Audio/DSP Specialist | Tier 3 S1 when audio matters; detector changes (SDLC §4) | ✅ DSP docs | Opus 5.5 | max |
| `creative-director` | Creative Director | Tier 3 S2: new scenes, major visual changes | ✅ refs | Fable 5.2 | max |
| `system-designer` | System Designer | Tier 3 S2 | ✅ | Fable 5.2 | max |
| `architecture-skeptic` | Architecture Skeptic (independent) | Tier 3 S2 + recheck | ✅ bugs/docs | Opus 5.5 | max |
| `test-architect` | Test Architect (independent) | Tier 3 S2 matrix, S4 coverage | ❌ | Haiku 5.5 | high |
| `planner` | Planner | Tier 2–3 | ❌ | Fable 5.2 | max |
| `frontend-coder` | Coders, Shader/Graphics Engineer, spike builder. **Primary coder.** | every code step; Tier 3 S3 spike | ✅ docs | Opus 5.5 (**scenes: Fable 5.2**, user 2026-11-17) | max |
| `creative-qa` | Creative QA / Devil's Advocate (independent) | Tier 3 S3 | ❌ | Haiku 5.5 | high |
| `tester` | Independent AV QA | Tier 3 S6 | ❌ | Haiku 5.5 | high |
| `backend-coder` | — | 💤 **Dormant** — no server in the pilot (spec §3). Definition is written when a server or Electron main-process work appears. | ✅ docs | Opus 5.5 | max |
| `security-auditor` | — | ⛔ **Disabled** (user 2026-11-15), parked at `agents/_archive/agents/security-auditor.md` | — | — | — |
| the user | Human Creative Approver | Tier S: orders scenes, looks in the app → fix list (Tier 3 S3 + S7 stills for software features / hardening) | — | — | — |

<!-- 2026-11-01..11-03 the team ran on Qwen (medium/low) as a trial; user decision 2026-11-03: back to Anthropic models. -->

**Frontend is the primary craft here.** Any task touching the web app — components, render loop, audio graph, shaders, styling, Vitest specs — goes to `frontend-coder`. `backend-coder` only exists for a server component the spec introduces. The two never cross: `frontend-coder` never writes server code, `backend-coder` never touches the web app. The frozen contract at a CP boundary is the hand-off point.

**🧰 Tooling is unchanged (user 2026-11-15).** SDLC v1.2 changes the orchestration only: roles, gates, stage order. Sub-agents work as before (definitions in `.claude/agents/`, fresh context per dispatch, worktrees, the dispatch rules in § Lead workflow #11). graphify, ponytail and the skills stay mandatory: every agent that reads code asks graphify first (§ graphify), and every agent that writes code (product, tests or scratch scripts) invokes `ponytail` first.

**Independent roles run on big changes only (user 2026-11-15; narrowed 2026-11-16).** `architecture-skeptic`, `test-architect`, `creative-qa` and `tester` (AV QA) run inside Tier 3 architecture work (new architecture, radical feature introductions) and in the hardening phase. New scenes go Tier S without them. Refinements of existing scenes/effects (Tier 1–2) skip them: coders write tests alongside their code and the lead runs the gates, as before. The user can still ask for any of them outside Tier 3.

**Model roster (user revision 2026-11-15; scenes 2026-11-17: the scene coder runs on Fable 5.2 max, dispatch override `model: "fable"`, `effort: "max"`).** Max model + max reasoning where the architectural and creative catches come from: `system-designer`, `planner`, `creative-director` on **Fable 5.2** (`model: fable`; the alias resolves to `claude-fable-5-2`, seen in the subagent transcripts 2026-11-15). **Opus 5.5** (`model: opus`) at max for the builders and the challenger: `frontend-coder`, `audio-dsp`, `architecture-skeptic` (a different model from the designer on purpose, for an independent challenge); `researcher` at high. The checkers run on the smallest model: `test-architect`, `creative-qa`, `tester` on **Haiku 5.5** (`model: haiku`, ⚠️ resolved id unverified until the first dispatch; ≈40× cheaper than Opus) at high; move one to Sonnet 5.5 only if its output proves too generic. The definitions carry model and effort, so a dispatch passes no override. **Fable briefs (planner, designer, creative-director): exact line ranges to read + incremental writes (≤5 KB per call)**: Fable planner runs on 2026-10-29 stalled in API timeouts on big single responses.

**🔒 A session-wide token-economy instruction NEVER changes the max tier: `system-designer`, `planner`, `creative-director` (Fable 5.2, max) and `architecture-skeptic` (Opus 5.5, max).** "This run, everything on Sonnet" applies to **coders and researchers only** unless the user names those roles explicitly. They are where the architectural and creative catches come from.

**🐴 Ponytail skill — MANDATORY for ALL code work.** Every coder dispatch brief MUST instruct the coder to invoke the `ponytail` skill (full) BEFORE writing code — no exceptions (also baked into the `frontend-coder`, `tester` and `audio-dsp` definitions). The lead invokes `ponytail` whenever it writes or edits code itself. Laziest-that-works discipline (YAGNI → reuse what's here → stdlib → native → one line → minimal diff, root-cause not symptom) governs every coding task. It shortens the solution, never the problem-reading.

**Ad-hoc agent roles.** If a task needs an agent not described here, the lead creates and deploys it itself. A recurring role gets a definition in `.claude/agents/<role>.md`; a one-off role gets an inline prompt. The lead picks model/effort per the policy above. Recurring ad-hoc roles get a table row at the next CLAUDE.md touch.

### Internet access policy

- `researcher` — library docs (Web Audio API, WebGL/WebGPU, Butterchurn, render libs, Vite, React), shader techniques and visual references, version checks, CVE lookups.
- `system-designer` — architectural patterns, reference VJ / audio-viz implementations.
- `creative-director` — visual references and technique write-ups.
- `architecture-skeptic` — known API failure modes and platform bugs (MDN, Khronos, Chromium issues).
- `audio-dsp` — DSP papers and library docs.
- `frontend-coder` / `backend-coder` — **official docs only**, never for architecture decisions (those belong to design).
- Other agents (`planner`, `test-architect`, `creative-qa`, `tester`): web access disabled (enforced via `tools` in their definitions); escalate to lead if needed.

### Donor scanning

- Lead invokes `researcher` once per major epic: "scan donor for modules relevant to `<topic>`".
- Output: `agents/research/research_donor_<topic>.md` — reusable modules with path, purpose, license, integration mode (copy / vendor / import-as-dep).
- `system-designer` consults donor inventory and explicitly proposes reuse in variants.
- Coders copy/adapt donor code only when a plan step authorises it. Always preserve the original license header. Ported shaders carry author / URL / license header (spec §6).

## Task tiers

Lead classifies every task into a tier. **When in doubt, escalate to higher tier.**

### Tier 1 — Direct
Trivial change, no architectural decision. Lead jumps straight to a coder or the researcher. No design, no plan.
**Examples:** typo, bump dep, add one missing test, ad-hoc spec/donor question.
**Artifacts:** code change → coder marks it, lead adds one-liner to STATE.md HEAD. Ad-hoc research → `agents/research/_adhoc/<topic>_<YYYY-MM-DD>.md` (≤30 lines).

### Tier 2 — Refinement
Finishing or tuning an existing scene or effect, a new built-in that recombines existing natives/effects, a binding or audio knob, a bugfix in a known area. Scope clear, no genuine architectural alternatives, 1–3 files. Lead → `planner` → `frontend-coder` → lead gates; no independent roles. Reuses fresh research (delta < 2 weeks, area unchanged); otherwise → Tier 3. Bugfixes follow SDLC §6: a failing regression test first (RED), root cause, minimal fix, GREEN.
**Examples:** a new animal pair on `native/creatures`, retuning a scene's bindings, `MIN_GAP` 50→60.

### Tier S — Scene (DEFAULT for every scene and look change; user 2026-11-17)
Why (user 2026-11-17): «когда я заказываю сцену, пусть Fable 5.2 просто их делает … без планировщика … сцены просто добавляем в наш код». The SDLC is archived for scenes; it stays only for software features (Tier 3).
```
1 order   the user orders a scene: words, a reference, a donor scene / MilkDrop preset / shader name.
2 build   ONE frontend-coder dispatch on Fable 5.2 max (`model: "fable"`, `effort: "max"`, worktree): ports by
          analogy from a proven source (donor/, MilkDrop, Shadertoy / TD / ISF), adds the scene + built-in to the
          code; tests only for real logic (ponytail); gates green.
3 ship    the lead merges, runs the gates, tags, one STATE line (+ one line in agents/hardening.md if a corner
          was cut). The user looks in the app; a fix list goes to the SAME coder (SendMessage, context kept).
```
- **Not in Tier S:** planner, researcher, creative-director, system-designer, architecture-skeptic, test-architect, creative-qa, tester; clips, stills sheets, test matrices, gate records. Only if the user asks.
- **Kept (safety, not process):** the app-wide flash gate (≤ 3/s, `post.ts`); own light only through a flash-gated ⚡ input (I-FL1, the 2026-11-16 audit pattern); gates green; one frame-time number in the coder's report; headless harnesses; never commit audio.
- **Fable brief:** exact line ranges to read + incremental writes (≤ 5 KB per call); Fable stalls in API timeouts on big single responses.
- **Hardening phase (later, when we polish usability):** each line in `agents/hardening.md` gets the Tier 3 S4–S6 treatment. Until then the line is debt, not a blocker.

### Tier 3 — Big change (SDLC v1.2) — architecture only; scenes go Tier S (user 2026-11-16)
New architecture (>5 files or >2 modules, API contract / data model / dep tree changes), radical feature introductions, or stale/missing research. Stages adapted from SDLC §3 and §17:

```
S0 intake    lead: epic spec in thoughts/ — mood, triggers, non-goals, acceptance IDs (R1…)
S1 research  researcher (codebase map + visual refs) ‖ audio-dsp (signal feasibility, when audio matters)
S2 design    creative-director (scenes) → system-designer → architecture-skeptic
             BLOCKER/HIGH → designer `## Skeptic response` → skeptic recheck
             → LEAD PICKS the variant (STATE.md) → test-architect (matrix)
S3 spike     frontend-coder: bounded prototype on its worktree branch, no merge
             → stills sheet (several angles) + frame time → creative-qa
             → 🧑 USER GATE: ok / not ok          (scenes and visual changes)
S4 plan      planner (steps ↔ test IDs, `## Gate record`) → test-architect coverage
S5 build     frontend-coder, one plan step per dispatch (§ Lead workflow #11)
S6 validate  lead runs gates + harnesses (runner evidence) → tester (AV QA)
S7 accept    🧑 USER GATE: final stills (several angles) → ok / not ok
             → lead updates STATE.md + INDEX.md, commits, tags
```

- **User gates = creative only (user 2026-11-15).** The lead sends the stills sheet (several angles/moments, downscaled) and waits for "ok / not ok" before the full build (S3) and before calling the scene done (S7). Only that scene waits; other lanes keep going. Technical calls stay the lead's (variant pick, skeptic arbitration, levers), per the never-ask rule; only waiving an open BLOCKER/HIGH needs the user.
- **Non-visual big changes** skip the creative-director, S3 (unless the skeptic flags a feasibility risk → a technical spike) and S7.
- **Gate record:** the plan's `## Gate record` — stage · PASS / FAIL / BLOCKED / UNKNOWN · reviewer · evidence path · waiver. **UNKNOWN is never PASS.**
- **Failure routing (SDLC §3A):** design finding → `system-designer`; missing test → `test-architect` / coder; failed test or perf regression → coder; not ok at S3 → `creative-director` / designer; not ok at S7 → a fix step or back to S3; dispute → lead, then the user.
- **Specialised flows:** detector changes SDLC §4 (`audio-dsp` leads; the same dataset before and after); new shader §5; performance §7 (one hypothesis per change, compare distributions — our billed-p95 A/B).

### Security — disabled
User 2026-11-15: removed from the pipeline for now. The definition is parked at `agents/_archive/agents/security-auditor.md`; to re-enable, move it back to `.claude/agents/` and restore its table row.

## Context economy

1. **STATE.md is two-part.** HEAD (≤50 lines) — current state, read every conversation start. TAIL — full history, read only when the task touches a past feature. Rules in 📌 above.
2. **INDEX.md is the artifact catalog.** One line per artifact. Lead reads INDEX to find what to load, never `ls` + read-all.
3. **Section pointers.** When delegating, point at specific sections (`research_x.md §3, §5`), not whole files. Agents refuse pointers without `§N`.
4. **Every artifact opens with `## TL;DR` (3–5 lines) and `## Freshness`.** Research older than 60 days, or older than a refactor in its area, is marked `⚠️ STALE` in INDEX and re-run before use.
5. **One artifact per delegation.** If an agent needs two — split the task.
6. **Token budget per call: 5–25k.** Inputs: the agent's definition (auto-loaded), pointers to this `CLAUDE.md` sections (no paste), one artifact or `§N` sections. Nothing else.
7. **Handoffs (SDLC §10, §15).** Tier-3 dispatch briefs open with the SDLC §15 YAML header (artifact_id, producer/consumer role, source_commit, objective, inputs with §N, outputs, constraints, acceptance_criteria, unknowns, evidence_refs). Raw evidence (stills, logs, harness JSON) stays in `scratchpad/`; agents exchange paths, test IDs, counts and short excerpts, never whole logs or full-size images.

## Constraints (hard)

- ❌ Never start anything in production mode.
- ❌ Never invent codebase or spec facts — only from `researcher`'s output.
- ❌ Never plan an unpicked variant (the pick is logged in STATE.md), and never skip the gates on a scene (Tier S ships on green gates; the user's fix list reopens it).
- ❌ No PASS without runner evidence (SDLC §1.5): a gate or metric counts only from a command actually run — commit SHA, command, exit code. UNKNOWN is never PASS.
- ❌ Never let a coder copy donor code without a plan step authorising it.
- ✅ Any dependency license is allowed, GPL/AGPL included (spec §6, user decision 2026-10-27). Record each dep's license; prefer permissive when options are equal. SDLC §1.8/§8 licence reviews reduce to recording provenance, never a blocker.
- ❌ Never commit API keys or secrets.
- ✅ Linters, type-check, unit tests before calling work done.
- ✅ User may interrupt the pipeline at any stage.

## Lead workflow

1. Receive task statement.
2. Read `STATE.md HEAD` + `INDEX.md`.
3. Classify task tier (1 / 2 / 3). When in doubt → higher.
4. Execute per tier.
5. Tier S: one Fable 5.2 max coder per scene, merge on green gates; the user's fix list goes to the same coder. Tier 3: pick the design variant (lead pick per the never-ask rule) and record it in STATE.md; send the S3 and S7 stills to the user and wait for ok / not ok on that scene.
6. After every sub-agent call: 2–3 line summary to the user + what's next, **and log it in STATE.md HEAD**.
7. On completion: update `STATE.md HEAD` (append summary, demote older to TAIL) and `INDEX.md` (add new artifact line).
8. Independent roles run only inside Tier 3 (or when the user asks); security is disabled.
9. Any web work → `frontend-coder`; any server work → `backend-coder`. Never cross.
10. Session end: STATE.md HEAD states where we stopped and the exact next step.
11. **Dispatch (user, 2026-10-28; updated 2026-10-31, 2026-11-14):** one plan step per coder, with a fresh context; **at most TWO agent tasks at once** (two coders on independent plan lanes, or a coder + a non-coder).
    - Never parallel waves; never a whole checkpoint in one agent.
    - The coder works in its own git worktree (`isolation: "worktree"`, with `web/node_modules` symlinked) and commits on its branch.
    - The lead merges into `master`, runs the gates and commits, then dispatches the next step.
    - Every brief has a time box (~45 min), narrow reads, small tool calls, and one targeted browser check.

## Communication

- Assumptions marked `⚠️ Assumption, needs confirmation`.
- Missing in research → don't guess, send researcher back.
- Plan vs. reality drift → coder marks: `**Changed during implementation:** <what & why>`.
- Structural names (sections, fields, paths, IDs) in English. Content (prose, UI copy) — any language. Artifacts are written in English.
- **Clarity (SDLC §15, ASD-STE100-inspired):** one action per instruction, one term per thing, explicit subject and object, unambiguous conditions, measurable acceptance, short sentences, abbreviations defined, no hidden assumptions. Targets: agent-to-agent artifacts ≥ 90 % of the applicable checks, reports to the user ≥ 80 %. Code identifiers, API names, units and keys stay exact; creative talk and quotes are exempt.

## graphify

Graph over the repo's code (root `.`, which in practice means `web/`; `.gitignore` excludes `donor/`, `node_modules` and `dist`). AST only, no API cost, in `graphify-out/` (git-ignored, built 2026-10-28).
- **Auto-update:** a git post-commit hook (`graphify hook install`) rebuilds it after every commit. The lead commits at each green checkpoint, so the graph follows the code.
- **Manual refresh** (uncommitted state, or after big refactors): `graphify update .` from the repo root. Never `graphify update web/src`: it writes `graphify-out/` inside the source tree.
- For codebase questions, run `graphify query "<question>"` first. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for a single concept. Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review; it also lists import cycles.
- **Sub-agents too:** `researcher`, `architecture-skeptic`, `test-architect`, `audio-dsp`, `frontend-coder` and `tester` run graphify before Read/Grep (baked into their definitions).
