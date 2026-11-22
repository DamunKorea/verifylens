# Changelog

## 0.23.0

The first run on the browser page says more, and a wrong verdict can be reported in two clicks. All of it comes from reading back every reaction we got in Korea and on X: everyone asked how far to trust the verdicts, and nobody has run VerifyLens on their own code yet. No new rule is added, and no verdict changes.

- **A test that was not run is not "no test".** The browser page cannot run tests, so a public pull request used to come back almost all Not verified with "no test", even when its tests were right there. Now:
  - The tests in the pull request are listed under 3 as "not run". Set the ones that passed for you to "passed".
  - A requirement whose linked test was not run says "test not run", and the card lists the test with ○. "No test" now means that no test is linked at all.
  - The same reason shows in the editor, the pull request summary and the command line when a linked test was skipped.
- **"Wrong verdict? Report it"** under every result on the browser page. It copies the requirement, the verdict, the evidence line and a few lines around it, then opens a GitHub issue form. Nothing leaves the page until you post the issue yourself, and the code is not put in the address.
- **A clearer reason for the 0.22.0 state rule.** When the code names the state but no condition reads it, the reason is now "nothing reads that state". It used to say "no deciding check", with advice that only the function name had matched.
- The browser page's JetBrains link points at the JetBrains guide, which always names the latest preview. Before, it pointed at 0.4.1.

## 0.22.0

The evidence-line limits left in 0.21.0 are fixed, and so is a path problem for projects opened through a mapped drive or a link. We found all of it ourselves: the engine limits on cases we wrote after 0.21.0, and the path problem on our JetBrains build. None of it comes from a user report.

- **A state that the code names must be read by the check.** Take "A banned user cannot post comments". When the code has a field, constant or enum value for that state (`banned`, `SUSPENDED`, `CardState.Frozen`), the evidence must be a condition that reads it. Before, two kinds of code with no check at all could be Verified:
  - a block that sets the state another way than `=`, such as `user.ban()`, `sub.state = SubState.Cancelled` or `driver.status = SUSPENDED`;
  - a guard that names the state only in its error message, such as `if (!canEdit) throw new Error('NO_PERMISSION_OR_ARCHIVED')`.

  Now the evidence moves to the condition that reads the state. If there is none, the requirement stays Not verified. This reads English sentences of the form "A <state> <thing> cannot …" and "… who are <state> cannot …".
- **A check in a helper that nothing calls does not count.** A function that is not exported, and whose name appears nowhere else in the file, never runs. Its checks are no longer evidence.
- **Helpers called through other helpers.** `listProduct → checkSeller → assertNotSuspended` is now traced back, up to four steps. Before, the check was put down to a different function and stayed Not verified.
- **A method the checking function calls belongs to the same feature.** `login` calling `account.lock()` no longer makes `lock()` look like a different feature, so the real check `if (account.locked)` stays the evidence. This was a known limit in 0.21.0, where the result was Not verified.
- **Projects opened through a mapped drive or a link.** This covers a `subst` drive such as `V:`, a junction and a symbolic link. git reports the repository's real path. So the editor showed no line notes, the Problems list pointed at the real path, and opening a result opened a second copy of the file. The repository root now keeps the path you opened. Our JetBrains build found this and fixed it in its own 0.14.1; the VS Code extension had the same problem. We checked it in VS Code on a folder opened through a junction, and on a `subst` drive.
- **How far to trust it.** Keywords made no difference.

  | Cases | 0.21.0 | 0.22.0 |
  |---|---|---|
  | 4 known limits from 0.21.0 | 3 Verified with no check, 1 Not verified with the check | all 4 right |
  | 12 cases (25 verdicts) written before this fix | 5 Verified with no check | 0 (seen while fixing, not a score) |
  | 16 cases (32 verdicts) written after this fix | 5 Verified with no check, 25 of 32 right | **first run: none, 31 of 32 right** |

  The verdicts on all other earlier cases are the same as 0.21.0.
- **Still not read:**
  - A helper called through a list, such as `for (const check of [ensureNotExpired]) check(invite)`. It stays Not verified.
  - Uncalled class methods and exported helpers are not recognised as uncalled. In our cases they came out right only because the function name pointed elsewhere.
  - The state rule reads English sentences only. For Korean sentences, use keywords.
  - When the code names the state (`disabled`) but the check reads another word (`!key.enabled`), the requirement stays Not verified.

## 0.21.0

