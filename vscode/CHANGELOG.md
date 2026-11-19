# Changelog

## 0.12.0

More rules read correctly. As before, found by writing new cases ourselves.

- **"Orders under 10,000 won are not accepted"** is read as a refusal. Before, correct code (`total < 10000` throws) was called Different.
- **"Once per person", "only once", "상품마다 한 번만"** mean the code must check for a duplicate. A function that never checks is no longer Verified. "마다" is a time window only after a time word (하루마다), not after 상품.
- **Rates stored as fractions in settings.** `VAT_RATE = 0.1` is compared with "10%", so `0.08` is Different. Fee, tax, commission and discount names count as settings.
- **Timer values.** `setInterval(refresh, 60000)` against "every 30 seconds" is Different.
- **A setting named for another thing is not used.** `RETURN_FEE = 3000` is not evidence for "the shipping fee is 3,000 won", and `TAX_RATE = 0.05` is not evidence for a 5% point rate. Both stay Unverified instead of Verified.
- **How far to trust it.** On 15 new cases written after all the changes, 0.11.0 gave the expected verdict for 9 and 0.12.0 for 14, both without a wrong verdict. On an earlier new batch of 17, the changes made one wrong Verified (the RETURN_FEE case). That is fixed, and those 17 now count as seen. The fixed open-source set is unchanged.

## 0.11.0

Time rules are read better. Found by writing new cases ourselves while waiting for more reader feedback.

- **A time difference with no name is judged.** `Date.now() - sentAt > 12 * HOUR` against "expires after 24 hours" is now Different. Before, a comparison like this was only accepted when the number already matched, so a wrong number stayed Unverified.
- **More time wording:** "14 days after signup", "1 hour before the start" (at least 1 hour ahead), and "5 times per minute", where the minute is a counting window, not a limit.
- **"Blocked when the stock is 0"** needs the condition to cover 0. `stock < 0` does not block 0, so it is Different now. 0.10.0 called it Verified.
- **Counting a filtered list.** `recent = attempts.filter(...)` followed by `attempts.push(...)` counts as checking before adding. 0.10.0 read it as one short and called correct code Different.
- **Percent caps written as fractions.** `Math.min(rate, 0.7)` against "at most 50%" is compared instead of skipped.
- **How far to trust it.** On 19 new cases written after these changes, 0.10.0 gave the expected verdict for 8 of 19, called wrong code Verified once, and called correct code Different once. 0.11.0 gave 14 with keywords and 15 without, with no wrong verdicts. On the 21 cases written before the changes (seen while fixing), 0.10.0 gave 11 and 10, and 0.11.0 gives 20 and 17. The fixed open-source set is unchanged.
- Still not read: "once per product" (it reads 마다 as a time window), and a 10% rate stored as `0.1` in a setting.

## 0.10.0

Changes from more reader feedback.

- **Use it in CI.** "With thousands of pull requests you cannot check by eye" (OKKY). A GitHub Action, `DamunKorea/verifylens@v0.10.0`, runs on every pull request, marks the deciding line of a requirement that is Different, writes a summary to the job page and fails the check. `fail-on` decides which results fail it. The same check runs locally with `node src/cli.ts ci`. See the README.
- **Sign-up rules are read better.** "I always click through the sign-up flow first" (X). A requirement that needs a check ("must accept the terms", "can only sign up once") is no longer Verified when only the function name matches; it is Unverified with the reason "no deciding check". "Only once" without a time window means no duplicates, not a count of 1. "6 digits" and "exactly 4" mean exactly that value. More Korean words are in the glossary (숫자, 약관, 올바르지 않으면 …).
- **How far to trust it.** On 21 new account cases written after these changes, 0.9.0 gave the expected verdict for 15 and called wrong code Verified 1–2 times; 0.10.0 gave 18 and 0 times. On the 20 sign-up cases written before the changes (seen while fixing), 0.9.0 gave 14 and 12 (with and without keywords), 0.10.0 gives 18 and 18. The fixed open-source set is unchanged: 11 of 11 read, 0 changed code called Verified.

## 0.9.0

Changes from reader feedback on OKKY.

