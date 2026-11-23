# Wrong verdicts we found, and what is not read yet

VerifyLens decides with rules, not an LLM, so its mistakes repeat until a rule changes. This page keeps every wrong verdict we found in one place, with the version that fixed it, and the things it still cannot read. It is updated with each version. Someone asked on X whether there were any tricky false positives, and this is the answer.

The worst mistake is calling wrong code **Verified**. Calling correct code **Different** is a false alarm. Not being able to decide is **Not verified**, which is the intended result when the code or the sentence does not settle the rule.

Most of these were found by writing new cases ourselves or by trying VerifyLens the way a developer would. They are not reports from users unless the entry says so.

## Wrong code called Verified (fixed)

| Fixed in | What happened before |
|---|---|
| 0.26.0 | Our first test on real merged pull requests (three public TypeScript repositories, 49 pull requests, our own reading). Lines that are not requirements were Verified: an "Add tests for …" line from the author's to-do list, and a sentence describing the bug before the fix ("… made the request throw, so the response was 500"). A `test/` folder at the top of the repository was not read as tests, so lines in test files became evidence: in one repository, 12 of 16 Verified verdicts. Now process lines, reasons and old-bug descriptions are left out of extracted requirements, process lines are never Verified, and top-level test folders are tests. Wrong Verified on those pull requests went from 23 of 28 to 13 of 25. It is still about half: on real pull requests the evidence line is often a neighbouring condition or a default value. |
| 0.24.0 | A function with a `mailer` or `audit` parameter was Verified for "A welcome email is sent after signup" or "… is written to the audit log" even when it never called them. Now a function counts for such a requirement only if it calls something that sends or records. Found on cases we wrote while working on correct code that stayed Not verified. |
| 0.22.0 | The limits left in 0.21.0. A block that sets the state another way than `=` (`user.ban()`, `sub.state = SubState.Cancelled`, `driver.status = SUSPENDED`) was taken as the check. So was a guard that names the state only in its error message (`if (!canEdit) throw new Error('NO_PERMISSION_OR_ARCHIVED')`) and a check in a helper that nothing calls. Code with no check was then Verified. Found on cases we wrote after 0.21.0. Now, when the code has a field, constant or enum value for the sentence's state ("A banned user cannot …"), the evidence must be a condition that reads it, and checks in uncalled, unexported functions do not count. Missing checks called Verified, with and without keywords alike: the 4 known limits went from 3 to 0. On 12 cases (25 verdicts) written before the fix it went from 5 to 0, but those were seen while fixing. On 16 cases (32 verdicts) written after the fix, 0.21.0 did it 5 times and the first run none (31 of 32 right). The verdicts on all other earlier cases did not change. |
| 0.21.0 | A block that only sets a state was taken as the check for it. For "A locked account cannot log in", `if (!matches(password, account.passwordHash)) { … account.locked = true; throw … }` was Verified even with no `if (account.locked)` check anywhere. When the check was there, the evidence line was often this block instead of the check. Found on our own demo pull request. Now the condition's words count fully, words that are only inside the block count half, and words the block only sets (`= true`, `= 'closed'`) do not count. A block that sets the requirement's state without checking it is not the check. Missing checks called Verified, with and without keywords alike: on 6 cases written before the fix, 0.20.0 did it 6 times and the fixed version none. On 7 cases written after a first fix, 0.20.0 did it 6 times and the first run 2 (1 after a second fix). On 6 cases written after the second fix, 0.20.0 did it 6 times and the first run 2. The verdicts on all earlier cases did not change. |
| 0.18.0 | A check on another state was Verified: for "orders that have started shipping cannot be cancelled", code that blocks only `'delivered'` (so a shipping order can still be cancelled). The same for `'rejected'` against "only approved posts can be published" and `'refunded'` against "paid orders cannot be deleted". |
| 0.18.0 | "A gift card can be redeemed only once" was Verified for `if (!card) throw new Error('NOT_FOUND')`: the word "found" in the error name was read as "already there". Error names now count only strong words (already, taken, duplicate, exists, used), and not after NOT_. Found on the first run of the last batch; fixed before release. |
| 0.18.0 | With keywords, widening which tests are linked made a lockout test ("locks the account after 5 consecutive failures") verify "a locked account cannot log in". This appeared while 0.18.0 was being made; the change was taken back. |
| 0.17.0 | In a file named for the requirement (`signup.ts`), the email check in `subscribe` made "sign-up rejects an invalid email" Verified while `signup` checks nothing. Found by our promotion team on the try page, not a user report. |
| 0.17.0 | "~할 수 없다" was not read as a rejection rule, so for "만료된 쿠폰은 선물할 수 없다" a gift function without the check was Verified when the apply function had one. |
| 0.17.0 | A shared check counted for every feature: `assertValidEmail` called only by `subscribe` verified "registration rejects an invalid email". |
| 0.17.0 | `WishlistService.add` checking stock verified "out-of-stock items cannot be added to the cart" while `CartService.add` did not. Found on the first run of the last batch; fixed before release. |
| 0.17.0 | "At most 3 invites per day" was Verified for `if (sent.length >= 3)`, which counts every invite ever sent. It is now Not verified: "no time window". |
| 0.17.0 | "A customer can request a refund at most twice per order" was Verified for `refunds.length > 2`, which allows three: "twice" was not read as 2. |
| 0.17.0 | `owned > 3` after `const owned = await db.workspace.count(…)` was Verified for "at most 3 workspaces", although it allows 4. |
| 0.17.0 | With keywords, a test that does it once ("adds a member to the team") was linked to "a team can have at most 10 members", so the limit was Verified with no test of it. While 0.17.0 was being made the same happened to an hourly mail limit; fixed before release. |
| 0.16.0 | Code that computes a fixed discount as a percentage (`total * (1 - v / 100)` in the `fixed` branch) was Verified when a test for it passed. |
| 0.16.0 | A check in a function for another action counted: `getFile` checks the id, so "deleting a file with an invalid id is rejected" was Verified while `deleteFile` checks nothing. |
| 0.16.0 | With keywords, a happy-path test ("saves a profile with a homepage") was linked to a rejection rule. This appeared while 0.16.0 was being made; fixed before release. |
| 0.15.0 | A check in a function for another feature counted. With no email check in sign-up, the newsletter's email check made "sign-up rejects an invalid email" Verified. The same happened with a refund (a cancel check), a verification code (a profile phone check) and a duplicate sign-up (a newsletter duplicate check). Found from real bugs someone shared on X. |
| 0.15.0 | A schema that takes `email: z.string()` without `.email()` was Verified for "invalid email addresses are rejected" because another file checks emails. |
| 0.15.0 | A test that does it only once ("refunds a paid order") was linked to "an order can be refunded only once". |
| 0.13.0 | `LOCK_MINUTES = 15` in another file made "login tokens expire after 15 minutes" Verified. |
| 0.13.0 | A sign-up form's `age.min(14)` made "the free trial lasts 14 days" Verified while `TRIAL_DAYS = 7`. |
| 0.13.0 | `POINT_RATE = 0.02`, and even `0.5`, was Verified against "1%": a whole-number tolerance was applied to fractions. |
| 0.13.0 | A list's length was read as a number of characters. This appeared while 0.13.0 was being made; 0.12.0 had it too. Fixed before release. |
| 0.12.0 | A function that never checks for a duplicate was Verified for "only once per person". |
| 0.12.0 | `RETURN_FEE = 3000` was taken as evidence for "the shipping fee is 3,000 won". The 0.12.0 changes caused it on the way; fixed before release. |
| 0.12.0 | `TAX_RATE = 0.05` was taken as evidence for a 5% point rate. |
| 0.11.0 | `stock < 0` was Verified for "blocked when the stock is 0", although it does not block 0. |
| 0.10.0 | Sign-up rules that need a check ("must accept the terms") were Verified when only the function name matched. |
| 0.9.0 | nanoid writes the default length 21 in two functions. Changing one to 45 stayed Verified because the other 21 was still there. |
| 0.8.0 | Range wording such as "up to and including" or "no more than" was misread, so a wrong boundary could be Verified. |
| 0.7.0 | Numbers other than a retry count were not compared: `total > 50000` was Verified for "50000 or more". |

