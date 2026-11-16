# Demo GIF

`docs/demo.gif` and `docs/demo.ko.gif` are recorded from the real extension, not drawn.

1. `node make-practice-repo.mjs <repo root> <workspace dir>` builds a small git repo on `feature/lockout-b` with requirements and a JUnit report.
2. `node capture.mjs <out dir> 1280 800` waits for VS Code's remote debugging port (9339) and saves a screenshot every 0.3 s through the Chrome DevTools Protocol.
3. `node record.cjs <repo root>/vscode <workspace dir> <out dir>` starts an installed VS Code with a throwaway profile, loads the extension from source and runs `suite/index.cjs`, which drives the flow: check the branch, hover, diff, fix + commit + tests, PR summary.
4. `python make_gif.py <out dir> en demo.gif 1000` (or `ko`) picks the settled frame of each scene, adds the caption bar and writes the GIF. Needs Pillow; the caption font path is the Windows "Malgun Gothic Bold".

Run 2 and 3 at the same time. Written for Windows (VS Code user install path).
