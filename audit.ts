/**
 * Nightly LIVE bridge audit. For every built bridge it runs the shared conformance evaluator
 * (`@comical/testkit`) against the real backend AND measures thumbnail sizes, then prints a status
 * table. With `--write` it rewrites the README's BRIDGE-STATUS block (the summary) AND regenerates
 * `AUDIT.md` (the per-check detail). Exits non-zero ONLY if a NON-flaky bridge has a real
 * (non-transient) failure — flaky/blocked bridges show ⚠, never fail the run.
 *
 *   bun run audit            # print the summary table
 *   bun run audit --write    # + update README.md and AUDIT.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadBridge } from "@comical/core";
import { createBunHost } from "@comical/host-bun";
import { defaultAssetFetcher, evaluateBridge, type EvaluationReport } from "@comical/testkit";
import { AUDIT, type BridgeAuditConfig } from "./audit.config.ts";

const ROOT = import.meta.dir;
const README = join(ROOT, "README.md");
const DETAILS = join(ROOT, "AUDIT.md");
const START = "<!-- BRIDGE-STATUS:START -->";
const END = "<!-- BRIDGE-STATUS:END -->";
const STAMP = (): string => `_Updated ${new Date().toISOString().slice(0, 10)} by the nightly live audit ([\`audit.ts\`](audit.ts))._`;

interface Row {
  id: string;
  icon: "✓" | "⚠" | "✗";
  pass: number;
  warn: number;
  fail: number;
  skip: number; // inconclusive/not-applicable probes (auth-gated, unobservable sort/filter)
  caps: string; // "N/M"
  cover: string; // "80 KB (360×540)"
  note: string;
  hardFail: boolean; // a real fail on a NON-flaky bridge → the whole run fails
}

/** A row plus the raw report (for the detailed doc). `loadError` set when the bundle wouldn't load. */
interface Entry {
  row: Row;
  report?: EvaluationReport;
  loadError?: string;
}

const kb = (bytes: number): string => `${Math.round(bytes / 1024)} KB`;

const coverCell = (report: EvaluationReport): string => {
  const m = report.metrics;
  if (!m || m.sampled === 0) return "—";
  const dim = m.dimensions ? ` (${m.dimensions.avgWidth}×${m.dimensions.avgHeight})` : "";
  return `${kb(m.bytes.avg)}${dim}`;
};

async function auditOne(id: string, cfg: BridgeAuditConfig): Promise<Entry> {
  let report: EvaluationReport;
  try {
    const code = readFileSync(join(ROOT, ".build", id, "dist", "bridge.js"), "utf8");
    const capabilities = createBunHost({ bridgeId: id, settings: cfg.settings ?? {} });
    // No `expectedId`: the built bundle carries the publisher-namespaced id (e.g. "pos5drow.atsumaru"),
    // and the audit keys off the `.build/<dir>` name, so we load whatever id the bundle declares.
    const bridge = loadBridge({ code, capabilities });
    report = await evaluateBridge(bridge, { searchQuery: cfg.searchQuery ?? "", fetchAsset: defaultAssetFetcher });
  } catch (e) {
    // A load/setup failure (missing build, bad bundle) — real unless the bridge is tagged flaky.
    const message = e instanceof Error ? e.message : String(e);
    return {
      row: {
        id,
        icon: cfg.flaky ? "⚠" : "✗",
        pass: 0,
        warn: 0,
        fail: cfg.flaky ? 0 : 1,
        skip: 0,
        caps: "0/0",
        cover: "—",
        note: `load failed: ${message}`,
        hardFail: !cfg.flaky,
      },
      loadError: message,
    };
  }

  const { pass, warn, fail, skip } = report.summary;
  const realFailUntolerated = fail > 0 && !cfg.flaky;
  const icon: Row["icon"] = realFailUntolerated ? "✗" : fail > 0 || warn > 0 ? "⚠" : "✓";
  return {
    row: {
      id,
      icon,
      pass,
      warn,
      fail,
      skip,
      caps: `${report.summary.capabilitiesExercised.length}/${report.summary.capabilitiesDeclared.length}`,
      cover: coverCell(report),
      note: cfg.flaky && fail > 0 ? `flaky (tolerated): ${cfg.flaky}` : (cfg.flaky ?? ""),
      hardFail: realFailUntolerated,
    },
    report,
  };
}

/** Render the `(P✓ W⚠ F✗ S⊘)` tally, dropping the ⊘ term when nothing was skipped. */
const tally = (r: Pick<Row, "pass" | "warn" | "fail" | "skip">): string =>
  `${r.pass}✓ ${r.warn}⚠ ${r.fail}✗${r.skip ? ` ${r.skip}⊘` : ""}`;

