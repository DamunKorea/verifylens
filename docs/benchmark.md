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

The nanoid miss: the default length 21 is written in two functions. Changing one to 45 left the other 21 in place, and that was enough for "Verified". Since 0.9.0 a second setting with the same name and a different value makes the result Unverified.

To run it: clone each project at the commit above into one folder, then from `vscode/` run `node test/cases/real.ts <that folder>`.

## 2. Case sets written for the tests

585 small cases in [`vscode/test/cases/`](../vscode/test/cases/). They are written by us, so they are a regression check, not a benchmark. The most useful number is the **first run of a batch written after the rules were changed**, before fixing anything it reveals; see the release notes of each version.

Every wrong verdict found so far, and what is not read yet, is listed in [known-mistakes.md](known-mistakes.md).

---

## 한국어

판마다 같은 고정 묶음으로 재서, 이전 판과 숫자를 그대로 비교할 수 있게 합니다. OKKY 댓글에서 받은 제안입니다.

- **공개 코드 고정 묶음:** 6개 프로젝트의 문서화된 규칙 11개를 위 커밋에 고정했습니다. 원본 코드는 「확인됨」이어야 하고, 경계나 숫자를 일부러 바꾼 코드는 「확인됨」이면 안 됩니다.
- **결과:** 0.7.0과 0.8.0은 바꾼 코드 1건(nanoid)을 「확인됨」이라고 했고, 0.9.0은 0건입니다. nanoid는 기본 길이 21이 두 함수에 따로 적혀 있어, 한쪽만 바꿔도 남은 21 때문에 「확인됨」이 됐습니다. 0.9.0부터는 같은 이름의 설정값이 다르게 하나 더 있으면 「미확인 · 다른 값이 함께 있음」으로 둡니다.
- **사례 묶음 585개**는 우리가 쓴 것이라 정확도 숫자가 아니라 회귀 시험입니다.
