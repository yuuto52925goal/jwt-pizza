# Curiosity Report: Synthetic Testing as a Safety Net for Agentic Code Changes

## 1. Topic and why I find it interesting

**Synthetic testing** (also called synthetic monitoring or black-box probing) means continuously running scripted, user-like transactions — loading pages, logging in, placing an order, calling APIs — against the **real production system**, instead of against mocks or a local build.

My interest comes from something that happened at my job. Our dependencies are now updated automatically by AI at the start of every week. Upgrading versions is good, but one of those automated updates contained an **incompatible change that reached production**. Every test was green, and the problem was only found after it broke things for users.

That made me ask a question that matters more and more as code becomes *agentic*:

> If an AI agent writes the change **and** updates the tests to match, what is left that checks the change against reality?

Unit tests with mocks only check that the code agrees with *the mocks*. If the same agent edits both, the tests can only confirm that the agent's own picture of the world is consistent — not that it is correct. I wanted to find out whether synthetic tests, which do not share the agent's assumptions, can catch that kind of failure. I also wanted to know whether the rest of the loop — rollback, incident report, and a fix — can be automated while a **human stays in the loop** for the final decision.

## 2. How I researched it

I keep up with AI tooling day to day. I kept seeing developers automate almost all of bug fixing (detection → diagnosis → fix PR), leaving only the final review to a person. I wanted to understand how that works and where it breaks. I read:

- **Google SRE Book, ch. 6 "Monitoring Distributed Systems"** — defines black-box monitoring as testing externally visible behavior the way a user sees it. It also notes the limitation: it detects problems that are *already happening* and is "fairly useless" for problems that have not happened yet. <https://sre.google/sre-book/monitoring-distributed-systems/>
- **Google SRE Book, ch. 17 "Testing for Reliability"** — production tests are similar to black-box monitoring, which is why they are sometimes called black-box testing. <https://sre.google/sre-book/testing-reliability/>
- **"Probing 101 — Using Google's Cloudprober"** — argues that a simple uptime probe is *not* a synthetic transaction, because it says little about whether the business function works. This is why my tests place a real order instead of only pinging `/`. <https://medium.com/@dm03514/sre-availability-probing-101-using-googles-cloudprober-8c191173923c>
- **Checkly, "Playwright Check Suites"** and **"Why use Playwright and Checkly for Synthetic Monitoring"** — the "monitoring as code" idea: the same Playwright code that tests a PR also monitors production. <https://www.checklyhq.com/blog/playwright-check-suite-launch> · <https://www.checklyhq.com/blog/synthetic-monitoring-with-checkly-and-playwright-test/>
- **Renovate docs, "Automerge"** — automated dependency updates merge only when status checks are green. In other words, an automerge is only as safe as the tests behind it. <https://docs.renovatebot.com/key-concepts/automerge>
- **"Dependabot auto-merged a breaking major at 5:01 PM Friday"** — a real incident almost identical to mine. Afterwards that team required human review for major bumps. <https://blog.stackademic.com/dependabot-auto-merged-a-breaking-major-at-5-01-pm-friday-we-owned-the-weekend-cfaf8e852346>
- **Cursor "CI autofix"** — an always-on agent that reproduces CI failures and commits fixes. It is told to *comment instead of opening a PR when it is not confident*. <https://cursor.com/workflows/autonomous-agents/ci-autofix>
- **GeekyAnts, "An AI agent that fixes CI/CD pipeline failures automatically"** — never auto-merges; a human approves every PR. <https://geekyants.com/blog/how-we-built-an-ai-agent-that-fixes-cicd-pipeline-failures-automatically>
- **"Self-Healing CI/CD: the Pipeline Doctor pattern and LLM-as-a-Judge"** <https://codex.danielvaughan.com/2026/04/16/self-healing-ci-pipeline-doctor-llm-as-judge/>
- **"Beyond the Red Build"** — warns that agent PRs without a human owner sit and go stale. <https://halfbakedthoughtsontech.substack.com/p/beyond-the-red-build>
- **anthropics/claude-code-action docs** — the GitHub Action I used for the agent step. <https://github.com/anthropics/claude-code-action>

## 3. Current state of the art

