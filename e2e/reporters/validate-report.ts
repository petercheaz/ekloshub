import fs from "node:fs";
import path from "node:path";
import type { FullConfig, FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { evaluateSiteCoverage } from "../site-coverage.js";

const REPORT_DIR = path.join(process.cwd(), "e2e-report");
const SCREENSHOT_DIR = path.join(REPORT_DIR, "screenshots");
const TRACES_DIR = path.join(REPORT_DIR, "traces");

type StepShot = {
  order: number;
  name: string;
  label: string;
  relPath: string;
};

type Row = {
  file: string;
  title: string;
  summary: string;
  status: string;
  durationMs: number;
  error?: string;
  steps: StepShot[];
  traceRel?: string;
};

function plainSummary(test: TestCase) {
  const fromAnnotation = test.annotations.find((a) => a.type === "summary")?.description?.trim();
  if (fromAnnotation) {
    return fromAnnotation;
  }
  return "No summary annotation — add documentedTest(..., \"Plain English description\", ...) in e2e.";
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function formatMs(ms: number) {
  if (ms < 1000) {
    return `${ms} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

function stepLabel(attachmentName: string) {
  const stripped = attachmentName
    .replace(/^step-\d+-/i, "")
    .replace(/^login-\d+-/i, "")
    .replace(/^screenshot$/i, "final-frame");
  return stripped
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function stepSortKey(name: string, fallbackIndex: number) {
  const step = name.match(/^step-(\d+)-/i);
  if (step) {
    return Number(step[1]);
  }
  const login = name.match(/^login-(\d+)-/i);
  if (login) {
    return Number(login[1]);
  }
  if (name === "screenshot") {
    return 9000 + fallbackIndex;
  }
  return 5000 + fallbackIndex;
}

class ValidateReportReporter implements Reporter {
  private startedAt = 0;
  private rows: Row[] = [];
  private config: FullConfig | undefined;

  onBegin(config: FullConfig) {
    this.config = config;
    this.startedAt = Date.now();
    fs.rmSync(REPORT_DIR, { recursive: true, force: true });
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    fs.mkdirSync(TRACES_DIR, { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const steps: StepShot[] = [];
    let traceRel: string | undefined;
    let imageIndex = 0;

    for (const attachment of result.attachments) {
      if (attachment.name === "trace" && attachment.path) {
        const dest = path.join(TRACES_DIR, `${slug(test)}.zip`);
        fs.copyFileSync(attachment.path, dest);
        traceRel = `traces/${path.basename(dest)}`;
        continue;
      }
      if (attachment.contentType?.startsWith("image/") && attachment.path) {
        imageIndex += 1;
        const base = `${slug(test)}-step-${String(imageIndex).padStart(3, "0")}.png`;
        const dest = path.join(SCREENSHOT_DIR, base);
        fs.copyFileSync(attachment.path, dest);
        const name = attachment.name || "screenshot";
        steps.push({
          order: stepSortKey(name, imageIndex),
          name,
          label: stepLabel(name),
          relPath: `screenshots/${base}`,
        });
      }
    }

    steps.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    steps.forEach((s, i) => {
      s.order = i + 1;
    });

    const title = test.titlePath().join(" › ");
    this.rows.push({
      file: path.relative(process.cwd(), test.location.file),
      title,
      summary: plainSummary(test),
      status: result.status,
      durationMs: result.duration,
      error: result.error?.message,
      steps,
      traceRel,
    });
  }

  onEnd(result: FullResult) {
    const finishedAt = Date.now();
    const totalMs = finishedAt - this.startedAt;
    const passed = this.rows.filter((r) => r.status === "passed").length;
    const failed = this.rows.filter((r) => r.status === "failed").length;
    const skipped = this.rows.filter((r) => r.status === "skipped").length;
    const headless = this.config?.projects[0]?.use?.headless ?? true;
    const workers = this.config?.workers ?? 1;

    const meta = {
      startedAt: new Date(this.startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      totalMs,
      passed,
      failed,
      skipped,
      status: result.status,
      headless,
      workers,
    };
    fs.writeFileSync(path.join(REPORT_DIR, "run-meta.json"), JSON.stringify(meta, null, 2));

    const coverage = evaluateSiteCoverage();
    fs.writeFileSync(path.join(REPORT_DIR, "coverage.json"), JSON.stringify(coverage, null, 2));

    const depthBadgeClass = (depth: string) => {
      if (depth === "crud" || depth === "workflow") {
        return "pass";
      }
      if (depth === "smoke") {
        return "skip";
      }
      return "fail";
    };

    const coverageRowsHtml = coverage.rows
      .map((area) => {
        const depth = area.effectiveDepth;
        const rowClass = depth === "none" ? "gap" : depth === "smoke" ? "smoke" : "pass";
        return `<tr class="${rowClass}">
  <td>${escapeHtml(area.name)}</td>
  <td><code>${escapeHtml(area.route)}</code></td>
  <td>${escapeHtml(area.purpose)}</td>
  <td><span class="badge ${depthBadgeClass(depth)}">${escapeHtml(depth)}</span></td>
  <td>${escapeHtml(area.matchedSpecs.join(", ") || "—")}</td>
</tr>`;
      })
      .join("\n");

    const confidenceNote =
      failed === 0
        ? `<p class="confidence ${coverage.byDepth.smoke > 0 || coverage.byDepth.none > 0 ? "warn" : "ok"}">
  <strong>What green means:</strong> All ${this.rows.length} tests passed — regressions in those scenarios should fail the run (fix the app, do not weaken assertions).
  ${coverage.highConfidenceAreas} of ${coverage.totalAreas} areas have <code>workflow</code> or <code>crud</code> depth;
  ${coverage.byDepth.smoke} are <code>smoke</code> only (page load / minimal text);
  ${coverage.byDepth.none} untested. Smoke areas can break without failing until tests are deepened.
</p>`
        : "";

    const coverageSection = `<section class="coverage">
  <h2>Site coverage map</h2>
  ${confidenceNote}
  <p class="muted">Depth is declared in <code>e2e/site-coverage.ts</code> (crud → workflow → smoke → none). Raise depth when you add real assertions — not by deleting failures.</p>
  <p class="muted">${coverage.byDepth.crud} crud · ${coverage.byDepth.workflow} workflow · ${coverage.byDepth.smoke} smoke · ${coverage.byDepth.none} none</p>
  <table class="coverage-table">
    <thead><tr><th>Area</th><th>Route</th><th>Purpose</th><th>Depth</th><th>Spec files</th></tr></thead>
    <tbody>${coverageRowsHtml}</tbody>
  </table>
  ${
    coverage.orphanSpecs.length
      ? `<p class="muted">Spec files not mapped in site-coverage.ts: ${escapeHtml(coverage.orphanSpecs.join(", "))}</p>`
      : ""
  }
</section>`;

    const rowsHtml = this.rows
      .map((row, testIndex) => {
        const statusClass =
          row.status === "passed" ? "pass" : row.status === "failed" ? "fail" : "skip";
        const stepsHtml =
          row.steps.length === 0
            ? "<p class=\"muted\">No step screenshots</p>"
            : `<ol class="step-list">
${row.steps
  .map((step, stepIndex) => {
    const id = `t${testIndex}-s${stepIndex}`;
    return `<li class="step-item">
  <span class="step-num">${step.order}</span>
  <div class="step-body">
    <span class="step-label">${escapeHtml(step.label)}</span>
    <button type="button" class="thumb-btn" data-lightbox-src="${escapeAttr(step.relPath)}" data-lightbox-title="${escapeAttr(row.title + " — " + step.label)}" aria-label="View full screenshot: ${escapeAttr(step.label)}">
      <img class="thumb" src="${escapeAttr(step.relPath)}" alt="" loading="lazy" />
    </button>
  </div>
</li>`;
  })
  .join("\n")}
</ol>`;
        const trace = row.traceRel
          ? `<p class="trace-link"><a href="${row.traceRel}">Download trace zip</a> · <code>npx playwright show-trace ${escapeHtml(row.traceRel)}</code></p>`
          : "";
        const err = row.error
          ? `<pre class="error">${escapeHtml(row.error.slice(0, 4000))}</pre>`
          : "";
        return `<article class="test ${statusClass}">
  <header>
    <span class="badge ${statusClass}">${escapeHtml(row.status)}</span>
    <strong>${escapeHtml(row.title)}</strong>
    <span class="duration">${formatMs(row.durationMs)}</span>
  </header>
  <p class="test-summary">${escapeHtml(row.summary)}</p>
  <p class="file">${escapeHtml(row.file)}</p>
  ${err}
  <h3 class="steps-heading">Steps (${row.steps.length})</h3>
  ${stepsHtml}
  ${trace}
</article>`;
      })
      .join("\n");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>VBS Validate Report</title>
  <style>
    :root { font-family: system-ui, sans-serif; background: #0f1419; color: #e7ecf1; }
    body { max-width: 1100px; margin: 0 auto; padding: 1.5rem; }
    h1 { font-size: 1.35rem; margin: 0 0 0.5rem; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: 0.75rem; margin: 1rem 0 1.5rem; }
    .card { background: #1a2332; border-radius: 8px; padding: 0.75rem 1rem; }
    .card strong { display: block; font-size: 1.25rem; }
    .pass { color: #6ee7a0; }
    .fail { color: #f87171; }
    .skip { color: #fbbf24; }
    .test { background: #1a2332; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; border-left: 4px solid #334155; }
    .test.pass { border-left-color: #22c55e; }
    .test.fail { border-left-color: #ef4444; }
    .test header { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; }
    .badge { font-size: 0.75rem; text-transform: uppercase; padding: 0.15rem 0.45rem; border-radius: 4px; background: #334155; }
    .badge.pass { background: #14532d; }
    .badge.fail { background: #7f1d1d; }
    .duration { margin-left: auto; color: #94a3b8; font-size: 0.9rem; }
    .test-summary { font-size: 0.95rem; line-height: 1.45; color: #cbd5e1; margin: 0.35rem 0 0.25rem; }
    .file { font-size: 0.85rem; color: #94a3b8; margin: 0.25rem 0 0.75rem; }
    .coverage { margin-bottom: 2rem; }
    .coverage h2 { font-size: 1.05rem; margin: 0 0 0.35rem; }
    .coverage-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.75rem; }
    .coverage-table th, .coverage-table td { text-align: left; padding: 0.45rem 0.5rem; border-bottom: 1px solid #243044; vertical-align: top; }
    .coverage-table th { color: #94a3b8; font-weight: 600; }
    .coverage-table tr.gap td { background: rgba(127, 29, 29, 0.15); }
    .coverage-table tr.smoke td { background: rgba(120, 83, 9, 0.12); }
    .confidence { font-size: 0.92rem; line-height: 1.5; padding: 0.75rem 1rem; border-radius: 8px; margin: 0.5rem 0 1rem; }
    .confidence.ok { background: rgba(20, 83, 45, 0.25); border: 1px solid #166534; }
    .confidence.warn { background: rgba(120, 53, 15, 0.2); border: 1px solid #9a3412; }
    .steps-heading { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; margin: 0.75rem 0 0.5rem; font-weight: 600; }
    .step-list { list-style: none; margin: 0; padding: 0; }
    .step-item { display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.5rem 0; border-bottom: 1px solid #243044; }
    .step-item:last-child { border-bottom: none; }
    .step-num { flex: 0 0 1.75rem; height: 1.75rem; line-height: 1.75rem; text-align: center; font-size: 0.75rem; font-weight: 700; background: #334155; border-radius: 999px; color: #cbd5e1; }
    .step-body { flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; min-width: 0; }
    .step-label { font-size: 0.92rem; flex: 1 1 12rem; }
    .thumb-btn { padding: 0; border: 1px solid #475569; border-radius: 6px; background: #0f1419; cursor: zoom-in; line-height: 0; transition: border-color 0.15s; }
    .thumb-btn:hover { border-color: #94a3b8; }
    .thumb { display: block; width: 140px; height: 88px; object-fit: cover; object-position: top; border-radius: 5px; }
    pre.error { background: #0f1419; padding: 0.75rem; overflow: auto; font-size: 0.8rem; border-radius: 6px; color: #fca5a5; width: 100%; }
    .trace-link { font-size: 0.85rem; color: #94a3b8; margin-top: 0.75rem; }
    .muted { color: #64748b; font-size: 0.9rem; }
    code { font-size: 0.85em; }
    .lightbox { display: none; position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.88); align-items: center; justify-content: center; padding: 1rem; }
    .lightbox.open { display: flex; }
    .lightbox-inner { max-width: 96vw; max-height: 96vh; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
    .lightbox-title { color: #e2e8f0; font-size: 0.9rem; text-align: center; max-width: 90vw; }
    .lightbox img { max-width: 96vw; max-height: 88vh; object-fit: contain; border-radius: 8px; box-shadow: 0 8px 40px rgba(0,0,0,0.5); }
    .lightbox-close { position: fixed; top: 1rem; right: 1rem; background: #334155; color: #fff; border: none; border-radius: 8px; padding: 0.5rem 0.85rem; font-size: 0.9rem; cursor: pointer; }
    .lightbox-close:hover { background: #475569; }
  </style>
</head>
<body>
  <h1>VBS /validate report</h1>
  <p class="muted">Generated ${escapeHtml(meta.finishedAt)} · ${headless ? "headless" : "headed"} · ${workers} worker(s) · click a thumbnail for full size</p>
  <div class="summary">
    <div class="card"><span>Total time</span><strong>${formatMs(totalMs)}</strong></div>
    <div class="card pass"><span>Passed</span><strong>${passed}</strong></div>
    <div class="card fail"><span>Failed</span><strong>${failed}</strong></div>
    <div class="card skip"><span>Skipped</span><strong>${skipped}</strong></div>
    <div class="card"><span>Run status</span><strong>${escapeHtml(result.status)}</strong></div>
  </div>
  ${coverageSection}
  <h2 class="tests-heading">Test results (${this.rows.length})</h2>
  ${rowsHtml}
  <div id="lightbox" class="lightbox" role="dialog" aria-modal="true" aria-label="Full screenshot">
    <button type="button" class="lightbox-close" id="lightbox-close">Close</button>
    <div class="lightbox-inner">
      <p class="lightbox-title" id="lightbox-title"></p>
      <img id="lightbox-img" alt="" />
    </div>
  </div>
  <script>
    const box = document.getElementById("lightbox");
    const img = document.getElementById("lightbox-img");
    const title = document.getElementById("lightbox-title");
    const closeBtn = document.getElementById("lightbox-close");
    function openLightbox(src, caption) {
      img.src = src;
      title.textContent = caption || "";
      box.classList.add("open");
      document.body.style.overflow = "hidden";
    }
    function closeLightbox() {
      box.classList.remove("open");
      img.src = "";
      document.body.style.overflow = "";
    }
    document.querySelectorAll(".thumb-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        openLightbox(btn.getAttribute("data-lightbox-src"), btn.getAttribute("data-lightbox-title"));
      });
    });
    closeBtn.addEventListener("click", closeLightbox);
    box.addEventListener("click", (e) => { if (e.target === box) closeLightbox(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLightbox(); });
  </script>
</body>
</html>`;

    fs.writeFileSync(path.join(REPORT_DIR, "index.html"), html);
  }
}

function slug(test: TestCase) {
  const raw = test.titlePath().join("-") + test.id;
  return raw.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 120);
}

export default ValidateReportReporter;
