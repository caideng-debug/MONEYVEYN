/* =====================================================================
   VEYNHOLD — world-mode UI (DOM): HUD extras, compass, prompts, dialogue, reader, pause menu, map, death card,
   title menu entries, save-problem prompt. Pure presentation; reads state from VEYN_ADV.
   ===================================================================== */
(function () {
'use strict';
const A = window.VEYN_ADV = window.VEYN_ADV || {};
const CSS = `
body.adv #hudTarget{top:46px}
body.adv #hints{display:none!important}
#advCompass{position:fixed;top:8px;left:50%;transform:translateX(-50%);width:440px;height:26px;z-index:5;pointer-events:none;overflow:hidden;display:none;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 18%,#000 82%,transparent);mask-image:linear-gradient(90deg,transparent,#000 18%,#000 82%,transparent)}
#advCompass .rail{position:absolute;left:0;right:0;top:12px;height:1px;background:rgba(201,176,120,.35)}
#advCompass b{position:absolute;top:0;transform:translateX(-50%);font:600 12px Georgia,serif;letter-spacing:.1em;color:#d9c9a4;text-shadow:0 1px 3px #000}
#advCompass b.n{color:#e8b860}#advCompass i{position:absolute;top:9px;width:7px;height:7px;transform:translateX(-50%) rotate(45deg);border:1px solid #f0c060;background:rgba(240,190,90,.35)}
#advCompass i.lm{border-color:#9aa4b8;background:rgba(150,160,180,.2);width:5px;height:5px;top:10px}#advCompass i.obj{border-color:#ffe2a0;background:#c9963a;box-shadow:0 0 6px #e8b860}
#advCompass span{position:absolute;top:0;width:1px;height:6px;background:rgba(201,176,120,.45)}
#advObj{position:fixed;left:26px;top:18px;z-index:5;pointer-events:none;max-width:360px;font:14px Georgia,serif;color:#d8cbb0;text-shadow:0 1px 4px #000;display:none;transition:opacity .6s}
#advObj small{display:block;font-size:10px;letter-spacing:.3em;color:#a8343a;text-transform:uppercase;margin-bottom:3px}
#advFlask{margin-top:4px;font:12px Georgia,serif;letter-spacing:.12em;color:#c9b88f;text-shadow:0 1px 3px #000}#advFlask i{display:inline-block;width:9px;height:13px;margin-right:4px;border:1px solid #c9963a;border-radius:2px 2px 4px 4px;background:linear-gradient(#ffcf70,#c26a1e);vertical-align:-2px}
#advFlask i.e{background:rgba(30,20,10,.6)}#advFlask.drink i:not(.e){box-shadow:0 0 8px #ffb347}
#advPrompt{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:6;pointer-events:none;font:15px Georgia,serif;letter-spacing:.08em;color:#efe2c4;text-shadow:0 1px 4px #000;display:none;background:rgba(8,7,7,.55);padding:7px 16px;border:1px solid rgba(201,176,120,.3)}
#advPrompt .k{margin-right:8px}
#advHint{position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:6;pointer-events:none;max-width:720px;text-align:center;font:italic 14px Georgia,serif;color:#cfc2a6;text-shadow:0 1px 4px #000;opacity:0;transition:opacity .5s}
#advArea{position:fixed;left:50%;top:24%;transform:translateX(-50%);z-index:6;pointer-events:none;text-align:center;opacity:0;transition:opacity 1.2s}
#advArea .t{font:30px Georgia,serif;letter-spacing:.42em;color:#e6d8bb;text-shadow:0 0 20px #000,0 2px 6px #000;margin-right:-.42em}
#advArea .r{height:1px;margin:10px auto 0;width:60%;background:linear-gradient(90deg,transparent,#a8343a,transparent)}#advArea .s{font:italic 13px Georgia,serif;color:#a99d86;margin-top:8px}
.advMark{position:fixed;z-index:4;pointer-events:none;font:bold 20px Georgia,serif;transform:translate(-50%,-50%);text-shadow:0 0 6px #000;display:none}
.advMark.q{color:#e8d38a}.advMark.x{color:#ff5a3a}.advMark.s{color:#ffb1a8;font-size:11px;letter-spacing:.2em;font-weight:normal}
#advDlg{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);width:min(820px,92vw);z-index:12;display:none;background:linear-gradient(rgba(10,8,8,.9),rgba(6,5,5,.96));border:1px solid rgba(201,176,120,.45);padding:18px 26px 16px;pointer-events:auto}
#advDlg .who{font:13px Georgia,serif;letter-spacing:.3em;text-transform:uppercase;color:#e8b860;margin-bottom:8px}#advDlg .who small{letter-spacing:.1em;color:#8f846f;text-transform:none;margin-left:10px}
#advDlg .txt{font:17px/1.55 Georgia,serif;color:#e6dcc6;min-height:52px}#advDlg .ch{margin-top:12px}
#advDlg .ch button{display:block;width:100%;text-align:left;margin:5px 0;padding:8px 12px;background:rgba(24,18,15,.85);border:1px solid rgba(201,176,120,.28);color:#dccfb2;font:15px Georgia,serif;cursor:pointer}
#advDlg .ch button:hover,#advDlg .ch button.sel{background:rgba(110,20,22,.55);border-color:#d9a441}#advDlg .more{float:right;font:12px Georgia,serif;color:#8f846f;letter-spacing:.15em;margin-top:6px}
#advRead{position:fixed;inset:0;z-index:13;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.7)}
#advRead .pg{width:min(560px,90vw);padding:34px 40px;background:linear-gradient(#cdbf9f,#b4a47f);color:#2a1d12;font:16px/1.65 Georgia,serif;box-shadow:0 10px 40px #000;white-space:pre-wrap;position:relative}
#advRead h3{font-weight:normal;letter-spacing:.2em;text-transform:uppercase;font-size:15px;margin-bottom:14px;color:#4a1a14}#advRead .cl{margin-top:18px;font-size:12px;color:#5a4a36;letter-spacing:.15em;text-align:right}
#advMenu{position:fixed;inset:0;z-index:11;display:none;background:radial-gradient(ellipse at center,rgba(12,10,10,.86),rgba(0,0,0,.96));pointer-events:auto}
#advMenu .wrap{position:absolute;inset:40px 60px;display:flex;flex-direction:column}
#advMenu .tabs{display:flex;gap:6px;border-bottom:1px solid rgba(201,176,120,.35);padding-bottom:8px;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}
#advMenu .tabs button{flex:0 0 auto;white-space:nowrap}
#advMenu .tabs button{background:none;border:1px solid transparent;color:#a99d86;font:14px Georgia,serif;letter-spacing:.2em;text-transform:uppercase;padding:7px 14px;cursor:pointer}
#advMenu .tabs button.on{color:#f0d68a;border-color:rgba(201,176,120,.45);background:rgba(40,25,18,.6)}#advMenu .tabs .sp{flex:1 0 8px}
@media (max-width:1366px){#advMenu .wrap{inset:36px 40px}#advMenu .tabs{gap:4px}#advMenu .tabs button{font-size:13px;letter-spacing:.14em;padding:6px 10px}}
@media (max-width:1100px){#advMenu .wrap{inset:30px 28px}#advMenu .tabs{gap:2px}#advMenu .tabs button{font-size:12px;letter-spacing:.1em;padding:6px 8px}}
body.advMenuOpen #advCompass,body.advMenuOpen #advObj,body.advMenuOpen #advPrompt,body.advMenuOpen #advHint,body.advMenuOpen #advArea,body.advMenuOpen .advMark,
body.advMenuOpen #hudPlayer,body.advMenuOpen #hudTarget,body.advMenuOpen #hints,body.advMenuOpen #reticle,body.advMenuOpen #danger,body.advMenuOpen #dbDot,body.advMenuOpen #dbHint,body.advMenuOpen #chargeRing{visibility:hidden!important}
body.advDlgOpen #hudPlayer,body.advDlgOpen #advPrompt,body.advDlgOpen .advMark{visibility:hidden!important}
#advMenu .body{flex:1;overflow-y:auto;padding:22px 6px;color:#d6c8aa;font:15px/1.6 Georgia,serif}
#advMenu h4{font-weight:normal;letter-spacing:.25em;text-transform:uppercase;color:#e8b860;font-size:13px;margin:6px 0 10px}
#advMenu .grid{display:flex;gap:40px;flex-wrap:wrap}#advMenu .col{flex:1;min-width:280px}
#advMenu .it{padding:7px 10px;border-left:2px solid rgba(201,176,120,.3);margin-bottom:8px;background:rgba(20,15,12,.5)}#advMenu .it b{color:#efe2c4;font-weight:normal}#advMenu .it small{display:block;color:#9c8f78;font-size:13px}
#advMenu .it.done{opacity:.6}#advMenu .it.main{border-left-color:#a8343a}
#advMenu .set{display:flex;align-items:center;justify-content:space-between;max-width:560px;margin:8px 0;gap:16px}#advMenu .set input[type=range]{width:200px}
#advMenu .set button{min-width:160px}#advMenu .acts{display:flex;gap:10px;margin-top:10px}#advMenu .acts .btn{width:auto;padding:9px 22px;margin:0}
#advMap{background:#0b0a09;border:1px solid rgba(201,176,120,.3);display:block;margin:0 auto;max-width:100%}
#advDeath{position:fixed;inset:0;z-index:9;display:none;align-items:center;justify-content:center;pointer-events:none;flex-direction:column}
#advDeath .t{font:56px Georgia,serif;letter-spacing:.5em;color:#b3141c;text-shadow:0 0 30px #600;margin-right:-.5em;opacity:0;transition:opacity 1.2s}#advDeath .s{font:italic 16px Georgia,serif;color:#b9a98a;margin-top:14px;opacity:0;transition:opacity 1.6s}
#advProlog{position:fixed;inset:0;z-index:14;display:none;align-items:center;justify-content:center;flex-direction:column;background:#000;pointer-events:auto;cursor:pointer}
#advProlog p{font:italic 20px/1.8 Georgia,serif;color:#cbbd9f;opacity:0;transition:opacity 1.4s;text-align:center;max-width:760px}#advProlog .skip{position:absolute;bottom:26px;right:30px;font:12px Georgia,serif;letter-spacing:.2em;color:#6f6553}
#advEnd .panel{max-width:720px}#advEnd .stats td{padding:2px 14px}
#advTitleBox{margin-bottom:12px}#advTitleBox .btn.main{border-color:#d9a441;background:rgba(80,18,18,.55)}#advTitleBox .lbl{font:11px Georgia,serif;letter-spacing:.35em;color:#8f846f;text-transform:uppercase;margin:16px 0 4px;text-align:center}
#advSaveMsg .panel{max-width:620px}
`;
const html = `
<div id="advCompass"><div class="rail"></div></div>
<div id="advObj"><small>Objective</small><span></span></div>
<div id="advPrompt"></div><div id="advHint"></div>
<div id="advArea"><div class="t"></div><div class="r"></div><div class="s"></div></div>
<div id="advDlg"><div class="who"></div><div class="txt"></div><div class="ch"></div><div class="more"></div></div>
<div id="advRead"><div class="pg"><h3></h3><div class="tx"></div><div class="cl">E / click to close</div></div></div>
<div id="advMenu"><div class="wrap"><div class="tabs"></div><div class="body"></div></div></div>
<div id="advDeath"><div class="t">REFUSED</div><div class="s">The earth will not take you. You wake by the lantern.</div></div>
<div id="advProlog"><p></p><div class="skip">click or press any key to continue</div></div>
<div id="advEnd" class="ov"><div class="panel"><div class="big" style="font-size:44px;color:#e6c46a">CHAPTER I</div><div class="flavor" id="advEndSub"></div><div class="stats" id="advEndStats"></div>
  <button class="btn" id="advEndStay">Return to the Grounds</button><button class="btn" id="advEndTitle">Save and quit to title</button></div></div>
<div id="advSaveMsg" class="ov"><div class="panel"><div class="big" style="font-size:38px">SAVE PROBLEM</div><div class="stats" id="advSaveTxt"></div>
  <button class="btn" id="advSaveNew">Start a new journey</button><button class="btn" id="advSaveBack">Back to title</button></div></div>
<div id="advConfirm" class="ov"><div class="panel"><div class="stats" id="advConfirmTxt"></div><button class="btn" id="advConfirmYes">Yes</button><button class="btn" id="advConfirmNo">No</button></div></div>
`;
const $ = id => document.getElementById(id);
function init() {
  if (A.uiReady || !document.body) return; A.uiReady = true;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const d = document.createElement('div'); d.innerHTML = html; while (d.firstChild) document.body.insertBefore(d.firstChild, $('err') || null);
  // compass ticks
  const c = $('advCompass'); for (let i = 0; i < 72; i++) { const s = document.createElement('span'); s.dataset.a = (i * 5).toString(); c.appendChild(s); }
  for (const [n, a] of [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]]) { const b = document.createElement('b'); b.textContent = n; b.dataset.a = a; if (n === 'N') b.className = 'n'; c.appendChild(b); }
  // flask pips under the health bar
  const fl = document.createElement('div'); fl.id = 'advFlask'; fl.style.display = 'none'; const hp = $('hudPlayer'); if (hp) hp.appendChild(fl);
  // title: journey entries above the trials
  const mc = document.querySelector('#title .menuCol'); if (mc) { const box = document.createElement('div'); box.id = 'advTitleBox';
    box.innerHTML = '<button class="btn main" id="advContinue" style="display:none">Continue<small id="advContSub"></small></button><button class="btn main" id="advNew">New Journey<small>Chapter I \u2014 The Execution Grounds</small></button><div class="lbl">Trials \u2014 combat practice</div>';
    mc.insertBefore(box, mc.firstChild); }
}
A.UI = {
  init, $,
  compassMarks: [],
  compass(yaw, marks) {   // yaw: camera yaw (atan2 convention: 0 = +z = north)
    const c = $('advCompass'); if (!c) return; const W = 440, span = 150; const deg = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;   // heading in compass degrees (0 = N, 90 = E)
    const place = (el, a) => { let d = ((a - deg + 540) % 360) - 180; if (Math.abs(d) > span / 2) { el.style.display = 'none'; return; } el.style.display = 'block'; el.style.left = (W / 2 + d / span * W) + 'px'; };
    for (const el of c.children) if (el.dataset && el.dataset.a !== undefined) place(el, +el.dataset.a);
    while (this.compassMarks.length < marks.length) { const i = document.createElement('i'); c.appendChild(i); this.compassMarks.push(i); }
    this.compassMarks.forEach((el, k) => { const m = marks[k]; if (!m) { el.style.display = 'none'; return; } el.className = m.kind || ''; el.title = m.name || ''; place(el, m.a); });
  },
  prompt(text, key) { const el = $('advPrompt'); if (!el) return; if (!text) { el.style.display = 'none'; this._pt = ''; return; } const t = (key || 'E') + '|' + text; if (this._pt !== t) { this._pt = t; el.innerHTML = '<span class="k">' + (key || 'E') + '</span>' + text; } el.style.display = 'block'; },
  hint(text, dur) { const el = $('advHint'); if (!el) return; el.textContent = text; el.style.opacity = 1; clearTimeout(this._ht); this._ht = setTimeout(() => { el.style.opacity = 0; }, (dur || 6) * 1000); },
  area(title, sub) { const el = $('advArea'); if (!el) return; el.querySelector('.t').textContent = title; el.querySelector('.s').textContent = sub || ''; el.style.opacity = 1; clearTimeout(this._at); this._at = setTimeout(() => { el.style.opacity = 0; }, 3200); },
  objective(text) { const el = $('advObj'); if (!el) return; el.querySelector('span').textContent = text || ''; el.style.display = text ? 'block' : 'none'; },
  flask(n, max, drinking) { const el = $('advFlask'); if (!el) return; let h = ''; for (let i = 0; i < max; i++) h += '<i class="' + (i < n ? '' : 'e') + '"></i>'; h += ' <span>R</span>'; if (el._h !== h) { el.innerHTML = h; el._h = h; } el.classList.toggle('drink', !!drinking); },
  read(title, text) { const el = $('advRead'); el.querySelector('h3').textContent = title; el.querySelector('.tx').textContent = text; el.style.display = 'flex'; },
  closeRead() { $('advRead').style.display = 'none'; },
  marks: [], mark(i, kind, x, y, text) { while (this.marks.length <= i) { const m = document.createElement('div'); m.className = 'advMark'; document.body.appendChild(m); this.marks.push(m); } const m = this.marks[i];
    if (!kind) { m.style.display = 'none'; return; } m.className = 'advMark ' + kind; if (m._t !== text) { m.textContent = text; m._t = text; } m.style.left = x + 'px'; m.style.top = y + 'px'; m.style.display = 'block'; },
  hideMarks(from) { for (let i = from || 0; i < this.marks.length; i++) this.marks[i].style.display = 'none'; },
  show(id, on) { const el = $(id); if (el) el.style.display = on ? (el.classList.contains('ov') ? 'flex' : (id === 'advRead' || id === 'advDeath' || id === 'advProlog' ? 'flex' : 'block')) : 'none'; if (el && el.classList.contains('ov')) el.classList.toggle('show', !!on);
    if (document.body && (id === 'advMenu' || id === 'advDlg')) document.body.classList.toggle(id === 'advMenu' ? 'advMenuOpen' : 'advDlgOpen', !!on); },   // P1: hide world HUD under the pause menu / player bars under dialogue
};
if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
})();