A block that only sets a state is no longer taken as the check for it, and requirements import more cleanly from pull requests. We found all of this ourselves. The engine fix came from our own demo pull request, and the import fixes came from trying a real public pull request on the browser page. None of it comes from a user report.

- **A block that sets a state is not the check for it.** Take "A locked account cannot log in". Before, a block like `if (!matches(password, account.passwordHash)) { … account.locked = true; throw … }` counted as evidence for it, because the block mentions "locked" and throws. Code with no `if (account.locked)` check anywhere was then Verified, which is the worst mistake we can make. When the check was there, the evidence line often pointed at this block instead. Now:
  - Words in the condition count fully, and words that are only inside the block count half.
  - Words the block only sets (`= true`, `= 'closed'`) do not count at all.
  - A block that sets the requirement's state without checking it is not the check for it.
  - For a rejection rule, a plain assignment such as `account.failures = 0;` is not evidence either.
- **Importing requirements from a pull request** (the extension's "Import requirements", and the browser page):
  - Process sections of PR templates (Task Checklist, Related Issue, Testing) and lines such as "I have created a task" are skipped.
  - Prose under a requirement heading such as "Expected behavior" is read even without "must".
  - Ticket prefixes such as "BACK-801 - " are taken off titles.
- **Also since 0.20.0, already on the browser page and the command line:**
  - The browser page can check a public GitHub pull request by its address.
  - `npx -y github:DamunKorea/verifylens ci --worktree` runs the check without installing anything.
  - The command line speaks the computer's language when `--lang` is not given (it was always Korean).
- **How far to trust it.** We counted how often each version called code with the check missing Verified. Keywords made no difference.

  | Cases | 0.20.0 | 0.21.0 |
  |---|---|---|
  | 6 written before the fix | 6 times | 0 |
  | 7 written after a first fix | 6 times | first run 2, after a second fix 1 |
  | 6 written after the second fix | 6 times | **first run 2** |

  On the last batch, the expected verdict went from 6 to 10 of 12. The verdicts on all earlier cases are the same as 0.20.0, with and without keywords.
- **Still not read:**
  - A state set another way than `=`: through a method (`account.lock()`) or an enum value (`SubState.Cancelled`).
  - A rejection whose state word is only in its error message (`throw new Error('DOOR_LOCKED_NO_KEY')`).
  - A check in a helper function that nothing calls.

## 0.20.0

Korean keywords, and two display fixes. All three were found by us. Our JetBrains build found the two display fixes while testing; we found the keyword gap while writing changed-test cases. None are user reports.

- **Korean keywords are read.** `| keywords: 실패, 잠금` is now linked to `failures` and `locked` in the code through the glossary that already links Korean sentences. Before, keywords were taken only as words that appear in the code. Korean keywords therefore matched nothing, and almost every such requirement was Not verified. English keywords work as before.
- **The one-line summary agrees with the evidence line.** Sometimes a linked test passes but something else keeps the requirement Not verified. The summary now names that reason, for example "the test passes, but no deciding check" or "the test passes, but no time window". Before, it said "no linked test", while the evidence line below it said the test passed.
- **Korean units on an English screen.** A Korean requirement on an English screen used to show "allows up to 3번" and a boundary value of "50,000원". It now shows "allows up to 3 times" and "50,000 won". The same goes for people, items, characters, days, hours and minutes. The Korean screen is unchanged.
- **How far to trust it.**
  - On 10 cases written before the keyword fix (20 verdicts, 8 of them for wrong code), 0.19.0 gave the expected verdict for 3, none of them for wrong code. 0.20.0 gives 18, including all 8 for wrong code.
  - On 5 cases written after the fix (10 verdicts), 0.19.0 gave 1. The first run of 0.20.0 gave 7: 3 of the 5 wrong versions were Different, with no wrong Verified and no false alarm. The three it missed are listed under "Still not read" below.
  - The changed-test case with a Korean test name, which 0.19.0 missed, is now shown.
  - All other verdicts are the same as 0.19.0 on all 845 earlier cases.
- **Still not read.**
  - "5점 이하" (at most 5 points) reads 점 as a count, so a rating check is not used as evidence: `rating > 10` is Not verified rather than Different.
  - Keywords that do not cover the variable in the condition (`예약, 취소` against `hoursLeft < 24`) leave the number unfound, with English or Korean keywords. Leaving the keywords out works.
  - Two correct cases with Korean keywords stay Not verified: free shipping from ₩50,000 with `배송비, 무료`, and a single-use coupon with `쿠폰, 사용`.

## 0.19.0

The same picture wherever you look, and tests that were changed to pass. The picture work follows our own review ("make the gap visible in seconds"); the changed-test check came from several people on X describing agents that make a suite green by editing the test. They are not VerifyLens users, and none of this comes from user reports.

- **The evidence chain everywhere.** Requirement → code line → tests → when it acts, with the step that disagrees marked and empty steps shown as grey dashed boxes. It is on every card of the browser page, at the top of the VS Code report, in the GitHub PR summary as a Mermaid diagram (for requirements that are not Verified), and as one line in the agent hook message.
- **Attempt dots.** When the requirement and the code count attempts, two rows of dots show where each acts: "required 5 · code 6 · 1 late".
- **One set of verdict colours and marks.** ✅ Verified green, ⚠️ Different amber, ❌ Failed red, ❔ Not verified grey, the same on the browser page, the report and the PR summary. Before, Different was red on the page and amber in the report.
- **The browser page shows the result first.** The first Different card and its chain are on screen without scrolling, also on a phone. Clicking the file and line in a card selects that condition in the code box; after an edit, the parts that changed are highlighted for a moment.
- **The VS Code report opens on the requirement that needs a look.** Its verdict, "required n → code m" and the evidence chain come first, and the table of all requirements is right below; choosing another requirement in the table changes the chain and the code evidence with it. The task timer, used when timing how long a reader takes, is now behind a "Task timer" button.
- **Tests that were changed in this change.** Each test file is compared with the merge base, test by test, and changed tests are linked to requirements by the same name rules as test results. VerifyLens reports a changed number (5 → 6, 429 → 200), a changed expected value on an assertion line ('LOCKED' → 'BAD_LOGIN'), a weaker or flipped assertion (`toBe(0)` → `toBeGreaterThanOrEqual(0)`, `toThrow(…)` → `not.toThrow()`), fewer assertions, a removed, skipped or todo test, and a changed number in a test helper file that the test imports. It appears in the tests step of the chain (amber, not the red of a failing test), in the PR summary under "Tests changed in this change", in CLI lines, as a GitHub annotation on the test line, in the sidebar, and in the agent hook, which asks once even when the requirement is Verified. Verdict words do not change.
- **How far to trust the changed-test check.** 0.18.0 showed none of these changes. On 11 cases written after building it, the first run was right for 6 (5 of 9 changed tests shown, 1 false alarm); we fixed what it missed. On 8 more cases written after that, the first run was right for 7: all 5 changed tests were shown, with 1 false alarm (an assertion moved into a helper function reads as "1 fewer check"). A test with a Korean name that is not linked to its requirement is not shown. Verdicts are unchanged on all 845 verdict cases.

## 0.18.0

Re-run the tests that failed, and checks on the wrong state. The re-run idea came from a comment on X; the verdict fixes were found by writing cases in areas we had not covered (order states, roles, reminders, single-use codes, bookings). None are user reports.

- **Tests that failed must be run again.** With `--junit`, `ci --worktree` and the agent hooks keep the names of failed tests inside the git folder (`.git/verifylens-failed-tests.json`, never committed). After the code changes, if a new report does not include them, or the report is older than the code, they are named as not run again, and the hook asks the agent once to run them. A Failed requirement lists its failed tests by name. A test that passes is removed from the list.
- **A check on another state is not evidence.** "Orders that have started shipping cannot be cancelled" with code that blocks only `'delivered'` is no longer Verified. The same goes for roles (`'viewer'` against "only the owner"). Korean state words are read: 배송 시작 (shipped) and 배송 완료 (delivered) are told apart; 취소, 승인 and 결제 완료 (paid) are known.
- **A reminder N days before or after is that day.** "A reminder 3 days before the trial ends" is `daysLeft === 3`, not "at least 3 days". Deadlines ("2시간 전까지") and expiry after sending are unchanged.
- **"두 번 예약할 수 없다" is a duplicate rule**, not a limit of two.
- **"Only once" needs a check that looks at whether it was already used** (`usedAt`, `redeemedAt`, `includes`, `some`, an error named `ALREADY_…`). `if (!card) throw new Error('NOT_FOUND')` is not one.
- **How often it says Not verified** is now in [docs/benchmark.md](https://github.com/DamunKorea/verifylens/blob/main/docs/benchmark.md), as asked on X: not an accuracy number, the split of the three verdicts.
- **How far to trust it.** On 20 cases in new areas written before the changes, 0.17.0 gave the expected verdict for 9 with keywords and 10 without, calling wrong code Verified once each and correct code Different once each. On the 20 cases written after the changes, 0.17.0 gave 10 and 9 with 3 wrong Verified each and one false alarm without keywords; the first run of 0.18.0 gave 12 and 15 with 1 wrong Verified each (a gift card check named `NOT_FOUND`), fixed before release. On the way, widening which tests are linked with keywords made a lockout test verify "a locked account cannot log in"; that change was taken back. All 845 cases run with the tests and none gets a wrong verdict. In the older sets 3 verdicts got better and none got worse. The fixed open-source set is unchanged.
- Still not read: rounding, times of day ("밤 10시"), and an overlap check for bookings. A check on another state is Not verified rather than Different.

## 0.17.0

Whose check it is, decorators, time windows and count limits. One wrong Verified in 0.16.0 was found by our own promotion team on the try page; the rest were "not read yet" items in 0.16.0, found by writing new cases ourselves. None are user reports.

- **A check in another feature's function is not evidence, even in a file named for the requirement.** In `signup.ts`, the email check in `subscribe` made "sign-up rejects an invalid email" Verified while `signup` checks nothing. A function name now counts twice as much as a file name. A check belongs to the functions that call it (`register` → `assertValidEmail`) or that use its setting (`MAX_VIDEO_BYTES`), and two classes with a method of the same name (`CartService.add`, `WishlistService.add`) are told apart.
- **"~할 수 없다" is read as a rejection rule**, like "cannot". Before, "만료된 쿠폰은 선물할 수 없다" was not, so a function without the check could be Verified.
- **class-validator decorators are checks.** `@IsEmail()`, `@IsUrl()`, `@IsUUID()` and `@Matches(/^\d{6}$/)` count for "an invalid X is rejected". `@Length(11, 11)` is exactly 11 characters and `@Length(2, 50)` is 2 to 50, so `@Length(2, 100)` against "2 to 50 characters" is Different. `@Min` / `@Max` on a field named `age` are read for "Age must be between 14 and 120". A field with only `@IsString()` is reported as accepted unchecked.
- **A limit per day, hour, week or month needs a time window.** "At most 3 invites per day" with `if (sent.length >= 3)` counts every invite ever sent, so it is Not verified with the reason "no time window". A filter by time (`now - t < 24 * 60 * 60 * 1000`), `isSameDay`, `getMonth() === now.getMonth()`, a database count from `startOfDay(…)`, or a name such as `sentToday` is the window. "한 달에 두 번" is met by a list filtered to the same calendar month.
- **A count kept in a variable is the current count.** `const owned = await db.workspace.count(…)` or `const n = log.filter(…).length` checked before `create` or `push` is read like `list.length`, so `owned >= 3` allows 3 and `owned > 3` allows 4 (Different). Before, correct code like this could be Different.
- **Tests for a count limit.** A test that names the next ordinal and a rejection ("a fourth invite on the same day is rejected", "세 번째 출금은 거부한다", "the 6th upload") is linked to "at most 3 / 2 / 5". A test that does it once ("sends a reset mail") is no longer linked to "at most 3 an hour". "할 수 없다" is read as a rejection in test names.
- **"at most twice" and "thrice"** are read as 2 and 3. Scope words such as "per order" or "per account" are not required in the test name.
- **"between 14 and 120" with `@Min(13)` is Different.** It is wrong whether 14 counts or not. It stays Not verified only when the code matches the other reading of the edge.
- **How far to trust it.** Checks in another function: on 20 cases written after the first fix (not seen while fixing), 0.16.0 gave the expected verdict for 10 with keywords and 11 without, calling wrong code Verified 5 times each; the fixed code gave 17 and 17 with 3 wrong Verified each. After fixing those, the last 20 cases were 11 and 11 on 0.16.0 with 4 and 6 wrong Verified, and 16 and 15 on the first run of 0.17.0, with 1 and 2 wrong Verified (two classes with a method named `add`, a setting used by another function). Both were fixed before release. Time windows and count limits: on the last 20 cases, 0.16.0 gave 10 and 9 with 4 and 2 wrong Verified and 1 and 3 false alarms; 0.17.0 gave 18 and 18 with no wrong verdict on the first run. On the way, a test that sends a mail once was linked to an hourly limit, a person's age was matched to "30 days" again, and a first time-window rule made false alarms in older sets; all fixed before release. All 805 cases run with the tests and none gets a wrong verdict. In the 23 older sets 10 verdicts got better and none got worse. The fixed open-source set is unchanged.
- Still not read: a formula outside a fixed-amount branch, some duplicate checks without keywords, and "once a day" written as a filtered list. With keywords, a check in the right function stays Not verified when the keywords do not cover the test name. See [docs/known-mistakes.md](https://github.com/DamunKorea/verifylens/blob/main/docs/known-mistakes.md).

## 0.16.0

Formulas and schema checks. This follows the third bug shared on X (a flat coupon applied wrongly), which 0.15.0 could only mark Not verified.

- **A fixed amount computed as a percentage is Different.** In a branch for `fixed`, `flat` or `amount` (an `if`, a ternary, a `switch` case, or a function in an object), `total * (1 - v / 100)` is reported as "computes the fixed amount as a percentage (÷100)". Subtracting the amount is the evidence. This holds even when a test passes, because the test can share the same mistake.
- **A format check in a schema is evidence.** `z.string().uuid()`, `.email()`, `.url()`, yup and Joi `.email()` count as checks for "invalid X is rejected". `regex(/^\d{11}$/)` is read as exactly 11 characters, so `\d{10}` against "11 digits" is Different.
- **A check in a function for another action is not evidence.** If `deleteFile` checks nothing, the id check in `getFile` does not verify "deleting a file with an invalid id is rejected".
- **Duplicate checks by key.** `if (prev) return prev` and `findFirst` results count as duplicate checks, and "retried with the same key" counts as a test of doing it twice.
- **With keywords, a rejection rule links only tests that say reject**, as it already did without keywords.
- **How far to trust it.** On the last 20 cases, written after all these changes, 0.15.0 gave the expected verdict for 12 with keywords and 10 without, calling wrong code Verified 2 times each. 0.16.0 gave 18 and 16, with no wrong verdict with keywords and one without. That one (a fixed discount written as a function in an object) was fixed before release. On the 20 cases written before the changes, 0.15.0 gave 13 and 13 with 1 wrong Verified each; 0.16.0 gives 20 and 18. All 685 cases run with the tests and none gets a wrong verdict. Two expected verdicts in earlier sets were corrected from Not verified to Different: they are wrong formulas, which 0.15.0 could not judge. The fixed open-source set is unchanged.
- Not read yet: class-validator decorators such as `@IsEmail()`, and formulas outside a fixed-amount branch.

## 0.15.0

Three real bugs someone shared on X, after testing a verification agent at a hackathon: an invalid email got through, paying twice made two orders, and a flat coupon was applied wrongly. In each case the tests never went there: they used valid emails only, paid once, and used percent coupons. We turned them into requirements and cases.

- **A check in a function for another feature is no longer evidence.** With no email check in sign-up, the newsletter's email check made "sign-up rejects an invalid email" Verified. When a function named for the requirement's subject exists, the check must be there.
- **A schema that takes the field without a check keeps a rejection rule unverified.** `email: z.string()` without `.email()` is reported as "accepted unchecked elsewhere", with the line.
- **"Only once" needs a test that does it twice.** A test that refunds or pays once is not linked to "only once" or "twice still makes one". Test names are read through the same glossary as requirements ("only one" means no duplicates).
- **"두 번 눌러도"** (even if pressed twice) is a scene, not a limit of two. A duplicate check inside the function (`if (existing) return existing`) is the evidence.
- **Coupon amounts** (`FLAT_COUPON = 5000`) are read as settings and as money. "Checked out" and "checkout" are the same word.
- **How far to trust it.** On 20 new cases written after these changes (not seen while fixing), 0.14.0 gave the expected verdict for 11 with keywords and 12 without, calling wrong code Verified 5 times. 0.15.0 gave 18 and 18 with no wrong verdict. On the 20 cases written from the X bugs before the changes (seen while fixing), 0.14.0 gave 15 and 15 with 2 wrong Verified, and 0.15.0 gives 19 and 20. All 625 cases run with the tests and none gets a wrong verdict. The other 18 case sets give the same output as 0.14.0, and the fixed open-source set is unchanged.
- Still not judged: whether a formula is right (a flat coupon computed as a percentage). It stays Not verified unless a linked test fails. See [docs/known-mistakes.md](https://github.com/DamunKorea/verifylens/blob/main/docs/known-mistakes.md).

## 0.14.0

Less to read, more to act on. A reader on OKKY wrote that even with a review service, checking its results was what slowed them down.

- **The PR summary opens only what needs a fix.** Different and Failed requirements are on top, with when the code acts, failed tests and the values to test. The rest is folded:
  - **Worth a look**: Not verified because the code or the wording needs a check (an unclear edge, another condition, no evidence), and unresolved calls.
  - **The other requirements**: Verified ones, and the ones Not verified only because no test ran.
  - With nothing Different or Failed, the body is one line. The GitHub Action writes the same summary to the job page.
- **The requirements panel does the same.** Different and Failed first, then the ones worth a look. Verified and test-only ones are folded under "Other".
- **Values to test at the boundary**, taken from the numbers in the requirement without an LLM. "Lock after 5 failures" gives the 4th and 5th time, "at least 8 characters" gives 7 and 8, "3만 원 이상" gives 29,999 and 30,000, and "3 to 20 characters" gives 2, 3, 20 and 21. They appear in the PR summary, the hover and the agent hook's message, so a test written for the fix checks the right attempt. A rate on its own ("1%") and a counting window ("per minute") give none.
- **Agent hooks** are in a release for the first time: `ci --hook claude|cursor` asks the agent once to fix a Different or Failed requirement before it says it is done, and `ci --worktree` is for git pre-commit. See the README.
- **Known mistakes in one place.** [docs/known-mistakes.md](https://github.com/DamunKorea/verifylens/blob/main/docs/known-mistakes.md) lists every wrong verdict found so far, with the version that fixed it, and what is not read yet.
- **Verdicts are unchanged.** All 18 case sets, with and without keywords, give the same output as 0.13.0. The fixed open-source set is unchanged: 11 of 11 read, 10 of 11 changes caught, 0 changed code called Verified.

## 0.13.0

Fewer wrong verdicts caused by other lines and other files. Found by trying VerifyLens the way a developer would — three usability trials by our promo session on the try page and on two multi-file repositories, not user reports — and then by new cases.

- **A line that only shares a number or a unit with the requirement is no longer evidence.**
  - A string's length is not a count, and a list's length is not a number of characters. "Password reset mail can be sent at most 3 times a day" was matched to `pw.length < 8` in the same file and called correct code Different.
  - A name that shares only a time unit or "age" is evidence only when the code around it names the same thing. Before, `LOCK_MINUTES = 15` in another file made "login tokens expire after 15 minutes" Verified, and a sign-up form's `age.min(14)` made "the free trial lasts 14 days" Verified while `TRIAL_DAYS = 7`.
  - "Only one per person" (하나만) needs a duplicate check; a condition that compares another count (`items.length > 100` in another file) is not one.
  - When the names do not overlap at all, the value must be exactly the same: `items.length > 100` is no longer read as "at most 99".
- **A whole-number tolerance no longer applies to fractions.** `POINT_RATE = 0.02`, and even `0.5`, was Verified against "1%". Now they are Different.
- **Settings with a generic name** (`maxAge`) are linked through the statement that sets them, so `session({ cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } })` is Verified for "Sessions expire after 7 days".
- **Counting first, then rejecting** (`count++; if (count > 3) throw`) allows 3. 0.12.0 said "runs at most 4 times".
- **"30일에 한 번만" and "once every 24 hours"** mean that much time must pass since the last time.
- **A test that names the first rejected attempt** ("a sixth attempt is rejected") is linked to "at most 5 times".
- **More words without keywords:** 재설정, 보낼, 하루, 입력, 바꾸, 문자 (SMS), 체험, 끝나, 하나만, tried. A function or a non-rejecting condition that covers less than half of what the requirement talks about is no longer enough evidence.
- **Wording:** `POINT_RATE = 0.01` reads "1%" instead of "0.01%". A duration string such as `'1h'` is converted from seconds instead of being shown as "2.5 days". Korean particles follow the last sound (15분으로). A rate limiter's 1-minute window is no longer described as "2 minutes".
- **Try page:** when your requirements or code no longer share a line with the example, the example's tests are removed and a note says so. On a narrow screen, a bar at the bottom shows the result and jumps to it.
- **CLI summary:** the "prototype v0" label is gone. The section listing tests not run and evidence not found is now named that, so it does not read like the Unverified count.
- **How far to trust it.** On 20 new multi-file cases written after all the changes, 0.12.0 gave the expected verdict for 19 with keywords and 13 without, calling wrong code Verified once. 0.13.0 gave 19 and 18, with no wrong verdict. The numbers for the other batches and for the trial repositories are in the release notes. They are our own cases, so read them as a regression check, not a benchmark. All 585 cases run with the tests and none gets a wrong verdict. The fixed open-source set is unchanged.

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
