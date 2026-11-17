# Changelog

## 0.5.2

Lead with what running the tests cannot show.

- **The demo now passes every test.** Result B comes with a test the AI wrote with the same misunderstanding as the code (named "after 5 failures", but it checks after six). All tests are green, and R2 is still `다름`: the condition fires on the 6th attempt.
- **A passing test that disagrees with the computed behavior is called out.** The line note reads `검사는 통과` instead of `검사 통과`, and the hover, the report and the PR summary say that the test passes while the computed attempt differs, and ask you to check that the test exercises the same count as the requirement.
- Nothing changes for failing tests or for requirements without a test.

## 0.5.1

- Checked on **Cursor 3.29** with the same `.vsix` (use the editor window; extensions are not loaded in Cursor's agent window).
- Listing details for the VS Code Marketplace and Open VSX (preview flag, banner, keywords). No change in behaviour.

## 0.5.0

Check the change while it is still in front of you: before the commit, before the PR.

- **Uncommitted changes are checked.** "Check my changes" reads your working tree (committed + uncommitted + new files) and re-checks when you save a file or when something outside the editor, such as an AI agent, writes one. `verifylens.includeUncommitted` turns this off.
- **Run tests from the editor.** The beaker icon detects Vitest, Jest or `node --test` from `package.json`, runs them, reads the report (JUnit XML or Jest/Vitest JSON) and re-checks. `verifylens.testCommand` covers other runners.
- **Outdated test results are not trusted.** If the report is older than the code, its passes and failures are ignored and the requirements show `미확인 · 검사 오래됨` until the tests are run again.
- **A numeric condition far from the requirement is still caught.** "after 5 failures" against `failures > 3` used to be linked to the surrounding block; it is now linked to the condition and reported as acting on the 4th attempt.
- **Fewer questions.** The base branch is taken from the remote default, or `main` / `master` / `develop`, without asking.
- Decisions are tied to the exact content: editing an uncommitted file drops a decision recorded before the edit.

## 0.4.1

Fixes found by recording the extension in a real VS Code window.

- Checking a single branch no longer calls it "결과 A": the list shows `auth.ts:21`, and the hover drops the result column.
- The hover leads with the attempt strip, so the computed behaviour is visible without scrolling; the rows of the strip now line up (Korean labels are padded with full-width spaces).
- The status icon in the gutter appears on the first line of a multi-line condition only, and the Problems squiggle covers that line only.

## 0.4.0

- **Import requirements** instead of typing them: from the current branch's GitHub PR and the issues it closes, from an issue number or URL (both through your own `gh`; only the text is read, code is not sent), or from text you copied from Jira, Linear or chat. Extraction is rule-based: a section named "Acceptance criteria" / "요구사항" first, then checklists, then "must / ~해야 한다" sentences, then the title. Existing requirements can be kept and appended to.
- **No keywords needed.** A requirement written as a plain sentence is linked to code automatically: English by its own words, Korean through a fixed glossary of common terms. `| keywords:` still pins a link by hand.
- **Automatic links cannot create false reassurance.** For them a test counts only when its name covers at least two thirds of the requirement's concepts, and a "must not / 않는다" requirement needs a test that talks about rejection or failure. Otherwise the requirement stays "not verified". Hover and PR summary say when a link was automatic.
- When scores tie, the evidence is now the inner condition with the matching number rather than its enclosing block.

## 0.3.0

- **What makes it different is now up front:** the list, the status bar and the report lead with "N of M requirements verified by evidence and tests"; the demo says what the AI claimed next to what was actually verified; the hover and the PR summary draw when the code acts, attempt by attempt (`1 2 3 4 5 [6]  ✗ 1회 늦음`); every fact is labelled with where it came from (code analysis, computed, executed test) and "no AI inference"; a requirement that is not verified says why (`미확인 · 검사 없음`).
- **Copy verification summary for a PR:** one click (clipboard icon in the Requirements panel, the button in the report, or the command palette) copies a GitHub-markdown table with each requirement's status, evidence line, behavior, test result and your recorded decision, plus failed tests and what is still not verified. Paste it into the PR description or a comment so the reviewer does not have to redo the check. `verifylens.summaryLanguage` switches it to English.

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
