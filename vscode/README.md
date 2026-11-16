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

- **Requirements panel:** R1 verified, R2 **different** (B locks on the 6th attempt), R3 not verified (no test).
- **Report panel:** the full evidence chain. Click any code line in it to jump to that line in the editor.
- **In the editor:** the deciding line is highlighted, with a lens such as `VerifyLens R2 · 다름 · 6번째 시도에 동작 (요구사항 5회) · 검사 실패`.

The demo runs its tests with Node.js 22.18+ if it finds one, and otherwise uses bundled test results.

## Use it on your branch

1. Run **VerifyLens: Create requirements file**. It creates `.verifylens/requirements.md`:
   ```
   - R1: Users can log in with the right password | keywords: login, password
   - R2: Lock the account after 5 consecutive failures | keywords: failure, lock
   ```
   `keywords` are words that appear in the code; numbers in the sentence are checked against conditions.
2. Commit your change, then run **VerifyLens: Check current branch** and pick the base branch (e.g. `main`).
3. To compare two AI attempts, run **VerifyLens: Compare two branches**.

Optional: set `verifylens.junitPath` to a JUnit XML report (for example from `node --test --test-reporter=junit --test-reporter-destination=junit.xml`) so linked tests show as passed or failed instead of "not run".

## Settings

| Setting | Default | |
|---|---|---|
| `verifylens.baseBranch` | (ask) | Branch to compare against |
| `verifylens.requirementsFile` | `.verifylens/requirements.md` | Requirements file, relative to the repo root |
| `verifylens.junitPath` | (none) | JUnit XML test report, relative to the repo root |
| `verifylens.nodePath` | `node` | Node.js used to run the demo's tests |

## Limitations

- Only committed changes are analyzed (`base...branch`).
- Requirement ↔ code linking is rule-based and can be wrong; the report shows why each line was picked.
- TypeScript and JavaScript only.

Source, issues and feedback: https://github.com/DamunKorea/verifylens

---

## 한국어 요약

AI가 「완료」라고 한 변경이 요구사항마다 **확인됨 · 다름 · 미확인**인지 에디터 옆에서 보여 줍니다. LLM과 네트워크를 쓰지 않고, 코드는 PC 밖으로 나가지 않습니다.

- **처음 써 보기:** 왼쪽 VerifyLens 아이콘을 누르고 **샘플로 해 보기**를 누르세요.
- **내 브랜치 확인:** **요구사항 파일 만들기**로 요구사항을 적고, 변경을 커밋한 뒤 **지금 브랜치 확인**을 누르세요.
- **AI 결과 두 개 비교:** **두 브랜치 비교**를 쓰세요.

리포트에서 코드 줄을 누르면 에디터의 그 줄로 이동하고, 근거가 된 줄 위에는 판정이 표시됩니다.
