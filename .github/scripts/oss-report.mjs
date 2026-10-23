#!/usr/bin/env node
// Builds the OSS compliance report (CSV + GitHub job summary) for one project.
//
// License data:  npm   -> `pnpm licenses list --json` (all deps) + `--prod` (runtime deps)
//                maven -> CycloneDX BOM with test scope + runtime-only BOM
// Vulnerability data: osv-scanner JSON output (any ecosystem)
//
// Usage:
//   node oss-report.mjs --project ts-app --ecosystem npm \
//     --licenses licenses-all.json --licenses-runtime licenses-prod.json \
//     --osv osv.json --policy .github/oss-policy.json --out oss-report.csv
//   node oss-report.mjs --project java-app --ecosystem maven \
//     --bom bom-all.json --bom-runtime bom.json ...
//
// Exit code 1 when at least one package has policy "Fail".

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    project: { type: "string" },
    ecosystem: { type: "string" },
    licenses: { type: "string" },
    "licenses-runtime": { type: "string" },
    bom: { type: "string" },
    "bom-runtime": { type: "string" },
    osv: { type: "string" },
    policy: { type: "string", default: ".github/oss-policy.json" },
    out: { type: "string", default: "oss-report.csv" },
  },
});

const readJson = (path) => (path && existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null);
const policy = readJson(args.policy);
if (!policy) throw new Error(`Policy file not found: ${args.policy}`);

// ---------------------------------------------------------------------------
// 1. Collect packages: { name, version, scope, license, homepage }
// ---------------------------------------------------------------------------

function fromPnpm(allPath, runtimePath) {
  const flatten = (json) =>
    Object.values(json ?? {})
      .flat()
      .flatMap((pkg) =>
        (pkg.versions ?? [pkg.version]).map((version) => ({
          name: pkg.name,
          version,
          license: pkg.license,
          homepage: pkg.homepage ?? "",
        })),
      );
  const runtime = new Set(flatten(readJson(runtimePath)).map((p) => `${p.name}@${p.version}`));
  return flatten(readJson(allPath)).map((p) => ({
    ...p,
    scope: runtime.has(`${p.name}@${p.version}`) ? "runtime" : "development",
  }));
}

function fromCycloneDx(allPath, runtimePath) {
  const components = (json) => json?.components ?? [];
  const key = (c) => `${c.group}:${c.name}@${c.version}`;
  const runtime = new Set(components(readJson(runtimePath)).map(key));
  return components(readJson(allPath)).map((c) => ({
    name: c.group ? `${c.group}:${c.name}` : c.name,
    version: c.version,
    license:
      (c.licenses ?? [])
        .map((l) => l.expression ?? l.license?.id ?? l.license?.name)
        .filter(Boolean)
        .join(" OR ") || "UNKNOWN",
    homepage: c.purl ?? "",
    scope: runtime.has(key(c)) ? "runtime" : "development",
  }));
}

const packages =
  args.ecosystem === "maven"
    ? fromCycloneDx(args.bom, args["bom-runtime"])
    : fromPnpm(args.licenses, args["licenses-runtime"]);

// ---------------------------------------------------------------------------
// 2. Vulnerabilities from osv-scanner, keyed by name@version
// ---------------------------------------------------------------------------

const SEVERITY_ORDER = ["NONE", "LOW", "MODERATE", "HIGH", "CRITICAL"];
const severityFromScore = (score) => {
  const s = Number.parseFloat(score);
  if (Number.isNaN(s)) return "UNKNOWN";
  if (s >= 9) return "CRITICAL";
  if (s >= 7) return "HIGH";
  if (s >= 4) return "MODERATE";
  return s > 0 ? "LOW" : "NONE";
};

const vulnsByPackage = new Map();
for (const result of readJson(args.osv)?.results ?? []) {
  for (const { package: pkg, groups = [] } of result.packages ?? []) {
    const ids = groups.map((g) => g.aliases?.find((a) => a.startsWith("CVE-")) ?? g.ids[0]);
    const worst = groups
      .map((g) => severityFromScore(g.max_severity))
      .sort((a, b) => SEVERITY_ORDER.indexOf(b) - SEVERITY_ORDER.indexOf(a))[0];
    vulnsByPackage.set(`${pkg.name}@${pkg.version}`, { ids, severity: worst ?? "NONE" });
  }
}

// ---------------------------------------------------------------------------
// 3. Classify licenses and apply the policy
// ---------------------------------------------------------------------------

const LICENSE_ALIASES = [
  [/apache.*2/i, "Apache-2.0"],
  [/^mit( license)?$/i, "MIT"],
  [/eclipse public license.*2/i, "EPL-2.0"],
  [/eclipse public license.*1/i, "EPL-1.0"],
  [/mozilla public license.*2/i, "MPL-2.0"],
  [/bsd.*3/i, "BSD-3-Clause"],
  [/bsd.*2/i, "BSD-2-Clause"],
  [/lesser general public license.*2\.1/i, "LGPL-2.1"],
  [/lesser general public license.*3/i, "LGPL-3.0"],
  [/affero/i, "AGPL-3.0"],
  [/general public license.*3/i, "GPL-3.0"],
  [/general public license.*2/i, "GPL-2.0"],
];