- **"Unverified" now says why, by kind, and what to do next.** The kinds are: wording has no direction, edge value unclear, execution order not visible, value not readable, number not found, conflicting values, no evidence, extra condition, no test, and tests out of date. They appear in the requirements panel, the hover, the summary and the [try page](https://damunkorea.github.io/verifylens/).
- **A second setting with the same name and a different value keeps the result Unverified.** In nanoid the default length 21 is written in two functions. Changing one of them to 45 used to stay Verified, because the other 21 was still there.
- **Every version is measured on the same fixed set.** It has 11 documented rules from 6 open-source projects, pinned to commits ([docs/benchmark.md](https://github.com/DamunKorea/verifylens/blob/main/docs/benchmark.md)). Changed code that was still called Verified went from 1 in 0.8.0 to 0 in 0.9.0. Verdicts on the 378 test cases are the same as in 0.8.0.
- **Try it in your browser.** A page that runs the same engine without installing anything: https://damunkorea.github.io/verifylens/

## 0.8.0

Range wording is read correctly, and many more requirements can be judged without keywords.

- **Range wording in English and Korean.** `up to and including`, `up to but not including`, `no more than`, `not less than`, `must not exceed`, `3 to 20`, `between 1 and 10 inclusive`, `from 1 to 10`, `1~10`, `1부터 10까지`, `positive`, `non-negative`, `양수`. In 0.7.0 several of these were misread, so a wrong boundary could be marked Verified. `between 1 and 10` without "inclusive" is not called Different when the code leaves out the edges, because the sentence does not settle them. That case stays Unverified.
- **Keywords are needed less often.** Forms of a word now meet (`retry` / `retried` / `retries`, `reserve` / `reserved`), the Korean glossary covers more everyday nouns, and a test is linked when the number in the code was confirmed and the test name gives the same number and the same subject.
- **A limit is judged where it is used.** `MAX_SIZE = 8 MB` alone no longer settles "up to 8 MB" when the code says `size >= MAX_SIZE`. Constants imported through path aliases (`@/...`, `@services/...`) and re-exports are followed. Unit constants such as `HOUR` are not treated as settings.
- **Narrow checks are caught.** `count === 1` against "any positive count" is Different, and limits in bytes and percent compare `>` and `>=` strictly.
- **Still Unverified on purpose:** wording that leaves the edge open ("every 90 days"), and "after 5 failed logins" when the code that counts the failures is not visible.
- 378 cases now run with the tests. On 33 new cases written after these changes, without keywords, 0.7.0 gave the expected verdict for 23 and 0.8.0 for 32. Wrong code marked Verified went from 1 to 0. We wrote these cases ourselves, so read them as a regression check rather than a benchmark.

## 0.7.0

Numeric rules are now actually checked, not only "after N failures".

Trying VerifyLens on other kinds of code showed a serious gap: in a made-up shop it marked `total > 50000` as verified for "50000 or more". Any number that was not a retry counter was effectively ignored.

- **Amounts, ages, lengths, limits, durations and percentages are compared with the code.** `total > 50000` against "50000 or more" is now `Different`, and so is `age <= 14` against "under 14", or `cart.length > 20` before a `push` against "at most 20".
- **"Verified" is no longer given when the number could not be confirmed.** If the code reads the limit from `process.env`, no matching comparison exists, or the sentence leaves the boundary open ("after 7 days" with `days >= 7`), the requirement stays `Not verified` and says why.
- **More ways of writing the rule are understood.** In the sentence: `50,000`, `5만 원`, `다섯 번`, `at least`, `no more than`, `under`, `must not exceed`, `10MB`. In the code: constants (also imported or in objects and readonly fields), `5 * 60 * 1000`, `return x >= 8`, arrow functions, `!(x >= 8)`, `for` / `while` loop counts, countdowns, `.min(8)` / `.max(20)`, `@MaxLength(15)`, `Math.min`, `slice(0, 50)`, and settings such as `windowMs`, `expiresIn: '1h'`, `options.retries ??= 10`, `setTimeout(fn, 30000)`.
- **"Only admins" with an extra condition** (`role !== 'admin' && amount >= 100000`) is no longer verified.
- 178 cases now run with the tests, and the rules were tried on real code from validator.js, express-rate-limit, p-retry, ky, helmet and nanoid.

## 0.6.1

- **On Open VSX.** Cursor (and other editors that use Open VSX) can now install VerifyLens by searching for it in the Extensions view. The install section says so instead of "Not on Open VSX yet".
- No change to the extension itself.

## 0.6.0

English UI.

- **The whole UI is available in English.** The requirements panel, the note at the end of each evidence line, the hover, the Problems entries, the report, messages and the PR summary follow VS Code's display language: Korean when VS Code is in Korean, English otherwise. The line note now reads `← R2 · Different · acts on attempt 6 (requirement: 5) · but the test passes`.
- **`verifylens.language`** (`auto` / `ko` / `en`) overrides it. If you use VS Code in English and want the Korean text back, set it to `ko`.
- **The sample comes in English too.** "Try the sample" uses the same case with the requirements written in English.
- `verifylens.summaryLanguage` now defaults to `auto` (same language as the panel). Decisions you recorded earlier are kept and shown in the current language.
- The command line takes `--lang en` (`npm run demo:en`).
- No change to what is detected or how.

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
