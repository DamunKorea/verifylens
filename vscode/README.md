# VerifyLens for VS Code and Cursor

**See per requirement whether an AI-generated change is verified, different, or not yet verified — right next to your code.**

AI tools say "Done, all requirements implemented." VerifyLens checks that claim against your git diff and the tests that actually ran, and shows the result in a side panel, as highlighted lines, and as a lens above the code that decides each requirement.

- **No LLM, no network.** Static analysis (TypeScript compiler API) + git + your JUnit test results. Your code never leaves your machine.
- **Unknown stays unknown.** No test or an unresolved call means "not verified", never "looks fine".
- **You decide.** Every mark links back to the code line or test that produced it.

> v0 preview: analyzes **TypeScript and JavaScript**. The report text is currently **Korean**.

## Try it in 10 seconds

1. Click the **VerifyLens** icon in the Activity Bar.
2. Click **샘플로 해 보기** (Run demo).

The demo builds a small sample repo with two AI results for "lock the account after 5 failed logins". Result A uses `failures >= 5`, result B uses `failures > 5`. Both claim to be done. VerifyLens shows:

- **Requirements panel:** R1 verified, R2 **different**, R3 not verified, with a badge for how many need attention.
- **In the editor:** the deciding line gets a status icon and a note at its end, for example `← R2 · 다름 · 6번째 시도에 동작 (요구사항 5회) · 검사 실패`. Hover it for the evidence table and the failing test's message.
- **Side by side:** click `A ↔ B 비교` above the line (or the compare icon in the list) to open VS Code's own diff editor at the line where the two results diverge.
- **Problems panel:** lines that need attention are listed there, so `F8` walks through them.
- **Report panel:** the full evidence chain. Click any code line in it to jump to that line in the editor.
- **Your decision:** record use / fix / verify more / hold from the list, the lens or the report. It shows next to the requirement.
- **PR summary:** the clipboard icon copies a GitHub-markdown summary (status, evidence line, when it acts, test result, your decision, what is still not verified) to paste into the PR, so the reviewer does not redo the check.

The demo runs its tests with Node.js 22.18+ if it finds one, and otherwise uses bundled test results.

## Use it on your branch

1. Run **VerifyLens: Create requirements file**. It creates `.verifylens/requirements.md`:
   ```
   - R1: Users can log in with the right password | keywords: login, password
   - R2: Lock the account after 5 consecutive failures | keywords: failure, lock
   ```
   `keywords` are words that appear in the code; numbers in the sentence are checked against conditions.
2. Commit your change, then run **VerifyLens: Check current branch** and pick the base branch (e.g. `main`).
   After that it **keeps itself up to date**: commit a fix, edit the requirements, or produce a new test report, and the result refreshes on its own.
3. To compare two AI attempts, run **VerifyLens: Compare two branches**.

Optional: set `verifylens.junitPath` to a JUnit XML report (for example from `node --test --test-reporter=junit --test-reporter-destination=junit.xml`) so linked tests show as passed or failed instead of "not run".

## Settings

| Setting | Default | |
|---|---|---|
| `verifylens.baseBranch` | (ask) | Branch to compare against |
| `verifylens.requirementsFile` | `.verifylens/requirements.md` | Requirements file, relative to the repo root |
| `verifylens.junitPath` | (none) | JUnit XML test report, relative to the repo root |
| `verifylens.nodePath` | `node` | Node.js used to run the demo's tests |
| `verifylens.autoRerun` | `true` | Re-run on commit, branch switch, or when the requirements file or JUnit report changes |
| `verifylens.inlineNotes` | `true` | Show the note at the end of evidence lines |
| `verifylens.problems` | `true` | List lines that need attention in the Problems panel |
| `verifylens.summaryLanguage` | `ko` | Language of the copied PR summary (`ko` or `en`) |

## Limitations

- Only committed changes are analyzed (`base...branch`).
- Requirement ↔ code linking is rule-based and can be wrong; the report shows why each line was picked.
- TypeScript and JavaScript only.

Source, issues and feedback: https://github.com/DamunKorea/verifylens

---

## 한국어 요약

AI가 「완료」라고 한 변경이 요구사항마다 **확인됨 · 다름 · 미확인**인지 에디터 옆에서 보여 줍니다. LLM과 네트워크를 쓰지 않고, 코드는 PC 밖으로 나가지 않습니다.

- **처음 써 보기:** 왼쪽 VerifyLens 아이콘을 누르고 **샘플로 해 보기**를 누르세요.
- **내 브랜치 확인:** **요구사항 파일 만들기**로 요구사항을 적고, 변경을 커밋한 뒤 **지금 브랜치 확인**을 누르세요. 그 뒤로는 커밋하거나 테스트를 돌리면 스스로 다시 분석합니다.
- **AI 결과 두 개 비교:** **두 브랜치 비교**를 쓰세요.

근거가 된 줄에는 아이콘과 줄 끝 설명이 붙고, 마우스를 올리면 근거 표가 나옵니다. 줄 위 **A ↔ B 비교**를 누르면 VS Code 기본 비교 화면으로 두 결과를 나란히 봅니다. 확인이 필요한 줄은 문제(Problems) 목록에도 올라가서 `F8`로 넘겨 볼 수 있고, 판단(사용 · 수정 · 추가 검증 · 보류)은 목록에서 바로 기록합니다. 목록 위 클립보드 아이콘을 누르면 PR에 붙일 **검증 요약**(상태 · 근거 줄 · 동작 시점 · 검사 · 판단 · 아직 확인 안 된 것)이 복사됩니다.
