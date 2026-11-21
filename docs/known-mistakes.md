# Wrong verdicts we found, and what is not read yet

VerifyLens decides with rules, not an LLM, so its mistakes repeat until a rule changes. This page keeps every wrong verdict we found in one place, with the version that fixed it, and the things it still cannot read. It is updated with each version. Someone asked on X whether there were any tricky false positives, and this is the answer.

The worst mistake is calling wrong code **Verified**. Calling correct code **Different** is a false alarm. Not being able to decide is **Not verified**, which is the intended result when the code or the sentence does not settle the rule.

Most of these were found by writing new cases ourselves or by trying VerifyLens the way a developer would. They are not reports from users unless the entry says so.

## Wrong code called Verified (fixed)

| Fixed in | What happened before |
|---|---|
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
- "N times an hour" when the code has no time window.
- A rule checked only by a schema's `.url()` ("an invalid website URL is rejected") and "send twice delivers once" with `if (sent.has(id)) return` stay Not verified.
- Whether a formula is right (a flat coupon computed as a percentage) is not judged. It stays Not verified unless a linked test fails.

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
- 「한 시간에 N번」인데 코드에 시간 창이 없는 경우
- 스키마의 `.url()` 로만 확인하는 규칙(「잘못된 웹사이트 주소는 거부」)과 `if (sent.has(id)) return` 으로 막는 「두 번 눌러도 한 번 보냄」은 「미확인」으로 남음
- 계산식이 맞는지(정액 쿠폰을 비율로 계산)는 판단하지 않음. 연결된 검사가 실패해야 보임

### 늘 그런 것

- TypeScript · JavaScript 만 봅니다.
- 조건이 맞는 실행 경로에 있는지는 증명하지 않습니다. 다른 논리 오류는 연결된 검사가 실패할 때만 잡힙니다.
- 릴리스 노트의 숫자는 우리가 쓴 사례에서 나온 것이라 정확도가 아니라 회귀 시험입니다. 공개 코드 고정 묶음은 [benchmark.md](benchmark.md) 에 있습니다.
