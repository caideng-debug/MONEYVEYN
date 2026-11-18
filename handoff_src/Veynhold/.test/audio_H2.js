// chunk H2: offline renders of the sword sounds with and without their material reverb sends (real Chromium, OfflineAudioContext).
// Reports per sound: peak, -60 dB tail length dry / wet, wet-to-dry energy ratio, spectral centroid of the reverb tail. usage: node .test/audio_H2.js
const { launch, URL } = require('./t_lib.js');
const SOUNDS = [['whoosh', {}], ['whoosh', { heavy: true }], ['hit', {}], ['hit', { heavy: true }], ['block', {}], ['deflect', {}], ['perfect', {}], ['deathblow', {}], ['dbEntry', {}]];
(async () => {
  const T = await launch(); const { page, ev } = T; const out = {};
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.VEYN_GAME && window.VEYN_GAME.Game.state === 'title', null, { timeout: 300000, polling: 1000 });
    for (const q of ['high', 'low']) for (const [nm, o] of SOUNDS) {
      const r = await ev(async ([nm, o, q]) => {
        const G = window.VEYN_GAME, AS = G.P1.audio.constructor, sr = 44100, secs = 4; G.Settings.quality = q;
        const render = async (wet) => { const ctx = new OfflineAudioContext(2, sr * secs, sr), a = new AS(); a.ctx = ctx; Object.defineProperty(a, 'ok', { get: () => true });
          a.master = ctx.createGain(); a.master.gain.value = 1; a.master.connect(ctx.destination); const nb = ctx.createBuffer(1, sr, sr), d = nb.getChannelData(0); let s = 12345; for (let i = 0; i < sr; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; } a.noise = nb;
          a.rev = null; if (!wet) a.sendOf = () => null; else for (const k of ['air', 'steel', 'flesh', 'exec']) a.sendOf(k); /* build the IRs first so both renders draw the same random numbers */ const R0 = Math.random; let rs = 99; Math.random = () => (rs = (rs * 16807) % 2147483647) / 2147483647; try { a.play(nm, o); } finally { Math.random = R0; }
          const b = await ctx.startRendering(); const L = b.getChannelData(0), Rr = b.getChannelData(1), m = new Float32Array(L.length); for (let i = 0; i < L.length; i++) m[i] = 0.5 * (L[i] + Rr[i]); return m; };
        const dry = await render(false), wet = await render(true);
        const env = x => { const W = Math.floor(sr * 0.01), n = Math.floor(x.length / W), e = new Float32Array(n); for (let k = 0; k < n; k++) { let s = 0; for (let i = 0; i < W; i++) { const v = x[k * W + i]; s += v * v; } e[k] = Math.sqrt(s / W); } return e; };
        const ed = env(dry), ew = env(wet); let pk = 0; for (const v of ew) pk = Math.max(pk, v); let pkd = 0; for (const v of ed) pkd = Math.max(pkd, v);
        const tail = (e, p) => { let last = 0; for (let k = 0; k < e.length; k++) if (e[k] > p * 0.001) last = k; return (last + 1) * 0.01; };
        let Ed = 0, Ew = 0; for (let i = 0; i < dry.length; i++) { Ed += dry[i] * dry[i]; const r = wet[i] - dry[i]; Ew += r * r; }
        // reverb-only signal (wet - dry); centroid over the part after the dry sound has ended
        const td = tail(ed, pkd), st = Math.floor(td * sr), N = 8192; let num = 0, den = 0;
        for (let off = st; off + N <= wet.length && off < st + sr * 1.5; off += N) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = (wet[off + i] - dry[off + i]) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
          for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
          for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai; re[i + k] += ar; im[i + k] += ai; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
          for (let k = 1; k < N / 2; k++) { const mg = re[k] * re[k] + im[k] * im[k], f = k * sr / N; num += f * mg; den += mg; } }
        return { peak: +pk.toFixed(3), tailDry: +td.toFixed(2), tailWet: +tail(ew, pk).toFixed(2), wetDb: Ed > 0 ? +(10 * Math.log10(Math.max(1e-12, Ew) / Ed)).toFixed(1) : null, tailCentroidHz: den > 0 ? Math.round(num / den) : null };
      }, [nm, o, q]);
      out[q + ' ' + nm + (o.heavy ? ' (heavy)' : '')] = r; console.log(q.padEnd(5), (nm + (o.heavy ? ' (heavy)' : '')).padEnd(16), JSON.stringify(r));
    }
  } catch (e) { console.log('ERROR', e.message); }
  console.log('page errors', T.errors.length, JSON.stringify(T.errors.slice(0, 3))); await T.browser.close();
  require('fs').writeFileSync(require('path').join(__dirname, 'audio_H2_result.json'), JSON.stringify(out, null, 1));
})();
