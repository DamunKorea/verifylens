# Changelog

## 0.2.0

Editor-native redesign.

- **In the code:** a short note at the end of each evidence line (`← R2 · 다름 · 6번째 시도에 동작 (요구사항 5회) · 검사 실패`), a status icon next to the line number, and a hover with the evidence table (result, condition, attempt, test) and the failing test's message.
- **Side-by-side diff:** `A ↔ B 비교` opens VS Code's own diff editor at the deciding line. With one branch it compares against the base.
- **Problems panel:** lines that need attention are listed there, so F8 walks through them.
- **Stays up to date:** re-runs by itself when you commit, switch branches, edit the requirements file or produce a new JUnit report.
- **Your decision, in the list:** record use / fix / verify more / hold from the list, the lens or the report. It shows next to the requirement and is dropped when the code changes.
- **Requirements panel:** shorter rows that fit a narrow side bar, a badge with the number of requirements that need attention, and a line saying what was compared.
- **Report panel:** follows the editor's dark theme colors and fonts, with a side-by-side button per requirement.
- New settings: `verifylens.autoRerun`, `verifylens.inlineNotes`, `verifylens.problems`.

## 0.1.1

- Works in Restricted Mode (untrusted folders): the VerifyLens view and the demo are available; checking or comparing branches asks you to trust the folder first. Previously the whole extension was disabled there, so its icon did not appear.

## 0.1.0

- First preview: requirements side panel, report panel, highlighted evidence lines with code lens, demo with a sample repo, check current branch, compare two branches.