- **Monitoring as code.** Tools like Checkly, Datadog Synthetics, Grafana Synthetic Monitoring, and New Relic run scripted browser and API checks from many regions on a schedule. The trend is to reuse the team's Playwright tests directly, so one suite serves as both the CI test and the production monitor.
- **Synthetic checks as deploy gates.** Teams run synthetics right after a deploy (or against a canary) and only "release" when they pass. If they fail, traffic goes back to the last good version.
- **Automated dependency updates** (Renovate, Dependabot, and now AI agents) are standard. The consensus is: automerge only minor and patch updates with real test coverage, and require human review for majors.
- **Agentic remediation.** In 2025–2026, products such as Cursor CI autofix, the OpenAI Codex CI workflow, GitHub Agentic Workflows (technical preview), and claude-code-action let an agent read a failure, reproduce it, and open a fix PR. The shared pattern is that the agent **proposes** and a human **disposes**: no auto-merge, a reviewer is assigned, and the agent says "I don't know" rather than opening a low-confidence PR.

## 4. Experiments

All code is in this repository:

| File | Purpose |
|---|---|
| [`synthetic/playwright.config.ts`](synthetic/playwright.config.ts) | Playwright config aimed at the deployed site (no web server, no mocks, 2 retries, trace and screenshot on failure, JSON report) |
| [`synthetic/api.spec.ts`](synthetic/api.spec.ts) | API checks: `version.json`, service root, menu (with a 2 s latency budget), franchise list, login → `/api/user/me` → logout |
| [`synthetic/ui.spec.ts`](synthetic/ui.spec.ts) | Browser checks: home, menu, and the full **login → order → pay → verify JWT** flow |
| [`.github/workflows/synthetic.yaml`](.github/workflows/synthetic.yaml) | Runs every 15 min, after each deploy, and on demand. On failure: rollback → incident issue → AI fix PR |
| [`.github/workflows/ci.yaml`](.github/workflows/ci.yaml) | `deploy → synthetic → release`: a release is only created when the synthetics pass |
| [`.github/workflows/synthetic-autofix.yaml`](.github/workflows/synthetic-autofix.yaml) | The agent step: claude-code-action with a least-privilege tool allowlist, started by `workflow_dispatch` |
| [`synthetic/run-local.sh`](synthetic/run-local.sh) | One command to build the current checkout and run the synthetics against it (local frontend + real backend) |
| [`synthetic/experiment3-breaking-change.patch`](synthetic/experiment3-breaking-change.patch) | The simulated "agent" change used in Experiments 3 and 4 |

### Setup (needed for every experiment)

```bash
git clone https://github.com/yuuto52925goal/jwt-pizza && cd jwt-pizza
npm ci && npx playwright install chromium
# Create a dedicated user in production (never use a real/admin account)
EMAIL="synthetic-$(openssl rand -hex 3)@jwt.com"; PASS="$(openssl rand -base64 18 | tr -d '/+=')"
curl -X POST https://pizza-service.deck-network.com/api/auth -H 'Content-Type: application/json' \
  -d "{\"name\":\"Synthetic Monitor\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"
printf 'SYNTHETIC_EMAIL=%s\nSYNTHETIC_PASSWORD=%s\n' "$EMAIL" "$PASS" > synthetic/.env.local   # gitignored
```

### Experiment 1 — Synthetic tests against production

```bash
set -a; . synthetic/.env.local; set +a
npx playwright test -c synthetic/playwright.config.ts
```

**Result:** 8 / 8 passed in about 6 s against `https://pizza.deck-network.com`. Without credentials, the two authenticated tests are *skipped*, not failed (6 passed, 2 skipped). A missing secret should not look like an outage.

I checked the real API responses with `curl` before writing the assertions (for example, `/api/order/menu` returns `[{id, title, image, price, description}]`, and the only real store is id 1). This is why the order test picks "the first real store" instead of the hard-coded store `4` used by the mocked unit tests.

### Experiment 2 — Running synthetics on a schedule and as a deploy gate

1. Add repository secrets `SYNTHETIC_EMAIL` and `SYNTHETIC_PASSWORD` (`gh secret set ...`).
2. Push to `main`. `ci.yaml` now runs `build → deploy → synthetic → release`. The `synthetic` job calls `synthetic.yaml` through `workflow_call`.
3. `synthetic.yaml` also runs on `schedule: '*/15 * * * *'` and `workflow_dispatch`.

