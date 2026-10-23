# GitHub Actions demo: CI, security, OSS compliance and deploy

Companion repository for the **Knowledge Sharing: GitHub Actions** session.
Two small projects implement the same invoice calculator so the pipelines can be compared side by side.

| Project | Stack | Path |
|---|---|---|
| `invoice-calculator` | TypeScript, Node.js 24, pnpm 11 | [`ts-app/`](ts-app) |
| `invoice-service` | Java 21, Maven (wrapper included) | [`java-app/`](java-app) |

## What runs where

| Check | TypeScript | Java | Workflow |
|---|---|---|---|
| Format check | Prettier | Spotless (google-java-format) | `ts-ci.yml` / `java-ci.yml` |
| Lint | ESLint + typescript-eslint (strict, type-aware) | Checkstyle (Google style) + SpotBugs | `ts-ci.yml` / `java-ci.yml` |
| Typecheck | `tsc --noEmit` | `javac -Xlint:all -Werror` | `ts-ci.yml` / `java-ci.yml` |
| Unit test + coverage | Vitest + V8 coverage (80% gate) | JUnit + AssertJ + JaCoCo (80% gate) | `ts-ci.yml` / `java-ci.yml` |
| End-to-end test | Playwright (headless Chromium) against the web UI + API | Playwright for Java + JUnit, same page and tests | `ts-ci.yml` / `java-ci.yml` |
| Dependency audit | `pnpm audit --audit-level high` | OSV-Scanner on the CycloneDX SBOM | `ts-ci.yml` / `java-ci.yml` |
| Code scanning (SAST) | CodeQL `javascript-typescript` | CodeQL `java-kotlin` | `security.yml` |
| Workflow security | zizmor + CodeQL `actions` | (same) | `security.yml` |
| PR dependency gate | OSS Compliance runs on every PR that changes dependencies | (same) | `oss-compliance.yml` |
| Dependency updates | Dependabot `npm` | Dependabot `maven` | `dependabot.yml` |
| OSS license + vulnerability report (CSV) | `pnpm licenses` + OSV-Scanner | CycloneDX + OSV-Scanner | `oss-compliance.yml` |
| Deploy | Automatic GitHub Release `ts-app-vX.Y.Z` | Automatic GitHub Release `java-app-vX.Y.Z` | `ts-deploy.yml` / `java-deploy.yml` |

## Web front end and end-to-end tests

Both projects serve the same small web page for the calculator plus a `POST /api/invoice` endpoint, so
Playwright can test them in a real browser. The tests fill in the form, check the totals and the validation
error, and call the API directly.

| | ts-app | java-app |
|---|---|---|
| Server | [`src/server.ts`](ts-app/src/server.ts) (`node:http`) | [`InvoiceServer.java`](java-app/src/main/java/com/example/invoice/InvoiceServer.java) (JDK `HttpServer`) |
| Page | [`public/index.html`](ts-app/public/index.html) | [`src/main/resources/public/index.html`](java-app/src/main/resources/public/index.html) (same file) |
| Run it | `pnpm dev` (reloads on save) → http://localhost:3000 | `./mvnw compile exec:java` → http://localhost:8080 |
| Tests | [`e2e/invoice.spec.ts`](ts-app/e2e/invoice.spec.ts) | [`src/e2e/java/…/InvoicePageE2eTest.java`](java-app/src/e2e/java/com/example/invoice/InvoicePageE2eTest.java) |
| Non-interactive (CI) | `pnpm e2e` | `./mvnw -Pe2e test` |
| Interactive | `pnpm e2e:ui`: UI mode, watch and time-travel | `./mvnw -Pe2e,e2e-ui test`: headed browser + Playwright Inspector |
| Starts the app | `webServer` in [`playwright.config.ts`](ts-app/playwright.config.ts) | `@BeforeAll` starts `InvoiceServer` on a free port |
| CI artifact | `ts-app-e2e-report`: HTML report, traces on retry | `java-app-e2e-report`: JUnit XML, a trace per test |

