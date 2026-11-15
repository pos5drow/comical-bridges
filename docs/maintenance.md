# Maintaining many bridges: automation plan

Scrapers break constantly. Keiyoushi's 2026 issue tracker is mostly "source X broke": new domains,
redesigns, 403s, new anti-bot measures. Comix alone broke about 15 times. Going from 6 bridges to
about 45 only works if breakage is **detected automatically, turned into a precise report, and
mostly fixed by an LLM**, with a human reviewing the PR. This doc covers what exists today, what
stops it working at scale, and the pipeline to build. It applies to both this repo and
`comical-bridges-nsfw`.

## What exists today

- **Nightly live audit** (`audit.yml` → `audit.ts` → `@comical/testkit` `runBridgeAudit`): it builds
  every bridge, runs the conformance evaluator against the real site (lists, search,
  filters/sort effects, details, chapters, pages, cover sizes), and rewrites `README.md`'s status
  block and `AUDIT.md`. A hard failure on a non-flaky bridge fails the job.
- **CI publish** on `src/**` pushes, signed, with Bun pinned and versions immutable.
- **testkit cassettes** (`cassette.ts`): record/replay at the `network.request` boundary, with
  secrets redacted. These would make good offline fixtures, but bridges don't use them yet.

## What stops it working at scale

1. **The audit runs blind.** GitHub's datacenter IPs get Cloudflare-walled. Today *every* SFW
   bridge shows ⚠ "challenged" or 403 in `AUDIT.md`, so the nightly can't tell a broken bridge from
   a blocked runner. Most roadmap sites sit behind Cloudflare, so this gets worse with each bridge
   added.
2. **The output is prose for humans.** Markdown tables only: no machine-readable result, no
   history, no "this changed since yesterday", nothing an agent can be pointed at.
3. **No fixtures.** With no recorded responses, a fix can't be checked offline, and there's no
   evidence to diff ("this selector matched yesterday's HTML and not today's").
4. **No early warning.** Keiyoushi and Aidoku often notice and fix a site change within a day, and
   their diff is the best hint available for a fix. Nobody watches it.

## The pipeline

```
 detect ─────────► triage ─────────► report ─────────► repair ─────────► review ─► publish
 nightly audit     classify +        one GitHub issue  agent on the      human     existing
 (home IP)         debounce vs       per bridge, with  self-hosted       merges    publish.yml
 + upstream watch  last run          the evidence      runner opens PR   the PR
```

### 1. Detect

- **Run the audit from a residential IP.** Register the home Linux box as a **self-hosted GitHub
  Actions runner** (label `residential`) and point `audit.yml` at it. This is the single most
  important step. The cheaper fallback is a local cron running the same script.
- **Write `audit.json`** next to `AUDIT.md`: the `AuditRow`/`AuditEntry` data `runBridgeAudit`
  already returns, plus per check the failing URL, HTTP status and final URL. Commit it so
  history is just `git log`.
- **Add `bun run audit --only <id>`** so one bridge can be re-checked by humans, CI and agents.
- **Check that the read path fetches one real page image** and confirms it decodes as an image, not
  an HTML error page. Add that check to the evaluator if it doesn't already do it.
- **Upstream watch** (nightly, plain GitHub API). For each bridge's upstream refs (manifest below),
  list Keiyoushi/Aidoku commits touching those paths since the last run. A changed `baseUrl` in
  their build file means a domain move.

### 2. Triage

Compare against the previous `audit.json` and classify each regression:

| Class | Evidence | Action |
|---|---|---|
| `blocked` | challenge header, 403/429/503, captcha page | note it, no issue (unless it happens from the home IP too) |
| `moved` | redirect to another host; upstream `baseUrl` changed | issue, usually a one-line mirror fix |
| `broken` | 200 response but empty parse, schema-invalid output, throw while parsing | issue |
| `gone` | site down for N days, or DNS failure | issue, and consider `dropped` in the roadmap |