/** README summary block (inside the BRIDGE-STATUS markers). */
function renderTable(rows: Row[]): string {
  const head = "| Bridge | Status | Capabilities | Avg cover | Notes |\n|---|---|---|---|---|";
  const body = rows
    .map((r) => `| \`${r.id}\` | ${r.icon} (${tally(r)}) | ${r.caps} | ${r.cover} | ${r.note || "—"} |`)
    .join("\n");
  return `${head}\n${body}\n\n${STAMP()}`;
}

const SEV_ICON = { pass: "✓", warn: "⚠", fail: "✗", skip: "⊘" } as const;
const SEV_RANK = { fail: 0, warn: 1, skip: 2, pass: 3 } as const;
const cell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();

/** Per-bridge metrics detail line (byte spread + dimensions + aspect). */
function metricsLine(report: EvaluationReport): string {
  const m = report.metrics;
  if (!m) return "";
  const parts = [
    `sampled ${m.sampled}`,
    `failed ${m.failed}`,
    `bytes min ${kb(m.bytes.min)} / avg ${kb(m.bytes.avg)} / median ${kb(m.bytes.median)} / max ${kb(m.bytes.max)}`,
  ];
  if (m.dimensions) parts.push(`dims avg ${m.dimensions.avgWidth}×${m.dimensions.avgHeight} (max ${m.dimensions.maxWidth}×${m.dimensions.maxHeight})`);
  if (m.aspect) parts.push(`aspect avg ${m.aspect.avg.toFixed(2)}`);
  return parts.join(" · ");
}

/** The standalone AUDIT.md — every check for every bridge, failures/warnings first. */
function renderDetails(entries: Entry[]): string {
  const lines: string[] = [
    "# Bridge audit — detailed results",
    "",
    "Per-check results from the nightly live audit ([`audit.ts`](audit.ts)) — every conformance probe run",
    "against the real backend. ✓ pass · ⚠ warn · ✗ fail · ⊘ skipped (auth-gated with no credentials, or an",
    "inconclusive sort/filter probe — never a defect). Warnings never fail the run; a tolerated",
    "flaky/blocked bridge (see [`audit.config.ts`](audit.config.ts)) shows ⚠ even for a hard failure.",
    "See [`README.md`](README.md#status) for the summary.",
    "",
  ];
  for (const { row, report, loadError } of entries) {
    lines.push(`## \`${row.id}\` — ${row.icon} (${tally(row)})`, "");
    if (loadError) {
      lines.push(`**Bridge failed to load:** ${cell(loadError)}`, "");
      continue;
    }
    if (!report) continue;
    const meta = [`**${row.caps} capabilities**`, `cover ${row.cover}`];
    const ml = metricsLine(report);
    if (ml) meta.push(ml);
    lines.push(meta.join(" · "), "");
    if (row.note) lines.push(`> ${cell(row.note)}`, "");
    const sorted = [...report.results].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
    lines.push("| Result | Check | Capability | Detail |", "|:--:|---|---|---|");
    for (const c of sorted) {
      lines.push(`| ${SEV_ICON[c.severity]} | \`${cell(c.id)}\` | ${c.capability} | ${cell(c.message)} |`);
    }
    lines.push("");
  }
  lines.push(STAMP());
  return `${lines.join("\n")}\n`;
}

function writeReadme(md: string): void {
  const src = readFileSync(README, "utf8");
  const s = src.indexOf(START);
  const e = src.indexOf(END);
  if (s < 0 || e < 0) throw new Error(`README is missing ${START} / ${END} markers`);
  writeFileSync(README, `${src.slice(0, s + START.length)}\n${md}\n${src.slice(e)}`);
}

const entries: Entry[] = [];
for (const [id, cfg] of Object.entries(AUDIT)) {
  process.stderr.write(`auditing ${id}…\n`);
  entries.push(await auditOne(id, cfg));
}

const rows = entries.map((en) => en.row);
const md = renderTable(rows);
console.log(md);

if (process.argv.includes("--write")) {
  writeReadme(md);
  writeFileSync(DETAILS, renderDetails(entries));
  process.stderr.write("README BRIDGE-STATUS block + AUDIT.md updated.\n");
}

const hard = rows.filter((r) => r.hardFail);
if (hard.length > 0) {
  process.stderr.write(`\nHARD FAIL (untolerated): ${hard.map((r) => r.id).join(", ")}\n`);
  process.exit(1);
}