The Java tests live in their own source folder behind the `e2e` Maven profile: the Playwright driver is a ~200 MB
download that the other Java jobs do not need. Replay any trace with `pnpm exec playwright show-trace <trace.zip>`
(or https://trace.playwright.dev).

## OSS compliance report

`oss-compliance.yml` runs on dependency changes, daily, and on demand. It produces three downloadable
artifacts: `oss-report-ts-app`, `oss-report-java-app` and the merged `oss-report-all`.

CSV columns: `Project, Ecosystem, Package, Version, Scope, License, License Category, Vulnerabilities,
Max Severity, Policy, Reason, Source`.

The **Policy** column is decided by [`.github/oss-policy.json`](.github/oss-policy.json):

| Policy | When |
|---|---|
| **Passed** | Allowed license and no vulnerability at a restricted severity |
| **Restrictive** | Copyleft license (LGPL, MPL, EPL...), unknown license, moderate vulnerability, or a denied license in a dev-only dependency. Needs review, does not fail the build |
| **Fail** | Denied license (GPL, AGPL, SSPL...) in a runtime dependency, or a high/critical vulnerability. Fails the job |

The logic lives in [`.github/scripts/oss-report.mjs`](.github/scripts/oss-report.mjs) (plain Node.js, no dependencies).

## Public repository: everything is free

This demo is meant for a **public repository**, where every tool it uses is free on any plan: CodeQL and the
Security tab, Dependabot, unlimited Actions minutes on GitHub-hosted runners, and branch protection.

| Tool | Public repository | Private repository |
|---|---|---|
| CodeQL + Security tab | Free | Needs GitHub Code Security (Advanced Security). The CodeQL license also only allows open source code without it |
| zizmor, OSV-Scanner, Playwright, Dependabot | Free | Free |
| Actions minutes (GitHub-hosted) | Unlimited | 2,000 a month on GitHub Free |
| Branch protection / rulesets | Free | GitHub Pro or higher |
| Environments with required reviewers | Free | GitHub Enterprise |

A few choices keep the workflows portable to a private repository later:

* **zizmor** runs with `advanced-security: false`: findings are printed as annotations and fail the job,
  instead of being uploaded to the Security tab.
* **No dependency-review-action**: `oss-compliance.yml` runs on every PR that touches `package.json`,
  `pnpm-lock.yaml` or `pom.xml` and fails on a high/critical CVE or a denied license.
* **No `environment: production`**: the release job only runs from `main` (`if: github.ref == 'refs/heads/main'`).
  In a public repository you can add the environment back to require a reviewer before each release.

## Deploy = automatic GitHub Release

* **Automatic**: bump `version` in `ts-app/package.json` (or `<version>` in `java-app/pom.xml`) and merge to `main`.
  The deploy workflow sees that no `ts-app-v<version>` tag exists, runs the full CI through `workflow_call`,
  then the **release** job builds the package and creates the GitHub Release. Changing `package.json` without
  changing the version releases nothing.
* **Manual**: *Actions → TS Deploy / Java Deploy → Run workflow*. Re-releases the current version (refreshes the attached files).

Each release gets:

| | ts-app | java-app |
|---|---|---|
| Tag | `ts-app-v1.0.0` | `java-app-v1.0.0` |
| Attached files | `invoice-calculator-1.0.0.tgz` | `invoice-service-1.0.0.jar` + CycloneDX SBOM |
| Release notes | Generated from the PRs merged since the previous `ts-app-v*` release | Same, since the previous `java-app-v*` release |

No workflow artifact is involved: artifacts expire and sit behind a GitHub login, while a Release is tagged,
permanent and downloadable. The release job builds without the dependency cache so a poisoned cache can never
end up in a released file. Replace or extend the "Create GitHub Release" step for your real target
(npm/Maven registry, container registry, cloud, server).

## One-time repository setup

1. Push this folder as a new **public** GitHub repository (CodeQL in a private one needs Code Security).
2. *Settings → Actions → General → Workflow permissions*: keep the default **Read repository contents**;
   the release jobs ask for `contents: write` themselves.
3. *Settings → Code security*: enable **Dependency graph**, **Dependabot alerts** and **Dependabot security updates** (all free).
4. *Settings → Rules → Rulesets*: protect `main` and require the CI, Security and OSS Compliance checks.

## Run the checks locally

```bash
# TypeScript
cd ts-app
pnpm install
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm audit --audit-level high

# TypeScript web front end and end-to-end tests (Playwright)
pnpm dev         # http://localhost:3000, restarts on every save
pnpm e2e:install # once: downloads Chromium
pnpm e2e         # non-interactive: headless, same as CI, HTML report in playwright-report/
pnpm e2e:ui      # interactive: Playwright UI mode (watch, step through, time-travel traces)
pnpm exec playwright show-report # open the last HTML report

# Java (needs JDK 21+)
cd java-app
./mvnw spotless:check                          # format (./mvnw spotless:apply to fix)
./mvnw compile checkstyle:check spotbugs:check # lint
./mvnw verify                                  # typecheck + tests + coverage gate

# Java web front end and end-to-end tests (Playwright for Java)
./mvnw compile exec:java                       # http://localhost:8080
./mvnw -Pe2e test-compile exec:java -Dexec.mainClass=com.microsoft.playwright.CLI \
  -Dexec.classpathScope=test "-Dexec.args=install chromium"   # once: downloads Chromium
./mvnw -Pe2e test                              # non-interactive: headless, same as CI
./mvnw -Pe2e,e2e-ui test                       # interactive: Playwright Inspector, step through each action

# Workflow security (Linux, macOS or WSL); CodeQL runs in CI only
pipx run zizmor .
```

## Notes

* Every third-party action is pinned to a full commit SHA with the version in a comment; Dependabot keeps them up to date.
* Local actions and reusable workflows use the `$/` self-repository syntax (GitHub.com, July 2026). It is not available
  on GitHub Enterprise Server, where you use `./` instead. actionlint 1.7.12 does not recognise `$/` yet.
* TypeScript is held at 6.0.x because typescript-eslint does not support TypeScript 7 yet (see `dependabot.yml`).