**Result:** Normal pushes went green end to end (`Build ✅ deploy ✅ synthetic ✅ release ✅`, while `rollback`, `report`, and `autofix` were skipped). The HTML and JSON report is uploaded as an artifact on every run.

### Experiment 3 — Can mocked tests catch an "agentic" breaking change?

**Scenario:** an agent "migrates" the frontend to `/api/v2/order/menu` and, being thorough, updates the mock in `tests/pizza.spec.ts` to match. The real backend has no v2.

```bash
git apply synthetic/experiment3-breaking-change.patch
npx playwright test                                   # existing mocked tests
npm run build && npx vite preview --port 4173 &       # broken build, real backend
SITE_URL=http://localhost:4173 npx playwright test -c synthetic/playwright.config.ts synthetic/ui.spec.ts
git checkout -- src tests                             # undo
```

| Suite | Result |
|---|---|
| Existing unit / mocked tests | ✅ **16 / 16 passed** |
| Synthetic tests (real backend) | ❌ `menu page loads pizzas from the real service` failed 3 / 3 attempts: `expect(locator).toBeVisible() failed … element(s) not found` |

The mocked suite *cannot* detect this bug, because the code and the mocks were changed together. Only the test that talks to the real service caught it.

### Experiment 4 — Auto-rollback, incident issue, and an AI fix PR with a human in the loop

When `synthetic` fails, `synthetic.yaml` runs three more jobs:

1. **rollback (automatic):** compare the deployed `version.json` with the latest GitHub release (the last build that passed synthetics). If they differ, the frontend changed, so check out that release tag, rebuild it, and redeploy it to S3 and CloudFront. If they are the same, the problem is in the backend or infrastructure, and rolling back the frontend would do nothing, so skip it.
2. **report (automatic):** open an issue labeled `synthetic-failure`, assigned to the repo owner, listing the failed checks (parsed from the Playwright JSON report), the bad version, the rollback status, and a link to the run. If an issue is already open, add a comment instead, so the 15-minute cron does not create duplicates.
3. **autofix (agent):** only when a rollback happened (so the cause is in this repo) and `vars.AUTOFIX_ENABLED == 'true'`. This job dispatches `synthetic-autofix.yaml`, where `claude-code-action` diffs the bad commit against the good tag and reproduces the failure against the real backend with `bash synthetic/run-local.sh`. Then it either opens a PR (`Fixes #N`, requesting review from the owner) or, if it is not confident, only comments. It is told never to merge, never to push to `main`, and never to edit `synthetic/` to make the tests pass.

Reproduction:

```bash
# one-time: /install-github-app in Claude Code (installs the app and sets CLAUDE_CODE_OAUTH_TOKEN)
gh repo edit --enable-issues                    # forks have issues disabled by default
gh variable set AUTOFIX_ENABLED -b true
git apply synthetic/experiment3-breaking-change.patch
git commit -am "Experiment 4: simulated breaking API change" && git push
# watch the Actions tab: deploy → synthetic ✗ → rollback → issue → agent PR
```

**Result:**

Detection and rollback worked on the first try. The agent step took six more iterations, and each failure taught me something (see the table below).

**Timeline of the run (CI run `43382050490`, UTC):**

| Step | Time | Elapsed |
|---|---|---|
| `git push` of the breaking commit | 06:55:17 | 0:00 |
| Build + deploy finished (production broken) | 06:56:09 | 0:52 |
| Synthetic job failed (menu + order flow, after 2 retries each) | 06:58:33 | **3:16 to detect** |
| Rollback to `version-20261113.065140` deployed | 06:59:06 | **≈3 min of user-visible breakage** |
| Incident issue #2 opened and assigned | 06:59:15 | 3:58 |
| `release` job | skipped | the bad build never became a release |

The same pipeline ran three times in total (runs `43382050490`, `43382755536`, `43385324442`), always with about 3 minutes of breakage. The 15-minute cron later passed against the rolled-back site, so it did not roll back again.

