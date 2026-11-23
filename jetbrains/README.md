# VerifyLens for JetBrains IDEs (first preview)

**See per requirement whether an AI-generated change is verified, different, or not yet verified, before you commit, in IntelliJ IDEA, WebStorm and other IntelliJ-based IDEs.**

This is the JetBrains counterpart of the [VS Code extension](../vscode/README.md). It runs the **same analysis engine** (the TypeScript code in `../src`, through `../vscode/src/model.ts`), so both editors give the same verdict.

- **No LLM, and your code never leaves your machine.** Static analysis (TypeScript compiler API) + local git + your JUnit test results. No network use, no telemetry.
- **Unknown stays unknown.** No test or an unresolved call means "not verified", never "looks fine".

> Preview 0.18.0. Analyzes **TypeScript and JavaScript**. The UI is in **English or Korean** and follows the IDE language (**Tools | VerifyLens | Language…** changes it). Run in IntelliJ IDEA 2026.3 and Android Studio 2026.1; WebStorm has not been tried yet. See [what was checked](#what-was-checked-and-what-was-not).

## What it does

1. **Tool window "VerifyLens"** (left side). One line on top, for example `1 of 3 requirements verified by evidence and tests`, then each requirement with its status (Verified / Different / Failed / Not verified) and the evidence line under it. Click a line to jump to that file and line.
2. **Check my changes.** Compares your working tree, including uncommitted edits and new files, with the base branch. The base is picked for you: the remote default (`origin/HEAD`), otherwise `main` / `master` / `develop` / `dev`.
3. **Marks on the evidence line.** A status icon next to the line number and a note at the end of the line, for example
   `← R2 · Different · acts on attempt 6 (requirement: 5) · but the test passes`. The AI's own test passes there, but the condition fires one attempt late. Lines that are "different" or "failed" also get a background colour and a mark on the scrollbar.
4. **Re-check on save.** After the first check it re-runs when a source file, the requirements file or the test report is written to disk (JetBrains IDEs save automatically, or press `Ctrl+S`), and after a commit or branch switch. A test report older than the code is not trusted.
5. **Try the sample.** Shows the login-lockout example (two AI results, `failures >= 5` and `failures > 5`; every test passes in both) without touching your code.
6. **Language.** English or Korean, following the IDE language. **Tools | VerifyLens | Language…** fixes it to one of them.
7. **Tests changed in this change.** When a test linked to a requirement was edited, removed or skipped in the same change, the requirement keeps its verdict and gets `⚠ test changed` next to it, and a row under it names the test and what changed, for example `auth.test.ts:5   test changed in this change: 5 → 6`. Click the row to open the test. This is for the case where a suite was made green by editing the test. A test that is new in the change is not reported.
8. **Evidence chain.** Under the list, the selected requirement is drawn as four boxes, requirement → code line → tests → when it acts, from the same model and in the same colours as the report and the try-it page. A missing link is a grey dashed box, so a Not verified requirement shows which link is missing. When the attempt can be computed, a row of dots shows the required attempt and the one the code acts on (`Required: 5`, `Code: 6 · 1 late`). With nothing selected, it shows the first requirement that is not Verified. Click the code box to go to the line, or the tests box to go to a test that was changed.

The same actions are under **Tools | VerifyLens** and in Search Everywhere (`VerifyLens: Check my changes`, `VerifyLens: Run demo`).

## Requirements

- A JetBrains IDE based on platform **2026.1 (build 261) or newer**.
- **Node.js 18 or newer** on this machine. The plugin runs the engine with your Node. With Node 22.18+ the demo runs its tests live; with older versions it uses bundled test results.
- **git** on `PATH`.

Node is looked up in this order: the path you picked with **Tools | VerifyLens | Set Node.js Path…**, the IDE's Node interpreter setting when it is a local path, `PATH`, then the usual install locations. If none is found, a notification says what to install and lets you point to the executable.

## Install

The plugin has been submitted to JetBrains Marketplace and is awaiting review, so it cannot be found by search yet. Download `verifylens-jetbrains-0.18.0.zip` from the [JetBrains preview release](https://github.com/DamunKorea/verifylens/releases/tag/jetbrains-v0.18.0) (do not unzip it) and install it with **Settings | Plugins | ⚙ | Install Plugin from Disk…**. You can also build the zip yourself (below); it lands in `build/distributions/`.

## Use it on your branch

1. Put the requirements in `.verifylens/requirements.md` at the repository root, one per line. **Tools | VerifyLens | Create Requirements File** creates the file with two example lines.
   ```
   - R1: Users can log in with the right password
   - R2: Lock the account after 5 consecutive failures
   ```
   Plain sentences are enough. If a requirement lands on the wrong code, append `| keywords: words, in, the, code`.
2. Open the VerifyLens tool window and click **Check my changes**. No commit needed.
3. Test results are read from `.verifylens/test-report.xml`, `.verifylens/test-report.json` or `.verifylens/junit.xml` (JUnit XML, or Jest/Vitest JSON), whichever is newest. For example: `node --test --test-reporter=junit --test-reporter-destination=.verifylens/test-report.xml`. Without a report, tests show as "not run" and the requirement stays "Not verified".

## Not in this preview

These exist in the VS Code extension 0.5 and are left for a later version here:

- Run tests from the IDE and re-check
- Import requirements from a GitHub PR, an issue or copied text
- Copy the PR verification summary
- The full report view (evidence chain, flow map)
- Compare two branches (two AI attempts) and the side-by-side diff
- The evidence table on hover in the editor (the tool window rows have a tooltip instead)
- Recording your decision (use / fix / verify more / hold)
- Listing lines in the Problems view, and a status bar item
- Settings for the base branch, the requirements file and the report path (the defaults above are fixed)

## Limitations

- TypeScript and JavaScript only.
- Numeric rules are read from the sentence (`at least 8`, `under 14`, `at most 20`, `50,000`, `5만 원`, `30 minutes`) and compared with comparisons, constants (also imported ones), loop counts, schema rules such as `.min(8)` and settings such as `windowMs`. When the sentence or the code does not settle the boundary (`after 7 days` with `days >= 7`, a limit read from `process.env`), the result stays "not verified". Whether the condition sits on the right code path is not proven; other logic errors are caught only if a linked test fails.
- The base branch is only picked automatically. If none of `origin/HEAD`, `main`, `master`, `develop`, `dev` fits, the check stops and says so.
- The project folder you opened must be inside a git repository. Remote development, WSL and Dev Containers have not been tried.
- A change made outside the IDE (for example by an AI agent) is picked up when the IDE notices the file change, which can be when its window gets focus again.
- Pressing **Check my changes** saves all open files first, so that what is checked is what you see.

## How it works

`build-engine.mjs` bundles `engine/main.ts` (a small command around `runRepo`, `runDemo`, `treeModel` and `allLenses` from `../vscode/src/model.ts`) with esbuild into one Node script, `verifylens-engine.cjs`. The plugin ships it as a plain file in its `engine/` folder next to the demo samples, runs `node verifylens-engine.cjs check --repo <project folder>` and reads one JSON object from standard output. `rows` in that JSON is `treeModel(report)` and `lenses` is `allLenses(report)`, unchanged. The Kotlin side only draws them.

The engine was not rewritten in Kotlin on purpose: one implementation means one verdict, and a fix to the engine reaches both editors.

## Build and test

You need Node.js 22.18+ and a JDK 21 or newer.

```bash
# from the repository root
npm install
cd vscode && npm install && cd ..      # esbuild is taken from here
cd jetbrains
./gradlew buildPlugin                  # build/distributions/verifylens-jetbrains-0.18.0.zip
./gradlew test                         # starts a headless IDE and drives the plugin
```

- `./gradlew buildPlugin` downloads IntelliJ IDEA 2026.1 (more than 1 GB) to build against. To use an IDE that is already installed (IntelliJ IDEA, WebStorm, Android Studio 2026.1 …) add `-PlocalIde="C:/path/to/the/IDE"`. To build and test against another IntelliJ IDEA version add `-PplatformVersion=2026.3`.
- `./gradlew test -PpracticeRepo=<folder>` runs the same test against a copy of your own repository layout. The original folder is not modified.
- `./gradlew runIde --args="<project folder>" -PautoRun=check` opens a real IDE window with the plugin and runs the check once.
- **Non-ASCII checkout path on Windows:** `test` and `runIde` fail to load classes when the path contains characters such as Korean, because Gradle hands the classpath to the JVM in a file that the JVM reads in the system code page. Add `-PoutDir=C:/some/ascii/folder` to move the build output. `buildPlugin` works without it.

## What was checked, and what was not

Checked on Windows 11 with Node 24:

| | IntelliJ IDEA 2026.3 (build 263.7307) | Android Studio 2026.1.3 (platform 261.26222) |
|---|---|---|
| `./gradlew test` (14 tests in a headless IDE), 0.18.0 | pass | pass |
| `./gradlew verifyPlugin -PverifyIde=<IDE folder>` (Plugin Verifier), 0.18.0 | compatible | compatible |
| `./gradlew runIde` (real window, check run on a copy of a practice repository) | 0.2.0, English and Korean; 0.13.0, English | 0.1.0, Korean |

- The tests open a repository as a project, press **Check my changes** and assert the tool window rows, the gutter icon, the line-end note (Korean `← R2 · 다름 · 6번째 시도에 동작 (요구사항 5회) · 검사는 통과` and English `← R2 · Different · acts on attempt 6 (requirement: 5) · but the test passes`), navigation to line 21, the re-check after saving a file (the old test result is dropped), the demo, the missing-requirements and missing-Node messages, and that the engine is found inside the installed plugin folder.
- English UI (0.2.0): with the language set to English, no Korean is left in the tool window, its tooltips or the gutter tooltips; the sample shows the English requirements; switching the language re-runs the last check in the new language; "auto" picks Korean only for a Korean IDE. Checked in the headless IDE and, for 0.2.0, in a real IntelliJ IDEA 2026.3 window in both languages (Korean forced with `-Dverifylens.lang=ko`, since the test IDE has no Korean language pack). That real-window check showed the status at the end of a long requirement being cut off in a narrow tool window; 0.2.1 puts the status right after the requirement number. 0.2.1 itself was checked by the tests and their rendered images.
- Evidence chain (0.13.0): the tests assert the text of every box in Korean and English (`R2 · Different · Evidence chain`, `✓ code: src/auth.ts:21 user.failures > 5`, `⚠ acts: attempt 6 (required 5) ✗ 1 late`, the dots `Required: 5` and `Code: 6 · 1 late`), the grey dashed boxes of a Not verified requirement, switching by selecting a row, the click on the code box and on a changed test, and the sample's two results side by side (the one that differs first). The engine output was compared with 0.12.0: the same except for the two new fields. In a real IntelliJ IDEA 2026.3 window (English, dark theme, 150% display scale) the picture appeared under the list with the heading and the first three boxes visible; the last box and the dots were below the fold and were seen only in the pictures the tests draw.
- Engine of VS Code 0.20.0 (0.14.0): the sample's output is the same as 0.13.0. A requirement written with Korean keywords (`| keywords: 실패, 잠금`) went from Not verified to Verified on the same code and test. On an English screen, a Korean requirement "at most 3 per day" shows `allows up to 3 times` (0.13.0: `3번`), and its summary names the reason (`no time window · no linked test`). The plugin's own code is the same as 0.13.0.
- Engine of VS Code 0.21.0 (0.15.0): the sample and two of three small example projects give the same output as with the 0.20.0 engine. In the third, the evidence for "a locked account cannot log in" moved from a block that sets a value (`!ok`, line 15) to the line that tests the state (`user.locked`, line 12).
- Linked folders (0.15.0): a test opens the project through a junction (a symbolic link on macOS and Linux) and asserts that the engine reports the path the IDE opened, that the gutter icon and the line-end note are on the file the IDE has open, that a click goes to that file, and that saving it checks again. The same test fails on 0.14.0. A project on a `subst` drive (`V:\login-service`) was run through the bundled engine and opened in a real IntelliJ IDEA 2026.3 window.
- Engine of VS Code 0.22.0 (0.16.0): the sample and three small example projects give the same output as with the 0.21.0 engine. On a fourth, written for this check ("A frozen account cannot withdraw", where the code has a `frozen` field but the only guard is `amount > account.balance` with the message `insufficient funds or account frozen`, and a test with that name passes), 0.15.0 said Verified and 0.16.0 says Not verified (`no deciding check`). The path fix of 0.15.0 moved into the shared engine: the junction test still passes, and the bundled engine run on a `subst` drive reports `V:\`. The real IDE window on a `subst` drive was not opened again for 0.16.0.
- Engine of VS Code 0.23.0 (0.17.0): the sample and three small example projects give the same output as with the 0.22.0 engine. On the fourth ("A frozen account cannot withdraw") the verdict is the same and the reason reads `nothing reads that state` (0.16.0: `no deciding check`). On a fifth, a copy of the first with one test marked skipped in the report, the verdict is the same and the test box of the evidence chain reads `not run · locks the account after 5 consecutive failures` (0.16.0: `no linked test`). The plugin's own code is the same as 0.16.0.
- Engine of VS Code 0.24.0 (0.18.0): the sample and five small example projects give the same output as with the 0.23.0 engine. Two more were written for this check. With correct code: "Return 404 when the project does not exist" (`if (!project) res.status(404)`) and "Accounts with no activity for 90 days are marked inactive" (`days >= 90`), both with a passing test, were Not verified with the 0.23.0 engine and are Verified now. With wrong code: "A welcome email is sent after signup", where `signup` takes a `mailer` and never calls it and a test with that name passes, was Verified and is Not verified now (`no deciding check`). These were run through the bundled engine; the IDE window was not opened for them. The plugin's own code is the same as 0.17.0.
- In the real window (0.1.0, Korean) the tool window showed `요구사항 3개 중 1개만 근거와 검사로 확인됨` with R2 as `다름`, and line 21 of `auth.ts` carried the icon, the background and the note. The check was started by `-PautoRun=check`, not by a mouse click.
- IntelliJ IDEA was run without a licence (free mode). The plugin is compiled against platform 261 and also builds against 263.

Not checked yet:

- **WebStorm** and the other JetBrains IDEs. The plugin uses only platform APIs (`com.intellij.modules.platform`), so it is expected to load there, but it has not been run in them.
- IntelliJ IDEA 2026.1 and 2026.2 (only 2026.3 was downloaded), and the JetBrains Plugin Verifier.
- Reading the IDE's Node interpreter setting. Finding Node on `PATH` was checked.
- IDE versions older than 2026.1, macOS and Linux.
- Installing the zip by hand through **Install Plugin from Disk…** (the tests and `runIde` load the same plugin folder layout that the zip contains), and clicking the buttons and rows by hand in a real window.

Source, issues and feedback: https://github.com/DamunKorea/verifylens

---

## 한국어 요약

VS Code 확장과 **같은 분석 엔진**을 IntelliJ IDEA · WebStorm 같은 JetBrains IDE 안에서 돌리는 첫 미리 보기입니다. AI 판정 없이 코드 분석 · git · 실제로 돌린 테스트 결과만 쓰고, 코드는 PC 밖으로 나가지 않습니다.

- **필요한 것:** 2026.1 이상의 JetBrains IDE, 이 PC 의 **Node.js 18 이상**, git. Node 를 찾지 못하면 무엇을 설치해야 하는지 알림으로 알려 줍니다.
- **화면 언어:** IDE 화면 언어를 따릅니다(한국어 IDE 면 한국어, 아니면 영어). **Tools | VerifyLens | Language…**(한국어 IDE 에서는 「화면 언어…」)에서 고정할 수 있습니다.
- **설치:** [JetBrains 미리 보기 Release](https://github.com/DamunKorea/verifylens/releases/tag/jetbrains-v0.18.0)에서 `verifylens-jetbrains-0.18.0.zip` 을 받아(압축을 풀지 말고) **Settings | Plugins | ⚙ | Install Plugin from Disk…** 에서 고릅니다.
- **처음 써 보기:** 왼쪽 VerifyLens 도구 창에서 **샘플로 해 보기**를 누르세요.
- **내 변경 확인:** `.verifylens/requirements.md` 에 요구사항을 한 줄씩 적고 **내 변경 확인**을 누르세요. 커밋하지 않아도 됩니다. 그 뒤로는 파일이 저장될 때마다 스스로 다시 확인합니다.
- **보이는 것:** 맨 위 한 줄 요약, 요구사항별 상태와 근거 줄(누르면 그 줄로 이동), 근거 줄의 아이콘과 줄 끝 설명(예: `← R2 · 다름 · 6번째 시도에 동작 (요구사항 5회) · 검사는 통과`).
- **바뀐 검사:** 요구사항에 이어진 검사를 이번 변경에서 고치거나 지웠으면, 판정은 그대로 두고 그 옆에 `⚠ 검사 바뀜`을 붙이고 아래에 무엇이 바뀌었는지 한 줄로 보여 줍니다(예: `auth.test.ts:5   이번 변경에서 검사가 바뀜: 5 → 6`). 누르면 그 검사로 갑니다.
- **근거 사슬 그림:** 목록 아래에, 고른 요구사항을 네 칸(요구사항 → 코드 줄 → 검사 → 동작)으로 그립니다. 리포트 · 체험 페이지와 같은 모델, 같은 색입니다. 비어 있는 칸은 회색 점선이라 「미확인」이 어느 칸 때문인지 보입니다. 시도 횟수를 계산할 수 있으면 점 그림(요구사항 5 · 코드 6 · 1번 늦음)도 나옵니다. 고르지 않았으면 「확인됨」이 아닌 첫 요구사항을 보여 줍니다. 코드 칸을 누르면 그 줄로, 검사 칸을 누르면 이번 변경에서 바뀐 검사로 갑니다.
- **아직 없는 것:** 테스트 실행 단추, 요구사항 가져오기, PR 요약 복사, 리포트 화면, 두 브랜치 비교, 판단 기록.
- **확인한 범위:** IntelliJ IDEA 2026.3 과 Android Studio 2026.1.3(같은 IntelliJ 플랫폼)에서 자동 시험 12개로 확인했습니다. 실제 IntelliJ IDEA 창에서는 0.2.0 을 영어 · 한국어로 확인했고, 그때 좁은 창에서 상태가 잘리는 것을 보고 0.2.1 에서 상태를 요구사항 번호 바로 뒤로 옮겼습니다. WebStorm 에서는 아직 직접 돌려 보지 못했습니다.
