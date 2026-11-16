"""찍은 장면에 자막을 붙여 GIF 로 만든다.  python make_gif.py <out 폴더> <언어 ko|en> <결과 gif> [폭]"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont, ImageChops

out, lang, dst = sys.argv[1:4]
W = int(sys.argv[4]) if len(sys.argv) > 4 else 1000
CAP = {
    '1-code': ('AI: "Done. The account locks after 5 failed logins." (not committed yet)', 'AI: 「완료했습니다. 5회 실패하면 계정을 잠급니다.」 (아직 커밋 전)'),
    '2-checked': ('VerifyLens: only 1 of 3 requirements is verified. Line 21 acts on the 6th attempt.', 'VerifyLens: 3개 중 1개만 확인됨. 21번째 줄은 6번째 시도에 동작합니다.'),
    '3-hover': ('Hover for the evidence: the condition, the computed attempt, the executed test. No AI opinion.', '마우스를 올리면 근거가 나옵니다: 조건식, 계산한 동작 시점, 실행된 검사. AI 의견은 없습니다.'),
    '4-diff': ('One click shows what the AI changed, side by side with main.', '한 번 누르면 AI가 바꾼 부분을 main과 나란히 봅니다.'),
    '5-fix': ('Fix and save. It re-checks at once, and no longer trusts the old test result.', '고치고 저장하면 바로 다시 확인합니다. 고치기 전의 테스트 결과는 믿지 않습니다.'),
    '6-verified': ('Run the tests from the editor: R2 is verified. R3 stays "not verified": no test covers it.', '에디터에서 테스트를 돌리면 R2 확인됨. R3는 검사가 없어 「미확인」으로 남습니다.'),
    '7-summary': ('Copy the summary into the PR, so the reviewer does not redo the check.', 'PR에 붙일 검증 요약을 복사합니다. 리뷰어가 같은 확인을 다시 하지 않아도 됩니다.'),
}
ORDER = list(CAP)
HOLD = {'1-code': 2400, '2-checked': 4000, '3-hover': 4600, '4-diff': 3000, '5-fix': 2000, '6-verified': 4000, '7-summary': 4400}
TOP = 34          # 창 제목 줄 ([Extension Development Host]) 은 잘라 낸다
BAR = 64          # 자막 줄 높이 (원본 크기 기준)
font = ImageFont.truetype(r'C:\Windows\Fonts\malgunbd.ttf', 23)
small = ImageFont.truetype(r'C:\Windows\Fonts\malgunbd.ttf', 17)

frames = json.load(open(os.path.join(out, 'frames.json'), encoding='utf-8'))
by = {k: [f for f in frames if f['stage'] == k] for k in ORDER}

def compose(name, stage):
    im = Image.open(os.path.join(out, 'frames', name)).convert('RGB')
    w, h = im.size
    canvas = Image.new('RGB', (w, h - TOP + BAR), (15, 27, 48))
    canvas.paste(im.crop((0, TOP, w, h)), (0, 0))
    d = ImageDraw.Draw(canvas)
    y0 = h - TOP
    d.rectangle((0, y0, w, y0 + 3), fill=(66, 133, 232))
    n = ORDER.index(stage) + 1
    d.rounded_rectangle((20, y0 + 18, 76, y0 + 48), radius=15, fill=(66, 133, 232))
    d.text((48, y0 + 33), f'{n}/{len(ORDER)}', font=small, fill=(255, 255, 255), anchor='mm')
    d.text((92, y0 + 33), CAP[stage][0 if lang == 'en' else 1], font=font, fill=(255, 255, 255), anchor='lm')
    return canvas.resize((W, round(canvas.size[1] * W / w)), Image.LANCZOS)

seq = []   # (image, ms)
for stage in ORDER:
    fs = by[stage]
    if not fs:
        continue
    # 장면마다 마지막 화면(다 그려진 상태)에서 멈춰 읽게 한다. 깜박이는 커서 때문에 중간 화면을 다 넣으면 길어지기만 한다.
    # 「확인」과 「스스로 갱신」 장면만 바뀌기 전 화면을 잠깐 먼저 보여 준다.
    if stage in ('2-checked',):
        seq.append((compose(fs[0]['name'], stage), 900))
    seq.append((compose(fs[-1]['name'], stage), HOLD[stage]))

# 모든 장면을 한 장에 이어 붙여 색상표를 만든다. 한 장면만으로 만들면 다른 장면의 초록 · 노랑이 빠진다.
sheet = Image.new('RGB', (seq[0][0].size[0], seq[0][0].size[1] * len(seq)))
for i, (im, _) in enumerate(seq):
    sheet.paste(im, (0, im.size[1] * i))
pal = sheet.quantize(colors=255, method=Image.MAXCOVERAGE, dither=Image.NONE)
qs = [im.quantize(palette=pal, dither=Image.NONE) for im, _ in seq]
qs[0].save(dst, save_all=True, append_images=qs[1:], duration=[ms for _, ms in seq], loop=0, optimize=True, disposal=1)
print(dst, len(seq), 'frames', round(sum(ms for _, ms in seq) / 1000, 1), 's', round(os.path.getsize(dst) / 1024), 'KB')
seq[len(seq) // 2][0].save(dst.replace('.gif', '-still.png'))