## Correct code called Different (fixed)

| Fixed in | What happened before |
|---|---|
| 0.18.0 | "Trial users get a reminder 3 days before the trial ends" was read as "at least 3 days", so `daysLeft === 3` was Different. A reminder or email N days before or after is now read as that day. A deadline ("2시간 전까지") and an expiry after sending stay as they were. |
| 0.17.0 | A count kept in a variable before adding (`const count = await db.comment.count(…)`, then `count >= 10`, then `create`) was read as including the new one, so correct code for "at most 10 a day" was Different. |
| 0.17.0 | A first rule for time windows matched too widely and made "3하루로 설정됨" false alarms in older sets. It was replaced before release. |
| 0.15.0 | Without keywords, a 5,000 won flat coupon was compared with a 50,000 won free-shipping line in another file. |
| 0.13.0 | "Password reset mail can be sent at most 3 times a day" was matched to `pw.length < 8` in the same file. |
| 0.13.0 | Counting first and then rejecting (`count++; if (count > 3) throw`) was read as allowing 4. |
| 0.12.0 | "Orders under 10,000 won are not accepted" was not read as a refusal, so `total < 10000` that throws was Different. |
| 0.11.0 | Counting a filtered list (`attempts.filter(...)` and then `push`) was read as one short. |

## Not read yet

