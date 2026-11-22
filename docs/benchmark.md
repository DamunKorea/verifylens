# How each version is measured

Every release is run against the same fixed set, so the numbers can be compared from one version to the next. The idea came from a reader's comment on OKKY.

## 1. Fixed set of open-source code

Eleven documented rules from six public projects, each pinned to one commit (listed in [`vscode/test/cases/real.ts`](../vscode/test/cases/real.ts)):

| Project | Commit | Rules |
|---|---|---|
| [validator.js](https://github.com/validatorjs/validator.js) | `9ff3424` | email at most 254 characters · local part at most 64 bytes · each domain label at most 63 · strong password at least 8 · port at most 65535 |
| [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit) | `f2fbded` | default window 1 minute · default limit 5 requests |
| [p-retry](https://github.com/sindresorhus/p-retry) | `ac3c4cd` | 10 retries by default |
| [ky](https://github.com/sindresorhus/ky) | `3541888` | 2 retries by default |
| [helmet](https://github.com/helmetjs/helmet) | `e91d88f` | HSTS max age 365 days |
| [nanoid](https://github.com/ai/nanoid) | `055d170` | default ID length 21 |

For each rule:

1. The original code should be **Verified**.
2. One deliberate change (flip `>` and `>=`, or change the number) should **not** be Verified. Different is the goal; Unverified is acceptable.

| Version | Original code read correctly | Changes caught as Different | Changed code still called Verified |
|---|---|---|---|
| 0.7.0 | 11 / 11 | 10 / 11 | 1 (nanoid) |
| 0.8.0 | 11 / 11 | 10 / 11 | 1 (nanoid) |
| 0.9.0 | 11 / 11 | 10 / 11 | **0** (nanoid is now Unverified: "conflicting values") |
| 0.10.0 | 11 / 11 | 10 / 11 | 0 |
| 0.11.0 | 11 / 11 | 10 / 11 | 0 |
| 0.12.0 | 11 / 11 | 10 / 11 | 0 |
| 0.13.0 | 11 / 11 | 10 / 11 | 0 |
| 0.14.0 | 11 / 11 | 10 / 11 | 0 |
| 0.15.0 | 11 / 11 | 10 / 11 | 0 |
| 0.16.0 | 11 / 11 | 10 / 11 | 0 |
| 0.17.0 | 11 / 11 | 10 / 11 | 0 |
| 0.18.0 | 11 / 11 | 10 / 11 | 0 |

The nanoid miss: the default length 21 is written in two functions. Changing one to 45 left the other 21 in place, and that was enough for "Verified". Since 0.9.0 a second setting with the same name and a different value makes the result Unverified.

To run it: clone each project at the commit above into one folder, then from `vscode/` run `node test/cases/real.ts <that folder>`.

## 2. Case sets written for the tests

845 small cases in [`vscode/test/cases/`](../vscode/test/cases/). They are written by us, so they are a regression check, not a benchmark. The most useful number is the **first run of a batch written after the rules were changed**, before fixing anything it reveals; see the release notes of each version.

Every wrong verdict found so far, and what is not read yet, is listed in [known-mistakes.md](known-mistakes.md).

## 3. How often it says Not verified

Someone on X asked how often VerifyLens ends up saying Not verified. This is not an accuracy number. It shows how the three verdicts split, in two places.

**On the 845 cases we wrote** (0.18.0; with keywords / without). We fixed the rules while looking at these, so they look better than real code will:

| The code in the case | Verified | Different | Not verified |
|---|---|---|---|
| right (400) | 371 / 376 | 0 / 0 | 29 / 24 (about 6–7%) |
| wrong (292) | 0 / 0 | 278 / 275 | 14 / 17 |
| nothing to judge by (153) | 0 / 0 | 0 / 0 | 153 / 153 |

**On rules it had not seen** (first run of a batch written in new areas, before fixing): of 20 cases with right code, 0.17.0 called 10 Verified with keywords and 11 without; most of the rest were Not verified. On rules of a new kind, expect about half of correct code to stay Not verified at first.

**Since 0.24.0** we worked on that number. On 16 cases with right code, written after the 0.24.0 fix in areas we had not covered (403 and 409 responses, sending and recording, sorting, defaults, a check in another file, Korean sentences), the first run called 15 Verified with keywords and 14 without. 0.23.0 called 14 and 12. In the same batch, wrong code was called Verified twice with keywords and twice without (0.23.0: 4 and 3). Both remaining cases are listed in [known mistakes](known-mistakes.md).

How often it happens on your own code is not known yet. If you try it, we would like to hear which verdicts were wrong.

---

## 한국어

판마다 같은 고정 묶음으로 재서, 이전 판과 숫자를 그대로 비교할 수 있게 합니다. OKKY 댓글에서 받은 제안입니다.

- **공개 코드 고정 묶음:** 6개 프로젝트의 문서화된 규칙 11개를 위 커밋에 고정했습니다. 원본 코드는 「확인됨」이어야 하고, 경계나 숫자를 일부러 바꾼 코드는 「확인됨」이면 안 됩니다.
- **결과:** 0.7.0과 0.8.0은 바꾼 코드 1건(nanoid)을 「확인됨」이라고 했고, 0.9.0은 0건입니다. nanoid는 기본 길이 21이 두 함수에 따로 적혀 있어, 한쪽만 바꿔도 남은 21 때문에 「확인됨」이 됐습니다. 0.9.0부터는 같은 이름의 설정값이 다르게 하나 더 있으면 「미확인 · 다른 값이 함께 있음」으로 둡니다.
- **사례 묶음 845개**는 우리가 쓴 것이라 정확도 숫자가 아니라 회귀 시험입니다.
- **「미확인」은 얼마나 자주 나오나 (X 질문):** 정확도가 아니라 세 판정이 어떻게 나뉘는지입니다. 우리가 쓴 사례 845개(0.18.0, 키워드 있음 / 없음)에서 코드가 맞는 400개 중 확인됨 371 / 376 · 미확인 29 / 24(약 6~7%), 틀린 292개 중 다름 278 / 275 · 미확인 14 / 17, 판단할 근거가 없는 153개는 모두 미확인. 이 사례를 보며 고쳤으니 실제 코드보다 좋게 나옵니다. 처음 보는 영역의 첫 결과에서는 맞는 코드 20개 중 0.17.0 이 확인됨 10 / 11 — 새로운 종류의 규칙에서는 맞는 코드도 절반쯤 「미확인」으로 남습니다. 실제 사용자 코드에서의 비율은 아직 모릅니다.
