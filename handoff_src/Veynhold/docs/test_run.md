# Veynhold test run — 2026-10-23 (~08:07–08:15 EDT)

No game code was changed.

## Build
- `python3 build.py` finished OK (printed `2614377`, the output size). `dist/index.html` was copied to `dist/Veynhold.html`.
- `md5sum src/core.js` = `74a5299e9a45d86aaddc90e2f1831821` ✅ matches what was expected (checked again after the tests and it hadn't changed).

## Environment
- Ran with `node .test/<suite>.js` from `/workspace/veynhold`, one suite at a time, each with `timeout 300`.
- `LD_LIBRARY_PATH=/workspace/veynhold/.tools/chromelibs`, `PLAYWRIGHT_BROWSERS_PATH=/workspace/veynhold/.tools/browsers` (chromium-1134 was already there, so nothing was installed).
- Note: I first started the suites all at once, then stopped them within a few seconds, before any of them finished, because 7 browsers on 2 CPUs could throw off the timing-sensitive tests. I then ran each suite once, one after another. Only ct.js finished in that first launch, and its result is the one below.

## Results

| Suite | Result | Exit | Time |
|---|---|---|---|
| ct.js | 72/72 | 0 | <1 s |
| input.js | 42/42 PASS (doesn't print a summary line; 42 PASS lines, 0 FAIL; `errors none`) | 0 | 31 s |
| v5.js | 11/11 v5 checks passed | 0 | 9 s |
| models.js | 27/27 model checks passed | 0 | 9 s |
| v8.js | 40/40 v8 checks passed | 0 | 14 s |
| smoke.js | No PASS/FAIL checks. Ran all 6 encounters, then restart x5 (scene children didn't change), then pause/resume. `ERRORS: none crashed false`; in-page `self-tests 72/72` | 0 | 9 s |
| v6.js | 29/29 v6 checks passed | 0 | 4 s |
| p1.js | 88/88 p1 checks passed | 0 | 28 s |

**Failures: none.** No suite printed a FAIL line, an error, or a crash. Every suite that loads the page also reported `[Veynhold] self-tests 72/72`, and the model suites reported `models 5/5`.

Full logs: `/workspace/work/vlogs/<suite>.log`