**Getting the agent to open a PR (all on issue #2):**

| Attempt | What happened | Fix |
|---|---|---|
| 1 | `Unsupported event type: push`. claude-code-action does not run on `push`, and my workflow was called from `ci.yaml` on push. | Moved the agent to its own `workflow_dispatch` workflow ([`synthetic-autofix.yaml`](.github/workflows/synthetic-autofix.yaml)). `workflow_dispatch` is the one event `GITHUB_TOKEN` *is* allowed to trigger. |
| 2 | `Workflow initiated by non-human actor: github-actions (type: Bot)`. The action refuses bot-started runs by default. | `allowed_bots: github-actions`. This is safe here because only my own workflow can dispatch this run. |
| 3–4 | The agent ran and diagnosed the bug, but 7 tool calls were denied, so there was no PR. A debug transcript showed it used compound commands (`… && sed …`, `VAR=x npx …`, pipes) that did not match my allowlist. | Put the reproduction into one script ([`synthetic/run-local.sh`](synthetic/run-local.sh)), told the agent "one command per call, use the Edit tool", and narrowed the allowlist. |
| 5 | Fix verified with synthetics (8/8), but `npx playwright test` could not start because my script left the preview server on port 4173. **The agent did not open a PR. It commented on the issue that verification was incomplete.** | My bug: `npx` was not passing the kill on to `vite`. Start `vite` directly. |
| 6 | Synthetic 8/8 and unit 16/16 passed, and the fix was committed. `git push` was denied (my pattern `autofix/:*` did not match `autofix/issue-2`). **The agent stopped and explained instead of finding a workaround.** | Allow exactly `git push -u origin autofix/issue-<N>`. |
| 7 | ✅ **PR #3 opened** (`Fixes #2`, root cause + before/after evidence, review requested from me, not merged). 12 turns, about $0.09, 3.5 min. | — |

The agent's diff was exactly the right fix, 2 lines:

```diff
-    return this.callEndpoint('/api/v2/order/menu');
+    return this.callEndpoint('/api/order/menu');
-  await page.route('*/**/api/v2/order/menu', async (route) => {
+  await page.route('*/**/api/order/menu', async (route) => {
```

The final decision, reviewing and merging PR #3, was left to me as the human in the loop.

## 5. What I learned

1. **Mocks verify consistency; synthetics verify reality.** Experiment 3 is the core finding. When the same actor (human or AI) changes the code *and* its mocks, a green test suite proves nothing about production. This is the same thing that happened at my job, reproduced in a few lines. As agents write more code, tests that do **not** share the agent's assumptions become the last line of defense.
2. **Automate stopping the damage before you automate fixing it.** Rollback is reliable and reversible, so it is safe to automate fully. A fix is uncertain, so a human should review it. Splitting the pipeline this way gives fast recovery without trusting the agent with production.
3. **Human in the loop is a design decision, not just a slogan.** It only works if the agent stays quiet when unsure (otherwise people stop reading its PRs), every PR has an assigned owner, nothing auto-merges, and branch protection *enforces* review.
4. **A synthetic failure is not always a frontend bug.** Comparing the deployed version with the last good release lets the pipeline tell "we broke it" apart from "the backend is down". Without that check, a backend outage would cause a pointless frontend rollback every 15 minutes.
5. **Flakiness is expensive in an automated loop.** One false alarm could trigger a rollback, an issue, and an agent run. Retrying twice before declaring failure, and skipping (not failing) when credentials are missing, keeps the signal trustworthy.
6. **Production tests have side effects.** Every run places a real order. A dedicated synthetic account keeps that data separate from real users.
7. **The guardrails worked, even against my own mistakes.** In attempts 5 and 6, the agent had a correct fix but could not finish verifying or pushing it. Both times it reported what it knew and stopped. It did not work around the restriction or open an unverified PR. That is exactly the behavior that makes a human-in-the-loop design trustworthy, and it only happened because the prompt said "if not confident, comment instead".
8. **Least privilege is harder than it sounds.** Most of my debugging went into the *permissions*, not the fix. Wildcard patterns did not match how the agent actually wrote commands. Exact, per-incident allow rules (one script, one branch name to push) were both safer and easier to get right.
9. **GitHub Actions details matter.** Events created with `GITHUB_TOKEN` do not start other workflows, except `workflow_dispatch` and `repository_dispatch`. claude-code-action does not support `push` events, and it refuses bot-started runs unless you allow them. A reusable workflow cannot get more permissions than its caller grants. Forks have issues disabled by default. And scheduled cron runs can be delayed by several minutes.
10. **Limits.** As the SRE book says, synthetics only see what they script and only detect problems that are already happening. They complement unit tests, canaries, and white-box metrics, and do not replace them.