These stay Not verified, or show a weaker evidence line. Add `| keywords: ...` to the requirement to point it at the right code.

- A JSX attribute such as `maxLength={20}`.
- "한도" (limit) is not read as an upper bound.
- A cap inside `Math.min(x ?? 20, 100)`, such as a page size.
- Wording that names the edge separately: "3분 초과부터 해당", "14세 미만까지 해당".
- When `expiresIn` of a JWT cannot be read, the evidence line can come from another file.
- "Only admins" shows the reason "whole function" instead of "extra condition".
- Without keywords, a rate limit can be linked to a retry file, and English sentences sometimes pick a weaker evidence line.
- On real pull requests (0.26.0 test), about half of the Verified verdicts stand on the wrong line: a neighbouring condition, another function, or a default value such as `timeout: options.timeout ?? 10_000`. Summary headings from review bots ("Bug Fixes"), test result lines ("75 passed") and design notes are still taken as requirements.
- TypeScript type requirements ("A type error when …") are not read. They say "type-level requirement, not readable".
- A time window written another way than a time difference, a calendar check (`isSameDay`, `getMonth() ===`), `startOfDay` / `subHours`, or a name such as `today` / `recent`.
- "Once a day" written as a list filtered to today (`today.length >= 1`) stays Not verified.
- Rounding (`Math.floor` vs `Math.round`) is not judged, and a rate written inline (`total * 0.01`) is not read as "1%".
- Times of day ("밤 10시부터 아침 8시 전까지") are not read.
- A check on another state or role (`'delivered'` for "shipping started", `'viewer'` for "only the owner") is Not verified, not Different.
- "Two bookings that overlap in time" is read as a duplicate rule, but an overlap check (`b.start < end && start < b.end`) is not recognised as one yet.
- With keywords, a check in the right function stays Not verified when the keywords do not cover the test name.
- class-validator decorators other than the format checks, `@Length`, `@MinLength` / `@MaxLength` and `@Min` / `@Max`.
- Formulas are judged only for a fixed-amount branch (`if`, a ternary, `switch` or an object of functions named `fixed` / `flat` / `amount`). Other formulas are not judged.
- Without keywords, some duplicate checks (`answers.some(...)`, a sent-id list) stay Not verified because the test name does not cover enough of the sentence. There are fewer since 0.17.0 (an idempotency key, "the same coupon again").
- "5점 이하" (at most 5 points) reads 점 as a count, so a rating check (`rating > 10`) is not used as evidence. Wrong code is Not verified rather than Different.
- Keywords that do not cover the variable in the condition (`예약, 취소` or `booking, cancel` against `hoursLeft < 24`) leave the number unfound. Leaving the keywords out works.
- Wrong code still called Verified (since 0.24.0's first run; 0.23.0 did the same): "Archived projects are hidden from the project list" with no filter, because the function name matches; "The audit log keeps the id of the user who changed a setting" when the entry leaves the user out.
- A duration added to a date (`signedUpAt + 14 * DAY_MS`) is not read, an allow-list kept in a constant (`ALLOWED_TYPES.includes(file.type)`) is not read as the check, and "stored in lowercase" or "sorted by relevance" can stay Not verified.
- A helper called through a list (`for (const check of [ensureNotExpired]) check(invite)`) is not followed, so the requirement stays Not verified. Uncalled class methods and exported helpers are not recognised as uncalled (since 0.22.0 an uncalled, unexported function is). The rule that a check must read the state the code names (since 0.22.0) reads English sentences only. When the code names the state (`disabled`) but the check reads another word (`!key.enabled`), the requirement stays Not verified.
- Korean keywords are read through the glossary since 0.20.0 (before, they matched nothing). Two correct cases with Korean keywords still stay Not verified: free shipping from ₩50,000 with `배송비, 무료`, and a single-use coupon with `쿠폰, 사용`.

## Tests changed in this change (since 0.19.0)

This is a note next to the verdict, not a verdict. What it gets wrong:

- **False alarm:** moving an assertion into a helper function (`expectLockedAfter(5)`) reads as "1 fewer check".
- **Missed:** a changed test is shown only when the test is linked to the requirement. In 0.19.0, a Korean test name with Korean keywords (「잠금」 against 「잠근다」) was not linked, so its change was not shown. Since 0.20.0, Korean keywords are read through the glossary and that case is shown. A test name that shares nothing with the requirement is still missed.
- **Not compared:** parameterised tests (`it.each`), snapshot files, and tests whose name is built at run time.
- **Found on the way and fixed before release:** renaming input values inside `expect(...)` (`'fig'` → `'jam'`) was shown as a changed expected value. Only values in the expected part, and numbers anywhere, count now.

## Always true

- TypeScript and JavaScript only.
- Whether the condition sits on the right code path is not proven. Other logic errors are caught only when a linked test fails.
- The numbers in the release notes come from cases we wrote ourselves. Read them as a regression check, not as accuracy. The fixed open-source set is in [benchmark.md](benchmark.md).

---

## 한국어

VerifyLens 는 LLM 이 아니라 규칙으로 판단해서, 규칙을 고치기 전까지는 같은 실수를 되풀이합니다. 지금까지 찾은 틀린 판정을 고친 판과 함께 한곳에 모으고, 아직 못 읽는 것도 적습니다. 판마다 고칩니다. X 에서 「까다로운 오탐이 있었냐」는 질문을 받아 만든 쪽입니다.

가장 나쁜 실수는 틀린 코드를 **「확인됨」** 이라고 하는 것입니다. 맞는 코드를 **「다름」** 이라고 하는 것은 거짓 경보입니다. 코드나 문장으로 정할 수 없으면 **「미확인」** 으로 두는 것이 원래 뜻입니다.

대부분은 우리가 새 사례를 쓰거나 개발자처럼 직접 써 보며 찾았습니다. 따로 적지 않은 것은 사용자 제보가 아닙니다.

### 틀린 코드를 「확인됨」이라고 한 것 (고침)

| 고친 판 | 전에 있던 일 |
|---|---|
| 0.26.0 | 실제 병합 PR 로 처음 시험함(공개 TypeScript 저장소 셋, PR 49개, 판단은 우리가 직접). 요구사항이 아닌 줄이 「확인됨」: PR 을 올린 사람의 할 일(「Add tests for …」)과 고치기 전 버그를 설명한 문장(「… made the request throw, so the response was 500」). 저장소 맨 위의 `test/` 폴더를 테스트로 알아보지 못해 테스트 파일의 줄이 근거가 됨: 한 저장소에서 「확인됨」 16개 가운데 12개. 이제 절차 · 까닭 · 예전 버그 설명은 요구사항 뽑기에서 빠지고, 절차 줄은 「확인됨」이 되지 않으며, 맨 위의 test/ · tests/ 도 테스트 폴더로 본다. 그 PR 들에서 틀린 「확인됨」이 28개 중 23개에서 25개 중 13개가 됨. 아직 절반쯤은 근거 줄이 옆 조건 · 기본값 줄이다. |
| 0.24.0 | 「가입하면 환영 메일을 보낸다」 · 「… 감사 기록에 남긴다」에 `mailer` · `audit` 매개변수가 있다는 것만으로, 부르지도 않는 함수가 「확인됨」. 이제 보내거나 남기는 것을 부르는 함수만 근거로 봄. 맞는 코드가 미확인으로 남는 것을 고치려고 쓴 사례에서 찾음 |
| 0.22.0 | 0.21.0 에 남았던 한계. `=` 가 아닌 방법으로 상태를 정하는 블록(`user.ban()` · `sub.state = SubState.Cancelled` · `driver.status = SUSPENDED`), 상태 낱말이 오류 글에만 있는 막기(`if (!canEdit) throw new Error('NO_PERMISSION_OR_ARCHIVED')`), 아무도 부르지 않는 도우미 함수의 검사를 검사로 봐서, 검사 없는 코드가 「확인됨」. 0.21.0 뒤에 쓴 사례에서 찾음. 이제 문장의 상태(「A banned user cannot …」)를 코드가 칸 · 상수 · 열거형 값으로 가지고 있으면 그 이름을 읽는 조건만 근거로 보고, 내보내지 않았고 아무도 부르지 않는 함수의 검사는 세지 않음. 검사 없는 코드를 「확인됨」이라 한 수(키워드 있음 · 없음 같음): 알려진 한계 4개 3번 → 0번. 고치기 전에 쓴 사례 12개(판정 25개) 5번 → 0번(고치면서 본 것). 고친 뒤 처음 쓴 사례 16개(판정 32개) — 0.21.0 5번, 첫 결과 0번(판정 32개 중 31개 맞음). 다른 예전 사례의 판정은 바뀌지 않음 |
| 0.21.0 | 상태를 정하기만 하는 블록을 그 상태의 검사로 봄. 「잠긴 계정은 로그인할 수 없다」에 `if (!matches(password, account.passwordHash)) { … account.locked = true; throw … }` 가 있으면, `if (account.locked)` 검사가 아무 데도 없어도 「확인됨」. 검사가 있을 때도 근거 줄이 검사 대신 이 블록으로 잡힐 때가 많았음. 우리 데모 PR 에서 찾음. 이제 조건식 낱말은 온전히, 블록 안에만 있는 낱말은 반만, 블록이 정하기만 하는 낱말(`= true` · `= 'closed'`)은 세지 않고, 요구사항의 상태를 보지 않고 정하기만 하는 블록은 검사로 보지 않음. 검사 없는 코드를 「확인됨」이라 한 수(키워드 있음 · 없음 같음): 고치기 전에 쓴 사례 6개 — 0.20.0 6번, 고친 판 0번. 첫 수정 뒤 처음 쓴 7개 — 0.20.0 6번, 첫 결과 2번(두 번째 수정 뒤 1번). 두 번째 수정 뒤 처음 쓴 6개 — 0.20.0 6번, 첫 결과 2번. 예전 사례의 판정은 하나도 바뀌지 않음 |
| 0.18.0 | 다른 상태를 보는 조건이 「확인됨」: 「배송이 시작된 주문은 취소할 수 없다」에 `'delivered'` 만 막는 코드(배송 중에는 취소됨). 「승인된 글만 공개」에 `'rejected'` 만 막기, 「결제가 끝난 주문은 삭제할 수 없다」에 `'refunded'` 만 막기도 같았음 |
| 0.18.0 | 「기프트 카드는 한 번만 쓸 수 있다」에 `if (!card) throw new Error('NOT_FOUND')` 가 「확인됨」: 오류 이름의 found 를 「이미 있음」으로 읽음. 이제 오류 이름에서는 강한 낱말(already · taken · duplicate · exists · used)만, NOT_ 뒤가 아닐 때만 셈. 마지막 묶음 첫 결과에서 찾아 공개 전에 고침 |
| 0.18.0 | 키워드가 있을 때 검사 잇기를 넓혔더니 잠금 검사(「5번 실패하면 잠근다」)가 「잠긴 계정은 로그인할 수 없다」를 「확인됨」으로 만듦. 0.18.0 을 만들던 중 생겼고 그 변경을 되돌림 |
| 0.17.0 | 요구사항 이름의 파일(`signup.ts`) 안에서 `subscribe` 의 이메일 검사로, `signup` 은 검사하지 않는데 「이메일이 틀리면 가입 거부」가 「확인됨」. 우리 홍보 세션이 체험 페이지에서 찾음(사용자 제보 아님) |
| 0.17.0 | 「~할 수 없다」를 막는 규칙으로 읽지 못해, 「만료된 쿠폰은 선물할 수 없다」에 검사 없는 선물 함수가 쿠폰 적용 함수의 검사 때문에 「확인됨」 |
| 0.17.0 | 함께 쓰는 검사 함수를 모든 기능의 근거로 씀: `subscribe` 만 부르는 `assertValidEmail` 로 「가입 시 잘못된 이메일 거부」가 「확인됨」 |
| 0.17.0 | `WishlistService.add` 의 재고 검사로, `CartService.add` 는 검사하지 않는데 「재고 없는 상품은 장바구니에 담을 수 없다」가 「확인됨」. 마지막 묶음 첫 결과에서 찾아 공개 전에 고침 |
| 0.17.0 | 「하루에 초대는 3번까지」에 지금까지 보낸 초대를 전부 세는 `if (sent.length >= 3)` 이 「확인됨」. 이제 「미확인 · 기간 안에서 세는지 못 찾음」 |
| 0.17.0 | 「환불 요청은 주문마다 최대 두 번(twice)」에 세 번까지 되는 `refunds.length > 2` 가 「확인됨」. twice 를 2로 읽지 못함 |
| 0.17.0 | `const owned = await db.workspace.count(…)` 뒤 `owned > 3` 이 「워크스페이스는 3개까지」에 「확인됨」. 실제로는 4개까지 됨 |
| 0.17.0 | 키워드가 있으면 한 번 하는 검사(「팀에 멤버를 넣는다」)를 「팀은 최대 10명」에 이어, 한도를 시험한 적 없는데 「확인됨」. 0.17.0 을 만들던 중 한 시간 메일 한도에도 같은 일이 생겼고 공개 전에 고침 |
| 0.16.0 | 정액 할인을 비율로 계산하는 코드(`fixed` 갈래의 `total * (1 - v / 100)`)가 그 검사가 통과하면 「확인됨」 |
| 0.16.0 | 다른 동작의 함수에 있는 검사를 근거로 씀: `getFile` 이 id 를 검사해서, `deleteFile` 은 아무것도 검사하지 않는데 「잘못된 id 로 파일 삭제는 거부」가 「확인됨」 |
| 0.16.0 | 키워드가 있으면 성공만 보는 검사(「홈페이지가 있는 프로필을 저장한다」)를 거부 규칙에 이음. 0.16.0 을 만들던 중에 생겼고 공개 전에 고침 |
| 0.15.0 | 다른 기능의 함수에 있는 검사를 근거로 씀. 가입에는 이메일 검사가 없는데 뉴스레터의 검사 때문에 「잘못된 이메일이면 가입 거부」가 「확인됨」. 환불(취소의 검사) · 인증 문자(프로필의 번호 검사) · 중복 가입(뉴스레터의 중복 검사)도 같았음. X 에서 받은 실제 버그로 찾음 |
| 0.15.0 | `.email()` 없이 `email: z.string()` 으로 받는 스키마가, 다른 파일의 검사 때문에 「잘못된 이메일은 거부」에 「확인됨」 |
| 0.15.0 | 한 번만 하는 검사(「결제한 주문을 환불한다」)를 「한 번만 환불할 수 있다」에 이음 |
| 0.13.0 | 다른 파일의 `LOCK_MINUTES = 15` 때문에 「로그인 토큰은 15분 뒤 만료」가 「확인됨」 |
| 0.13.0 | 가입 양식의 `age.min(14)` 때문에, `TRIAL_DAYS = 7` 인데 「무료 체험 14일」이 「확인됨」 |
| 0.13.0 | `POINT_RATE = 0.02`(0.5 도)가 「1%」로 「확인됨」 — 정수 ±1 허용이 소수 비율에도 걸림 |
| 0.13.0 | 목록 길이를 글자 수로 읽음. 0.13.0 을 만들던 중에 드러났고 0.12.0 에도 있던 것. 공개 전에 고침 |
| 0.12.0 | 중복을 확인하지 않는 함수가 「한 사람당 한 번만」에 「확인됨」 |
| 0.12.0 | `RETURN_FEE = 3000` 을 「배송비 3,000원」의 근거로 씀. 0.12.0 을 고치던 중에 생겼고 공개 전에 고침 |
| 0.12.0 | `TAX_RATE = 0.05` 를 「포인트 5% 적립」의 근거로 씀 |
| 0.11.0 | `stock < 0` 이 「재고가 0이면 막는다」에 「확인됨」 (0 을 막지 못함) |
| 0.10.0 | 확인 조건이 있어야 하는 가입 규칙(「약관에 동의해야」)이 함수 이름만 맞아도 「확인됨」 |
| 0.9.0 | nanoid 는 기본 길이 21 이 두 함수에 따로 있어, 한쪽을 45 로 바꿔도 남은 21 때문에 「확인됨」 |
| 0.8.0 | 「up to and including」 「no more than」 같은 범위 표현을 잘못 읽어 틀린 경계가 「확인됨」이 될 수 있었음 |
| 0.7.0 | 재시도 횟수가 아닌 숫자는 비교하지 않음: `total > 50000` 이 「50000 이상」에 「확인됨」 |

### 맞는 코드를 「다름」이라고 한 것 (고침)

| 고친 판 | 전에 있던 일 |
|---|---|
| 0.18.0 | 「체험 종료 3일 전에 알림」을 「3일 이상」으로 읽어 `daysLeft === 3` 을 「다름」. 이제 알림 · 메일을 N일 전 · 뒤에 보낸다는 말은 그날로 읽음. 마감(「2시간 전까지」)과 보낸 뒤 만료는 그대로 |
| 0.17.0 | 더하기 전에 변수에 담은 개수(`const count = await db.comment.count(…)` 뒤 `count >= 10`, 그다음 `create`)를 새것까지 센 값으로 읽어, 「하루 10개까지」의 맞는 코드를 「다름」 |
| 0.17.0 | 처음 만든 시간 창 규칙이 너무 넓게 걸려 예전 묶음에 「3하루로 설정됨」 거짓 경보가 생김. 공개 전에 바꿈 |
| 0.15.0 | 키워드 없이 쓰면 5,000원 정액 쿠폰을 다른 파일의 5만 원 무료 배송 줄과 견줌 |
| 0.13.0 | 「비밀번호 재설정 메일은 하루 3번까지」를 같은 파일의 `pw.length < 8` 에 붙임 |
| 0.13.0 | 먼저 세고 막는 코드(`count++; if (count > 3) throw`)를 4번까지 허용으로 읽음 |
| 0.12.0 | 「1만 원 미만 주문은 받지 않는다」를 거부 문장으로 못 읽어, 막는 `total < 10000` 을 「다름」 |
| 0.11.0 | 걸러 낸 목록의 개수(`attempts.filter(...)` 뒤 `push`)를 하나 모자라게 읽음 |

### 아직 못 읽는 것

「미확인」으로 남거나 근거 줄이 덜 맞을 수 있습니다. 요구사항 끝에 `| keywords: ...` 를 붙이면 맞는 코드로 이을 수 있습니다.

- JSX 속성 `maxLength={20}`
- 「한도」를 상한으로 읽기
- `Math.min(x ?? 20, 100)` 안의 상한(페이지 크기 등)
- 끝값을 따로 말하는 표현: 「3분 초과부터 해당」 「14세 미만까지 해당」
- JWT 의 `expiresIn` 값을 못 읽으면 다른 파일 줄이 근거로 나올 수 있음
- 「관리자만」의 이유가 「조건이 더 있음」 대신 「함수 전체」로 나옴
- 키워드 없이 쓰면 요청 횟수 제한이 재시도 파일에 이어질 수 있고, 영어 문장에서 근거 줄을 덜 맞게 고를 때가 있음
- 실제 PR 에서는(0.26.0 시험) 「확인됨」의 절반쯤이 틀린 줄을 근거로 삼음: 옆 조건 · 다른 함수 · `timeout: options.timeout ?? 10_000` 같은 기본값 줄. 리뷰 봇의 요약 머리말(「Bug Fixes」) · 테스트 결과 줄(「75 passed」) · 설계 메모는 아직 요구사항으로 뽑힘
- TypeScript 타입 요구사항(「A type error when …」)은 읽지 못함. 이유 「타입 요구사항 — 읽지 못함」으로 나옴
- 시각 차이 · 달력 비교(`isSameDay` · `getMonth() ===`) · `startOfDay` / `subHours` · `today` / `recent` 같은 이름이 아닌 다른 방법으로 쓴 시간 창
- 오늘 것만 거른 목록으로 쓴 「하루에 한 번」(`today.length >= 1`)은 「미확인」으로 남음
- 반올림(`Math.floor` · `Math.round`)은 판단하지 않고, 식 안의 비율(`total * 0.01`)은 「1%」로 읽지 않음
- 하루 중 시각(「밤 10시부터 아침 8시 전까지」)은 읽지 않음
- 다른 상태 · 역할을 보는 조건(「배송 시작」에 `'delivered'`, 「소유자만」에 `'viewer'`)은 「다름」이 아니라 「미확인」
- 「겹치는 시간에 두 번 예약할 수 없다」는 중복 막기로 읽지만, 겹침 검사(`b.start < end && start < b.end`)는 아직 그 검사로 알아보지 못함
- 키워드가 검사 이름을 덮지 못하면, 맞는 함수에 검사가 있어도 「미확인」으로 남음
- class-validator 데코레이터 가운데 형식 검사 · `@Length` · `@MinLength` / `@MaxLength` · `@Min` / `@Max` 가 아닌 것
- 계산식은 정액 갈래(`if` · 삼항식 · `switch` · `fixed` / `flat` / `amount` 라는 이름의 함수 객체)만 판단함. 다른 계산식은 판단하지 않음
- 키워드 없이 쓰면 일부 중복 막기(`answers.some(...)`, 보낸 id 목록)는 검사 이름이 문장을 충분히 담지 못해 「미확인」으로 남음. 0.17.0 에서 줄었음(결제 요청 키 · 「같은 쿠폰을 다시」)
- 「5점 이하」의 점을 개수로 읽어서 평점 조건(`rating > 10`)을 근거로 쓰지 못함. 틀린 코드가 「다름」이 아니라 「미확인」
- 키워드가 조건의 변수 이름을 덮지 않으면(`예약, 취소` 나 `booking, cancel` ↔ `hoursLeft < 24`) 숫자를 못 찾음. 키워드를 빼면 찾음
- 아직 틀린 코드를 「확인됨」이라고 하는 것(0.24.0 첫 결과, 0.23.0 도 같음): 「보관한 프로젝트는 목록에서 숨긴다」인데 거르지 않는 코드(함수 이름이 맞아서), 「설정을 바꾼 사람의 id 를 감사 기록에 남긴다」인데 기록에 사람이 빠진 코드
- 날짜에 기간을 더하는 식(`signedUpAt + 14 * DAY_MS`)은 읽지 않고, 상수에 둔 허용 목록(`ALLOWED_TYPES.includes(file.type)`)은 검사로 읽지 않으며, 「소문자로 저장」 · 「관련도 높은 순 정렬」은 미확인으로 남을 수 있음
- 목록에 넣어 부르는 도우미(`for (const check of [ensureNotExpired]) check(invite)`)는 따라가지 못해 「미확인」으로 남음. 부르지 않는 클래스 메서드와 내보낸 도우미는 「부르지 않음」으로 알아보지 못함(내보내지 않은 함수는 0.22.0 부터 알아봄). 코드가 가진 상태 이름을 검사가 읽어야 한다는 규칙(0.22.0)은 영어 문장만 읽음. 코드가 상태를 한 이름(`disabled`)으로 가지는데 검사는 다른 낱말(`!key.enabled`)을 읽으면 「미확인」으로 남음
- 한국어 키워드는 0.20.0 부터 용어집으로 읽음(전에는 아무 데도 안 이어짐). 맞는 코드인데 「미확인」으로 남는 것 둘: `배송비, 무료` 의 5만원 이상 무료 배송, `쿠폰, 사용` 의 한 번만 쓰는 쿠폰

### 이번 변경에서 바뀐 검사 (0.19.0 부터)

판정이 아니라 판정 옆에 붙는 알림입니다. 틀리는 것:

- **헛경보:** 확인 줄을 도우미 함수로 옮긴 정리(`expectLockedAfter(5)`)를 「확인 줄 1개 줄어듦」으로 봄
- **놓침:** 요구사항에 이어진 검사만 보여 줌. 0.19.0 에서는 한국어 키워드와 한국어 검사 이름(「잠금」과 「잠근다」)이 이어지지 않아 바뀐 것이 안 보였음. 0.20.0 부터 한국어 키워드를 용어집으로 읽어 그 사례는 보임. 요구사항과 겹치는 것이 하나도 없는 검사 이름은 여전히 놓침
- **견주지 않음:** 매개변수 검사(`it.each`), 스냅샷 파일, 실행할 때 이름을 만드는 검사
- **만들던 중 찾아 공개 전에 고침:** `expect(...)` 안의 입력 값 이름만 바꾼 것(`'fig'` → `'jam'`)을 기대값이 바뀐 것으로 보임. 이제 기대값 자리의 값과, 어디서든 바뀐 숫자만 셈

### 늘 그런 것

- TypeScript · JavaScript 만 봅니다.
- 조건이 맞는 실행 경로에 있는지는 증명하지 않습니다. 다른 논리 오류는 연결된 검사가 실패할 때만 잡힙니다.
- 릴리스 노트의 숫자는 우리가 쓴 사례에서 나온 것이라 정확도가 아니라 회귀 시험입니다. 공개 코드 고정 묶음은 [benchmark.md](benchmark.md) 에 있습니다.