**Debounce:** open an issue only after **2 consecutive failing runs**, so a single flaky run never
pages anyone.

### 3. Report

A sync job keeps **exactly one open issue per broken bridge** (labels `bridge:<id>`, `broken`, and
the class). It updates the issue rather than duplicating it, and auto-closes it when the bridge
goes green. The body is generated and agent-ready:

- failing checks, error text, failing URL, status, final URL
- the recorded response (cassette) for the failing call, as an artifact
- the bridge's manifest entry (engine, upstream refs, known quirks)
- links to upstream commits on the same site since it last passed

### 4. Repair (LLM)

**Recommended: `anthropics/claude-code-action` running on the self-hosted runner**, so the agent can
actually reach the site to reproduce the failure and verify its fix. Trigger it by adding an
`auto-fix` label to a bridge issue. Start manual and switch to automatic for the `moved` and
`broken` classes once trust is earned. The alternative is a local script driving headless
`claude -p` in a git worktree: the same idea without the GitHub trail.

The agent's job, written into a `fix-bridge` skill:

1. Reproduce with `bun run audit --only <id>`, and record a fresh cassette.
2. Diff the old fixture against the live response, and read the upstream diff if there is one.
3. Fix `src/<bridge>.ts`, or the engine, in which case every dependent bridge must still pass.
4. Add or refresh the cassette fixture plus a regression test (`test/<id>-*.test.ts`).
5. Bump versions (see `shared-engines.md`: an engine change bumps every dependent bridge).
6. Run `bun test` and the live single-bridge audit, then open a PR as pos5drow, linking the issue.

### 5. Guardrails

- **The agent only opens PRs; it never pushes to main.** Protect main: require the unit tests, the
  live audit of the changed bridges, and a version-bump check.
- **The signing key stays out of reach.** It exists only in `publish.yml`, behind a protected
  environment. The fix workflow never gets that secret.
- **Scope check:** a PR that touches anything outside `src/<bridge or engine>`, `test/`, fixtures,
  bridge versions and the roadmap needs a closer human look.
- Cap turns and budget per run, and skip the agent entirely for the `blocked` class.

### 6. Repo affordances that make LLM work reliable

These also pay off for *building* the roadmap, not just for fixing:

- **`CLAUDE.md` in each bridges repo** covering conventions, the engine/core layout, how to run one
  audit, how to record fixtures, version rules, and the publish rules (as pos5drow, CI-only
  publish).
- **`sources.json` manifest** with one entry per bridge: engine, upstream refs (kei path, aidoku id),
  mirrors, audit query, known quirks, and the class of past breakages. It feeds the audit config,
  the issue body, the upstream watcher and the agent.
- **Skills:** `new-bridge` ports a site using the upstream implementation as a reference: scaffold
  from an engine or from scratch, record fixtures, write tests, add the roadmap row. `fix-bridge` is
  described above.
- **Fixtures in `test/fixtures/<id>/`.** Cassettes for each read-path call, refreshed whenever a fix
  lands.

## Rollout order

1. Get detection right: `audit.json`, `--only`, and the self-hosted runner. Nothing else is worth
   building until the audit can see.
2. Add the `sources.json` manifest and the issue sync job (triage, debounce, auto-close).
3. Add `CLAUDE.md`, the `new-bridge`/`fix-bridge` skills, and fixture recording. Use them to start
   building the roadmap.
4. Add the upstream watcher.
5. Add the auto-fix action, label-triggered at first.
6. Add the version-bump CI check (needed as soon as the first engine lands).

## Decisions needed

1. A self-hosted runner on the home box (residential IP)? The alternative is a local cron.
2. Auto-fix through `claude-code-action` (needs an API key or OAuth token as a repo secret), or a
   local headless `claude -p` script?
3. How autonomous should it be: label-triggered only, or automatic for the `moved` and `broken`
   classes?
