# VerifyLens for JetBrains IDEs (first preview)

**See per requirement whether an AI-generated change is verified, different, or not yet verified, before you commit, in IntelliJ IDEA, WebStorm and other IntelliJ-based IDEs.**

This is the JetBrains counterpart of the [VS Code extension](../vscode/README.md). It runs the **same analysis engine** (the TypeScript code in `../src`, through `../vscode/src/model.ts`), so both editors give the same verdict.

- **No LLM, and your code never leaves your machine.** Static analysis (TypeScript compiler API) + local git + your JUnit test results. No network use, no telemetry.
- **Unknown stays unknown.** No test or an unresolved call means "not verified", never "looks fine".

> Preview 0.1.0. Analyzes **TypeScript and JavaScript**. The UI text is **Korean**. Run in IntelliJ IDEA 2026.3 and Android Studio 2026.1; WebStorm has not been tried yet. See [what was checked](#what-was-checked-and-what-was-not).

## What it does

1. **Tool window "VerifyLens"** (left side). One line on top, for example `요구사항 3개 중 1개만 근거와 검사로 확인됨`, then each requirement with its status (확인됨 / 다름 / 실패 / 미확인) and the evidence line under it. Click a line to jump to that file and line.
2. **내 변경 확인 (Check my changes).** Compares your working tree, including uncommitted edits and new files, with the base branch. The base is picked for you: the remote default (`origin/HEAD`), otherwise `main` / `master` / `develop` / `dev`.
3. **Marks on the evidence line.** A status icon next to the line number and a note at the end of the line, for example
   `← R2 · 다름 · 6번째 시도에 동작 (요구사항 5회) · 검사는 통과`. Lines that are "different" or "failed" also get a background colour and a mark on the scrollbar.
4. **Re-check on save.** After the first check it re-runs when a source file, the requirements file or the test report is written to disk (JetBrains IDEs save automatically, or press `Ctrl+S`), and after a commit or branch switch. A test report older than the code is not trusted.
5. **샘플로 해 보기 (Run demo).** Shows the login-lockout example (two AI results, `failures >= 5` and `failures > 5`) without touching your code.

The same actions are under **Tools | VerifyLens** and in Search Everywhere (`VerifyLens: Check my changes`, `VerifyLens: Run demo`).

## Requirements

- A JetBrains IDE based on platform **2026.1 (build 261) or newer**.
- **Node.js 18 or newer** on this machine. The plugin runs the engine with your Node. With Node 22.18+ the demo runs its tests live; with older versions it uses bundled test results.
- **git** on `PATH`.

Node is looked up in this order: the path you picked with **Tools | VerifyLens | Node 위치 지정…**, the IDE's Node interpreter setting when it is a local path, `PATH`, then the usual install locations. If none is found, a notification says what to install and lets you point to the executable.

## Install

There is no Marketplace listing yet. Download `verifylens-jetbrains-0.1.0.zip` from the [JetBrains preview release](https://github.com/DamunKorea/verifylens/releases/tag/jetbrains-v0.1.0) (do not unzip it) and install it with **Settings | Plugins | ⚙ | Install Plugin from Disk…**. You can also build the zip yourself (below); it lands in `build/distributions/`.

## Use it on your branch

1. Put the requirements in `.verifylens/requirements.md` at the repository root, one per line. **Tools | VerifyLens | 요구사항 파일 만들기** creates the file with two example lines.
   ```
   - R1: Users can log in with the right password
   - R2: Lock the account after 5 consecutive failures
   ```
   Plain sentences are enough. If a requirement lands on the wrong code, append `| keywords: words, in, the, code`.
2. Open the VerifyLens tool window and click **내 변경 확인**. No commit needed.
3. Test results are read from `.verifylens/test-report.xml`, `.verifylens/test-report.json` or `.verifylens/junit.xml` (JUnit XML, or Jest/Vitest JSON), whichever is newest. For example: `node --test --test-reporter=junit --test-reporter-destination=.verifylens/test-report.xml`. Without a report, tests show as `미실행` and the requirement stays `미확인`.

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

- TypeScript and JavaScript only. The check that carries the most weight is numeric: "after 5 failures" against `failures > 5`. Other logic errors are caught only if a linked test fails.
- The base branch is only picked automatically. If none of `origin/HEAD`, `main`, `master`, `develop`, `dev` fits, the check stops and says so.
- The project folder you opened must be inside a git repository. Remote development, WSL and Dev Containers have not been tried.
- A change made outside the IDE (for example by an AI agent) is picked up when the IDE notices the file change, which can be when its window gets focus again.
- Pressing **내 변경 확인** saves all open files first, so that what is checked is what you see.

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
./gradlew buildPlugin                  # build/distributions/verifylens-jetbrains-0.1.0.zip
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
| `./gradlew test` (7 tests in a headless IDE) | pass | pass |
| `./gradlew runIde` (real window, check run on a copy of a practice repository) | shows the result below | shows the result below |

- The tests open a repository as a project, press **내 변경 확인** and assert the tool window rows, the gutter icon, the line-end note `← R2 · 다름 · 6번째 시도에 동작 (요구사항 5회) · 검사는 통과`, navigation to line 21, the re-check after saving a file (the old test result is dropped: `미확인 · 검사 오래됨`), the demo, the missing-requirements and missing-Node messages, and that the engine is found inside the installed plugin folder.
- In the real window the tool window showed `요구사항 3개 중 1개만 근거와 검사로 확인됨` with R2 as `다름`, and line 21 of `auth.ts` carried the icon, the background and the note. The check was started by `-PautoRun=check`, not by a mouse click.
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
- **설치:** [JetBrains 미리 보기 Release](https://github.com/DamunKorea/verifylens/releases/tag/jetbrains-v0.1.0)에서 `verifylens-jetbrains-0.1.0.zip` 을 받아(압축을 풀지 말고) **Settings | Plugins | ⚙ | Install Plugin from Disk…** 에서 고릅니다.
- **처음 써 보기:** 왼쪽 VerifyLens 도구 창에서 **샘플로 해 보기**를 누르세요.
- **내 변경 확인:** `.verifylens/requirements.md` 에 요구사항을 한 줄씩 적고 **내 변경 확인**을 누르세요. 커밋하지 않아도 됩니다. 그 뒤로는 파일이 저장될 때마다 스스로 다시 확인합니다.
- **보이는 것:** 맨 위 한 줄 요약, 요구사항별 상태와 근거 줄(누르면 그 줄로 이동), 근거 줄의 아이콘과 줄 끝 설명(예: `← R2 · 다름 · 6번째 시도에 동작 (요구사항 5회) · 검사는 통과`).
- **아직 없는 것:** 테스트 실행 단추, 요구사항 가져오기, PR 요약 복사, 리포트 화면, 두 브랜치 비교, 판단 기록.
- **확인한 범위:** IntelliJ IDEA 2026.3 과 Android Studio 2026.1.3(같은 IntelliJ 플랫폼)에서 자동 시험 7개와 실제 창으로 확인했습니다. WebStorm 에서는 아직 직접 돌려 보지 못했습니다.
