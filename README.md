# VerifyLens

**See what an AI-generated change actually does to each requirement — before you trust it.**

[한국어 README](README.ko.md)

**[Try it in your browser →](https://damunkorea.github.io/verifylens/)** No install. Paste a requirement and some code; nothing leaves the page.

The AI says "Done, all requirements implemented", and **every test passes.** The requirement can still be unmet.

```text
Requirement    Lock the account after 5 consecutive failures
AI's code      if (user.failures > 5) { user.locked = true }
AI's test      'locks the account after 5 consecutive failures'  → passes ✓
VerifyLens     ← R2 · Different · acts on attempt 6 (requirement: 5) · but the test passes
```

The AI wrote the code and the test with the same misunderstanding. The test is named "after 5 failures" but actually checks after six failed attempts. So **every test passes, and the requirement is still not met.** Running the tests does not show this; computing when the condition fires does.

VerifyLens shows, per requirement, what is **verified**, what is **different**, and what is **not yet verified**, with links back to the exact code lines and the tests that actually ran. It reports failing tests, and it also reports the case above: a passing test next to a numeric condition that does not match the requirement.

![VerifyLens in VS Code: the AI says "done", VerifyLens shows that only 1 of 3 requirements is verified, the evidence on hover, a side-by-side diff, the result updating by itself after a fix, and the PR summary](docs/demo.gif)

<sub>Recorded from the real extension in VS Code (25 seconds). The same recording with the Korean UI is in the [Korean README](README.ko.md).</sub>

> **Status: v0 prototype.** It works end to end on TypeScript/JavaScript repos, but it is early. The UI is in **English or Korean** and follows your editor's display language. Feedback is the main goal of this release — see [Feedback](#feedback).

## Why it's different

- **Evidence, not another AI opinion.** v0 uses **no LLM**. It combines static analysis (TypeScript compiler API), your git diff, and the test results you actually ran (JUnit XML). Every mark links back to code or a test run.
- **Unknown stays unknown.** If there's no test or a call can't be resolved, it says "not verified" instead of "looks fine."
- **Before the PR, in the editor.** It checks the working tree, including changes you have not committed, and re-checks when a file is saved. AI review bots judge a pull request after the fact; this tells you while the AI's change is still in front of you.
- **Your code stays on your machine.** The analysis makes no network calls and needs no account or API key. The report is a single local HTML file with no external resources. (The editor extension can optionally read a PR's or issue's *text* through your own `gh` to fill in requirements; code is never sent.)
- **You make the call.** The report records your decision (use / fix / verify more) next to the evidence.

## Quick start

Requires **Node.js 22.18+** (runs TypeScript directly) and git.

```bash
git clone <this repository>
cd verifylens
npm install
npm run demo:en     # builds a sample repo, runs its tests, opens the report (English)
npm run demo        # the same in Korean, with a step-by-step concept demo
```

Windows users can also double-click `demo-windows.cmd` (the Korean demo). If PowerShell says *running scripts is disabled on this system*, use `npm.cmd install` and `npm.cmd run demo:en` instead.

The demo creates a throwaway git repo with two AI-style results for the same task ("lock the account after 5 failed logins"). Result A uses `failures >= 5`; result B uses `failures > 5` and comes with a test the AI wrote alongside it. Both claim to be done, and **all tests pass in both**. VerifyLens computes the condition and shows that B only locks on the **6th** attempt, even though B's test passes.

Outputs are written to `out/`:

| File | What it is |
|---|---|
| `out/concept.html` | Step-by-step concept demo inside an editor-like screen (→ / Space to advance). Korean only, written by `npm run demo` |
| `out/report.html` | Full report: per-requirement status, evidence chain, code diff, attempt timeline, flow map |
| `out/summary.md` | The same findings as plain text |

## Release status

Last checked: 2026-11-21

| Channel | Version | Status |
|---|---|---|
| [GitHub Release](https://github.com/DamunKorea/verifylens/releases/tag/v0.17.0) | 0.17.0 | Available |
| [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=damun.verifylens) | 0.17.0 | Available |
| [Open VSX](https://open-vsx.org/extension/damun/verifylens) | 0.17.0 | Available |
| Cursor extension search | 0.15.0 | Update pending (copies from Open VSX) |
| [JetBrains preview on GitHub](https://github.com/DamunKorea/verifylens/releases/tag/jetbrains-v0.10.0) | 0.10.0 | Available as a zip |
| JetBrains Marketplace | 0.4.1 | In review |

Every version is measured the same way: [docs/benchmark.md](docs/benchmark.md).

## VS Code and Cursor extension (preview)

The same engine runs inside the editor and feels native to it: a requirements side panel, a note at the end of each evidence line (for example `← R2 · Different · acts on attempt 6 (requirement: 5) · but the test passes`), a hover with the evidence table, VS Code's own diff editor for A ↔ B, entries in the Problems panel, and automatic re-runs when you commit. Checked on VS Code and on Cursor 3.29 (same `.vsix`; in Cursor use the editor window, since extensions are not loaded in its agent window). Other VS Code–based editors should accept the same file but have not been checked.

**Install**

- **VS Code:** open the Extensions view, search for **VerifyLens** and click **Install** ([Marketplace page](https://marketplace.visualstudio.com/items?itemName=damun.verifylens)).
- **Cursor:** search for **VerifyLens** in the Extensions view and click **Install**. It comes from [Open VSX](https://open-vsx.org/extension/damun/verifylens). Other editors that use Open VSX (VSCodium, Windsurf) should find it the same way, but have not been checked.
- **Or from a file:** download the `.vsix` from the [latest release](https://github.com/DamunKorea/verifylens/releases/latest), then **Extensions → ⋯ → Install from VSIX…**.

Click the VerifyLens icon in the Activity Bar and choose **Try the sample**. The panel, the notes in the editor and the report are in English or Korean, following VS Code's display language; `verifylens.language` overrides it. To build the `.vsix` yourself:

```bash
cd vscode
npm install
npm run package     # builds verifylens-<version>.vsix
```

See [vscode/README.md](vscode/README.md) for details.

## JetBrains IDE plugin (preview)

For IntelliJ IDEA and other JetBrains IDEs (platform 2026.1 or newer). It runs the same engine as the VS Code extension through your local Node.js (18+), so the verdicts are the same: a tool window with the status of each requirement, a gutter icon and a note on the evidence line, and a re-check when a file is saved. The UI is in English or Korean, following the IDE language. Running tests, importing requirements, the PR summary and the report view are not in this preview.

Download `verifylens-jetbrains-0.10.0.zip` from the [JetBrains preview release](https://github.com/DamunKorea/verifylens/releases/tag/jetbrains-v0.10.0) and install it with **Settings → Plugins → ⚙ → Install Plugin from Disk…**. Checked on IntelliJ IDEA 2026.3 and Android Studio 2026.1; WebStorm has not been tried. See [jetbrains/README.md](jetbrains/README.md).

## Use it on your own repo

```bash
# 1) Draft requirements from a PR description, then edit them by hand
node src/cli.ts extract --pr-body pr.md > requirements.md
#    Format: - R2: Lock the account after 5 consecutive failures

# 2) Build a report for one branch, or compare two results
node src/cli.ts report --repo ../your-repo --base main --a feature/x [--b feature/y] \
     --requirements requirements.md [--junit-a a.xml --junit-b b.xml] --out out --open --lang en
```

- Requirements written in English or Korean are linked to code automatically (English by their own words, Korean through a fixed glossary of common terms, no LLM). If a requirement lands on the wrong code, append `| keywords: words, in, the, code` to pin it. Automatic links are deliberately strict about tests: a test only counts when its name covers most of the requirement, so a missing test stays "not verified".
- Test results are read from JUnit XML, e.g. `node --test --test-reporter=junit --test-reporter-destination=a.xml`. Without test results, tests show as "not run".

## Use it in CI (GitHub Actions)

When there are too many pull requests to look at one by one, run VerifyLens on each of them. It marks the deciding line of a requirement that is Different, writes a summary to the job page, and fails the check.

```yaml
# .github/workflows/verifylens.yml
name: VerifyLens
on: pull_request
jobs:
  verifylens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0          # the base branch is needed for the comparison
      # Optional: run your tests with a JUnit report, for example
      # - run: npx vitest run --reporter=junit --outputFile=junit.xml
      - uses: DamunKorea/verifylens@v0.17.0
        with:
          requirements: .verifylens/requirements.md
          junit: junit.xml        # leave out if you have no report
          fail-on: different,failed   # add unverified to be strict
```

The code is analyzed on the runner and is not sent anywhere. The same check runs locally with `node src/cli.ts ci --repo . --base origin/main --requirements .verifylens/requirements.md`.

## Check before an AI agent says it is done (hooks)

`ci --hook` checks the code the agent just changed, before anything is committed. It compares the working folder (committed, uncommitted and new files) with `origin/main`, or `main`, `origin/master` or `master` when that is missing; set `--base` to choose. It runs only when code files have uncommitted changes, so a turn where the agent only answered a question is not checked.

- When a requirement is **Different** or **Failed**, the agent is asked once to fix it. The message names the requirement, the reason and the line, gives the values to test at the boundary (taken from the numbers in the requirement, such as the 4th and the 5th failure), and tells the agent to ask you rather than edit the requirements file.
- If the code is still wrong after that one try, the agent is not stopped again. You get a notice instead.
- **Not verified** does not stop the agent unless you add `--fail-on different,failed,unverified`.
- The requirements file is `.verifylens/requirements.md` in the project (`--requirements` to change). A project without one is skipped, so the hook can also go in your user settings.
- `--junit report.xml` adds test results. A report older than the code is ignored.

Below, `/path/to/verifylens` is the folder where you cloned and installed VerifyLens (see [Quick start](#quick-start)). Use forward slashes on Windows too, and quote the path if it has spaces.

**Claude Code** — `.claude/settings.json` in your project. Claude receives the message as the reason to keep working (`"decision": "block"`).

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node --no-warnings /path/to/verifylens/src/cli.ts ci --hook claude --lang en", "timeout": 120 }
        ]
      }
    ]
  }
}
```

**Cursor** — `.cursor/hooks.json` in your project. Cursor sends the message to the agent as the next message (`followup_message`).

```json
{
  "version": 1,
  "hooks": {
    "stop": [
      { "command": "node --no-warnings /path/to/verifylens/src/cli.ts ci --hook cursor --lang en" }
    ]
  }
}
```

**Git pre-commit** — `.git/hooks/pre-commit`, made executable. The commit stops when a requirement is Different or Failed. `--worktree` also looks at changes you have not staged. `git commit --no-verify` skips it.

```sh
#!/bin/sh
node --no-warnings /path/to/verifylens/src/cli.ts ci --worktree --lang en
```

These were tested by piping each tool's hook input into the command on Windows (`vscode/test/ci.test.ts`). They have not yet been tried inside a real Claude Code or Cursor session.

## Reading the report

| Mark | Meaning |
|---|---|
| Verified | Implementation evidence found in every result and all linked tests passed |
| Different | Results disagree on a condition, the code's boundary doesn't match the number in the requirement, or only one side's test fails |
| Failed | A linked test failed |
| Not verified | Weak evidence, or no linked test ran |

## Limitations

Every wrong verdict found so far, the version that fixed it, and what is not read yet: [docs/known-mistakes.md](docs/known-mistakes.md).


- Analyzes **TypeScript and JavaScript only**.
- Requirement ↔ code linking is **rule-based** (shared words and numbers, rejection sentences ↔ `throw`/`return`). It can be wrong; the report shows why each line was picked so you can check.
- Numeric rules are read from the sentence (`at least 8`, `under 14`, `at most 20`, `50,000`, `5만 원`, `30 minutes`) and compared with comparisons, constants (also imported ones), loop counts, schema rules such as `.min(8)` and settings such as `windowMs`. When the sentence or the code does not settle the boundary (`after 7 days` with `days >= 7`, a limit read from `process.env`), the result stays "not verified". Whether the condition sits on the right code path is not proven; other logic errors are caught only if a linked test fails.
- In the editor, test results older than the code are ignored rather than trusted; run the tests again to refresh them.
- Flow maps simplify to `if` branches inside a function; loops, `switch` and `try` collapse to one step.
- Dynamic calls such as `hooks[event]()` are flagged as "unresolved" rather than followed.
- Pull requests are checked with the GitHub Action, and AI agents with hooks. There are no accounts and no hosted service; everything runs on your machine or your CI runner.

## Project layout

```
src/cli.ts          command line (demo · extract · report · ci · check)
src/analyze.ts      TypeScript AST analysis: conditions, boundaries, dynamic calls, flow graph
src/engine.ts       requirement ↔ evidence linking, test linking, result comparison, status
src/requirements.ts requirement parsing, draft extraction from PR text
src/tests.ts        JUnit XML parsing
src/git.ts          git diff / git show (local git only)
src/output.ts       report.html and summary.md
src/concept.ts      concept.html (demo only)
src/demo.ts         builds the sample repo and runs its tests
samples/            the fictional login-lockout case used by the demo
```

## Feedback

This release exists to learn how developers actually verify AI-generated code. The most useful feedback:

- Where in your workflow would you want this to appear (editor, PR, terminal, agent)?
- What did you look at first in the report, and what was missing?
- Did it get a requirement wrong? Tell us what it linked and what it should have linked.

Please open an issue using the **Feedback** template. Don't paste private code; a description or a minimal example is enough.

## License

[MIT](LICENSE) © 2026 DAMUN