const normalize = (id) => {
  const trimmed = id.trim().replace(/^\(|\)$/g, "");
  const alias = LICENSE_ALIASES.find(([re]) => re.test(trimmed));
  if (alias && !/^[A-Za-z0-9.-]+$/.test(trimmed)) return alias[1];
  return trimmed.replace(/(-only|-or-later|\+)$/i, "");
};

const RANK = { Allowed: 0, Restrictive: 1, Unknown: 1, Denied: 2 };
const categorize = (single) => {
  const id = normalize(single);
  if (policy.licenses.allowed.includes(id)) return "Allowed";
  if (policy.licenses.restrictive.includes(id)) return "Restrictive";
  if (policy.licenses.denied.includes(id)) return "Denied";
  return "Unknown";
};

// SPDX expressions: "A OR B" -> the most permissive option, "A AND B" -> the strictest.
const categorizeExpression = (expression = "UNKNOWN") => {
  const pick = (list, best) =>
    list.sort((a, b) => (best ? RANK[a] - RANK[b] : RANK[b] - RANK[a]))[0];
  const options = expression.split(/\s+OR\s+/i).map((option) =>
    pick(option.split(/\s+AND\s+/i).map(categorize), false),
  );
  return pick(options, true);
};

const rows = packages.map((pkg) => {
  const licenseCategory = categorizeExpression(pkg.license);
  const vuln = vulnsByPackage.get(`${pkg.name}@${pkg.version}`) ?? { ids: [], severity: "NONE" };
  const reasons = [];
  let policyResult = "Passed";
  const raise = (level, reason) => {
    reasons.push(reason);
    if (level === "Fail" || (level === "Restrictive" && policyResult === "Passed")) {
      policyResult = level;
    }
  };

  const relaxed = policy.licenses.relaxDevelopmentScope && pkg.scope === "development";
  if (licenseCategory === "Denied") {
    raise(relaxed ? "Restrictive" : "Fail", `Denied license (${pkg.license})${relaxed ? " in dev-only dependency" : ""}`);
  } else if (licenseCategory === "Restrictive") {
    raise("Restrictive", `Copyleft license (${pkg.license}) - review obligations`);
  } else if (licenseCategory === "Unknown") {
    raise(policy.licenses.unknown, `License not in policy (${pkg.license})`);
  }

  if (policy.vulnerabilities.fail.includes(vuln.severity)) {
    raise("Fail", `${vuln.severity} vulnerability`);
  } else if (policy.vulnerabilities.restrictive.includes(vuln.severity)) {
    raise("Restrictive", `${vuln.severity} vulnerability`);
  }

  return {
    Project: args.project,
    Ecosystem: args.ecosystem,
    Package: pkg.name,
    Version: pkg.version,
    Scope: pkg.scope,
    License: pkg.license,
    "License Category": licenseCategory,
    Vulnerabilities: vuln.ids.join(" "),
    "Max Severity": vuln.severity,
    Policy: policyResult,
    Reason: reasons.join("; "),
    Source: pkg.homepage,
  };
});

const ORDER = { Fail: 0, Restrictive: 1, Passed: 2 };
rows.sort((a, b) => ORDER[a.Policy] - ORDER[b.Policy] || a.Package.localeCompare(b.Package));

// ---------------------------------------------------------------------------
// 4. Write CSV and job summary
// ---------------------------------------------------------------------------

const csvCell = (value) => {
  const text = String(value ?? "");
  // A leading = + - would be evaluated as a formula by Excel (CSV injection).
  // "@" is allowed because scoped npm packages (@types/node) start with it.
  const safe = /^[=+\-\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};
const headers = Object.keys(rows[0] ?? { Project: "" });
const csv = [headers, ...rows.map((r) => headers.map((h) => r[h]))]
  .map((line) => line.map(csvCell).join(","))
  .join("\n");
writeFileSync(args.out, `${csv}\n`);

const count = (p) => rows.filter((r) => r.Policy === p).length;
const totals = { Passed: count("Passed"), Restrictive: count("Restrictive"), Fail: count("Fail") };
// One string argument: package data never reaches console.log as a format string
console.log(`${args.project}: ${rows.length} packages ${JSON.stringify(totals)} -> ${args.out}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const icon = { Passed: "✅", Restrictive: "⚠️", Fail: "❌" };
  const flagged = rows.filter((r) => r.Policy !== "Passed");
  const summary = [
    `## OSS compliance: ${args.project}`,
    "",
    `| ✅ Passed | ⚠️ Restrictive | ❌ Fail | Total |`,
    `|---|---|---|---|`,
    `| ${totals.Passed} | ${totals.Restrictive} | ${totals.Fail} | ${rows.length} |`,
    "",
    flagged.length ? "| Policy | Package | Version | Scope | License | Reason |" : "All packages passed.",
    flagged.length ? "|---|---|---|---|---|---|" : "",
    ...flagged.map(
      (r) =>
        `| ${icon[r.Policy]} ${r.Policy} | ${r.Package} | ${r.Version} | ${r.Scope} | ${r.License} | ${r.Reason} |`,
    ),
    "",
    "Download the full CSV from the **Artifacts** section of this run.",
    "",
  ];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join("\n"));
}

process.exitCode = totals.Fail > 0 ? 1 : 0;
