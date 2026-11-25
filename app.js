'use strict';
/* ========== 存储 ========== */
const KEY = 'vb1';
const DAY = 86400000;
const IV = [0, 1, 2, 4, 7, 15, 30, 60]; // 各阶段复习间隔（天）
const MASTER = 5;
let S = load();
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  s = s || {};
  s.prog = s.prog || {};
  s.log = s.log || {};
  s.set = Object.assign({ daily: 20, rate: 0.9, enLang: 'en-US', enVoice: '', koVoice: '', auto: true, days: [] }, s.set || {});
  return s;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('无法保存进度（浏览器存储不可用）'); } }
const today = () => new Date().toLocaleDateString('sv');
function logInc(k) { const t = today(); S.log[t] = S.log[t] || { n: 0, r: 0 }; S.log[t][k]++; }

/* ========== 数据 ========== */
let IDX = null; const DATA = {};
async function loadIndex() {
  const r = await fetch('data/index.json'); IDX = await r.json();
  IDX.byWord = {}; IDX.order = [];
  for (const d of IDX.days) for (const w of d.words) { IDX.order.push(w); }
  for (const [w, v] of Object.entries(IDX.dict)) IDX.byWord[w.toLowerCase()] = w;
  if (!S.set.days.length) S.set.days = IDX.days.filter(d => d.ok).map(d => d.d).slice(0, 1);
}
async function loadDay(d) {
  if (DATA[d]) return DATA[d];
  const r = await fetch(`data/d${String(d).padStart(2, '0')}.json`);
  const arr = await r.json(); DATA[d] = {};
  for (const x of arr) DATA[d][x.w] = x;
  return DATA[d];
}
async function getWord(w) { const info = IDX.dict[w]; if (!info) return null; const m = await loadDay(info[4]); return m[w]; }

/* ========== 发音 ========== */
let voices = [];
function refreshVoices() { voices = speechSynthesis ? speechSynthesis.getVoices() : []; }
if ('speechSynthesis' in window) { refreshVoices(); speechSynthesis.onvoiceschanged = refreshVoices; }
function pickVoice(lang) {
  const want = lang === 'ko' ? S.set.koVoice : S.set.enVoice;
  if (want) { const v = voices.find(v => v.voiceURI === want); if (v) return v; }
  const pref = lang === 'ko' ? 'ko' : S.set.enLang;
  const cand = voices.filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(pref.toLowerCase()));
  return cand.find(v => /natural|enhanced|premium|neural|google/i.test(v.name)) || cand[0] || null;
}
function speak(text, lang, rate) { speakSystem(text, lang, rate || S.set.rate); }
function speakSystem(text, lang, rate) {
  if (!('speechSynthesis' in window)) { toast('这个浏览器不支持发音，请换用 Safari / Chrome / Edge'); return; }
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  try { speechSynthesis.resume(); } catch (e) {}
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(lang);
  u.lang = lang === 'ko' ? 'ko-KR' : S.set.enLang;
  if (v) u.voice = v; else if (lang === 'ko') toast('没找到韩语语音，请在系统设置里下载韩语语音包');
  u.rate = rate || S.set.rate;
  speechSynthesis.speak(u);
}

/* ========== 工具 ========== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 2200); }
function sayBtn(text, lang, label) { return `<button class="say${lang === 'ko' ? ' ko' : ''}" data-say="${esc(text)}" data-lang="${lang}"${label === '🐢' ? ' data-rate="0.6"' : ''} aria-label="${label === '🐢' ? '慢速发音' : '发音'}">${label || '🔊'}</button>`; }
function setTitle(t, back) { $('#title').textContent = t; $('#backBtn').hidden = !back; }
function stageOf(w) { const p = S.prog[w]; return p ? p.s : -1; }

/* ========== 学习队列 ========== */
function dueList() { const now = Date.now(); return Object.entries(S.prog).filter(([w, p]) => p.s < 8 && p.due <= now && IDX.dict[w]).sort((a, b) => a[1].due - b[1].due).map(x => x[0]); }
function newList() {
  const done = (S.log[today()] || {}).n || 0;
  const left = Math.max(0, S.set.daily - done);
  const out = [];
  for (const d of IDX.days) {
    if (!d.ok || !S.set.days.includes(d.d)) continue;
    for (const w of d.words) { if (!S.prog[w] && IDX.dict[w]) out.push(w); if (out.length >= left) return out; }
  }
  return out;
}
function grade(w, g) { // g: 2认识 1模糊 0不认识
  const p = S.prog[w] || { s: 0, due: 0, seen: 0, lapse: 0, isNew: true };
  const wasNew = !S.prog[w];
  if (g === 2) p.s = wasNew ? 3 : Math.min(p.s + 1, 7);
  else if (g === 1) p.s = Math.max(1, wasNew ? 1 : p.s - 1);
  else { p.s = 1; p.lapse++; }
  p.due = Date.now() + (g === 0 ? 10 * 60000 : IV[p.s] * DAY);
  p.seen++; p.last = Date.now(); delete p.isNew;
  S.prog[w] = p; logInc(wasNew ? 'n' : 'r'); save();
}

/* ========== 视图：首页 ========== */
async function home() {
  setTitle('单词之间', false);
  const due = dueList().length, nw = newList().length;
  const learned = Object.keys(S.prog).length, mast = Object.values(S.prog).filter(p => p.s >= MASTER).length;
  const lg = S.log[today()] || { n: 0, r: 0 };
  const total = IDX.order.length, ready = Object.keys(IDX.dict).length;
  let html = `<div class="card"><div class="stats">
    <div><b>${lg.n}</b><span>今日新学</span></div><div><b>${lg.r}</b><span>今日复习</span></div><div><b>${mast}</b><span>已掌握 / ${learned}</span></div></div>
    <button class="btn" id="goLearn" ${nw + due ? '' : 'disabled'}>开始背单词 · 新词 ${nw} · 复习 ${due}</button>
    <div class="row"><button class="btn ghost" id="goList">单词本</button><button class="btn ghost" id="goSearch">查词</button></div></div>
    <h2>选择要学的 Day（可多选）</h2><div class="days">`;
  for (const d of IDX.days) {
    const n = d.words.length, l = d.words.filter(w => S.prog[w]).length;
    html += `<button class="day ${S.set.days.includes(d.d) ? 'on' : ''} ${d.ok ? '' : 'off'}" data-day="${d.d}">Day ${String(d.d).padStart(2, '0')}<small>${d.ok ? `${l}/${n}` : '准备中'}</small><div class="bar"><i style="width:${n ? l / n * 100 : 0}%"></i></div></button>`;
  }
  html += `</div><p class="muted">共 ${total} 个核心词，已生成详细内容 ${ready} 个。进度保存在本设备上。</p>`;
  $('#view').innerHTML = html;
  $('#goLearn').onclick = () => go('#/learn');
  $('#goList').onclick = () => go('#/list');
  $('#goSearch').onclick = () => go('#/list?q=1');
  document.querySelectorAll('.day').forEach(b => b.onclick = () => {
    const d = +b.dataset.day, it = IDX.days.find(x => x.d === d);
    if (!it.ok) { toast('这一天的内容还在生成中'); return; }
    const i = S.set.days.indexOf(d); i >= 0 ? S.set.days.splice(i, 1) : S.set.days.push(d); save(); home();
  });
}

/* ========== 词卡渲染 ========== */
function tokensEn(s, ei, hitStem) {
  return String(s).split(/([A-Za-z][A-Za-z'’\-]*)/).map((m, i) => {
    if (i % 2 === 0) return esc(m);
    const hit = hitStem && m.toLowerCase().startsWith(hitStem);
    return `<span class="t${hit ? ' hit' : ''}" data-en="${esc(m)}" data-ei="${ei}">${esc(m)}</span>`;
  }).join('');
}
function tokensKo(s, ei) {
  return s.split(/(\s+)/).map(p => /\S/.test(p) ? `<span class="t" data-ko="${esc(p)}" data-ei="${ei}">${esc(p)}</span>` : p).join('');
}
function stemOf(w) { w = w.toLowerCase(); return w.length > 5 ? w.slice(0, w.length - 2) : w.length > 3 ? w.slice(0, w.length - 1) : w; }
function wordHead(x, info, hide) {
  const st = stageOf(x.w);
  return `<div class="card"><span class="freq">真题 ${info ? info[5] : ''} 次${st >= 0 ? ' · ' + ['', '生词', '生词', '学习中', '学习中', '熟悉', '熟悉', '掌握', '掌握'][st + 1] : ''}</span>
    <div class="word">${esc(x.w)}</div>
    <div class="ipa">${esc(x.ipa)} ${sayBtn(x.w, 'en')} ${sayBtn(x.w, 'en', '🐢')}</div>
    <div class="${hide ? 'blur' : ''}" id="meanBox">
      <div class="mean"><span class="pos">${esc(x.pos)}</span>${esc(x.zh)}</div>
      <div class="ko-line">${esc(x.ko)}<small>${esc(x.kor)}</small> ${sayBtn(x.ko.split(/[；;]/)[0], 'ko')}</div>
    </div></div>`;
}
function exBlock(e, i, stem, hideTrans) {
  let h = `<div class="ex">${e.src ? `<span class="src">真题 · ${esc(e.src)}</span>` : `<span class="src" style="background:none;padding:0">例句</span>`}
    <div class="sent">${tokensEn(e.en, i, stem)} ${sayBtn(e.en, 'en')}</div>
    <div class="${hideTrans ? 'blur' : ''} trans">
    <div class="zh">${esc(e.zh)}</div>
    <div class="sent ko">${tokensKo(e.ko, i)} ${sayBtn(e.ko, 'ko')}</div>`;
  for (const g of e.gram || []) {
    h += `<details class="gram"><summary>${esc(g.t)}</summary><p>${esc(g.d)}</p>`;
    for (const gx of g.ex || []) h += `<div class="gx">${esc(gx.en)} ${sayBtn(gx.en, 'en')}<div class="zh">${esc(gx.zh)}</div><div class="ko-line" style="font-size:15px">${esc(gx.ko)} ${sayBtn(gx.ko, 'ko')}</div></div>`;
    h += `</details>`;
  }
  return h + `</div></div>`;
}
function wordBody(x, hide) {
  const stem = stemOf(x.w);
  let h = `<div class="card">`;
  x.ex.forEach((e, i) => h += exBlock(e, i, stem, hide));
  h += `</div>`;
  if (!hide && x.phr && x.phr.length) {
    h += `<div class="card"><b>常用搭配</b>`;
    for (const p of x.phr) h += `<div class="phr">${esc(p.en)} ${sayBtn(p.en, 'en')} <span class="muted">${esc(p.zh)}</span><br><span class="ko-line" style="font-size:15px">${esc(p.ko)}</span> ${sayBtn(p.ko, 'ko')}</div>`;
    h += `</div>`;
  }
  return h;
}
let curWord = null;
function lookupEn(tok, ei) {
  const t = tok.toLowerCase().replace(/’/g, "'");
  const cands = [t, t.replace(/'s$/, ''), t.replace(/s$/, ''), t.replace(/es$/, ''), t.replace(/ed$/, ''), t.replace(/d$/, ''), t.replace(/ing$/, ''), t.replace(/ing$/, 'e'), t.replace(/ies$/, 'y'), t.replace(/ied$/, 'y'), t.replace(/ly$/, '')];
  let gloss = null;
  if (curWord) {
    const exs = [curWord.ex[ei], ...curWord.ex];
    for (const e of exs) { if (!e) continue; const g = lower(e.g); if (g[t]) { gloss = g[t]; break; } if (g[cands[1]]) { gloss = g[cands[1]]; break; } }
  }
  let head = null;
  for (const c of cands) { if (IDX.byWord[c]) { head = IDX.byWord[c]; break; } }
  return { gloss, head };
}
const lowerCache = new WeakMap();
function lower(g) { if (!g) return {}; if (lowerCache.has(g)) return lowerCache.get(g); const o = {}; for (const k in g) o[k.toLowerCase().replace(/’/g, "'")] = g[k]; lowerCache.set(g, o); return o; }
function showPop(html) { const p = $('#pop'); p.innerHTML = `<button class="x" aria-label="关闭">×</button>` + html; p.hidden = false; p.querySelector('.x').onclick = hidePop; }
function hidePop() { $('#pop').hidden = true; document.querySelectorAll('.t.act').forEach(x => x.classList.remove('act')); }
function onTokenEn(el) {
  const tok = el.dataset.en, { gloss, head } = lookupEn(tok, +el.dataset.ei);
  let h = `<div class="pw">${esc(tok)} ${sayBtn(tok, 'en')} ${sayBtn(tok, 'en', '🐢')}</div>`;
  if (gloss) { const [zh, ko] = gloss.split('|'); h += `<div class="mean" style="font-size:16px">${esc(zh)}</div>${ko ? `<div class="ko-line" style="font-size:16px">${esc(ko.trim())} ${sayBtn(ko.trim().split(/[；;,，]/)[0], 'ko')}</div>` : ''}`; }
  if (head) { const i = IDX.dict[head]; h += `<div class="muted" style="margin-top:6px">核心词 <b>${esc(head)}</b> ${esc(i[0])}：${esc(i[1])} ${esc(i[2])} · ${esc(i[3])}</div>`; if (!curWord || head !== curWord.w) h += `<span class="lk" data-open="${esc(head)}">查看词卡 ›</span>`; }
  if (!gloss && !head) h += `<div class="muted">这是一个常见基础词，点 🔊 听发音。</div>`;
  showPop(h);
}
function onTokenKo(el) {
  const raw = el.dataset.ko, t = raw.replace(/[^\p{L}\p{N}]/gu, '');
  const e = curWord && curWord.ex[+el.dataset.ei];
  let gloss = e && e.kg ? (e.kg[t] || e.kg[raw]) : null;
  if (!gloss && curWord) for (const x of curWord.ex) if (x.kg && x.kg[t]) { gloss = x.kg[t]; break; }
  showPop(`<div class="pw" style="color:var(--ko)">${esc(t)} ${sayBtn(t, 'ko')} ${sayBtn(t, 'ko', '🐢')}</div><div class="mean" style="font-size:16px">${esc(gloss || '暂无该词块的解析')}</div>`);
}

/* ========== 视图：学习 ========== */
let Q = [], qi = 0, sessionDone = 0;
async function learn() {
  setTitle('背单词', true);
  const due = dueList(), nw = newList();
  Q = [...due.slice(0, 200), ...nw]; qi = 0; sessionDone = 0;
  if (!Q.length) { $('#view').innerHTML = `<div class="card"><p>今天的任务完成啦 🎉</p><button class="btn" onclick="go('#/')">回首页</button></div>`; return; }
  showCard();
}
async function showCard() {
  hidePop();
  if (qi >= Q.length) { $('#view').innerHTML = `<div class="card"><p style="font-size:18px">本轮完成 🎉 共 ${sessionDone} 个</p><button class="btn" onclick="go('#/learn')">再来一轮</button><button class="btn ghost" onclick="go('#/')">回首页</button></div>`; removeAnswer(); return; }
  const w = Q[qi], x = await getWord(w); curWord = x;
  const info = IDX.dict[w];
  const isNew = !S.prog[w];
  $('#view').innerHTML = `<div class="prog">${qi + 1} / ${Q.length} · ${isNew ? '新词' : '复习'}</div>` + wordHead(x, info, true) +
    `<div class="card">${exBlock(x.ex[0], 0, stemOf(x.w), true)}</div><div id="more"></div>`;
  setAnswer(`<button class="btn b-yes" data-g="2">认识</button><button class="btn b-mid" data-g="1">模糊</button><button class="btn b-no" data-g="0">不认识</button>`, g => reveal(w, +g));
  if (S.set.auto) setTimeout(() => speak(x.w, 'en'), 150);
}
function reveal(w, g) {
  grade(w, g); sessionDone++;
  if (g === 0) Q.splice(Math.min(qi + 6, Q.length), 0, w); // 稍后再考一次
  const x = curWord;
  $('#view').innerHTML = `<div class="prog">${qi + 1} / ${Q.length}</div>` + wordHead(x, IDX.dict[w], false) + wordBody(x, false);
  setAnswer(`${g === 2 ? `<button class="btn ghost" data-g="wrong" style="flex:.6">记错了</button>` : ''}<button class="btn" data-g="next">下一个 ›</button>`, a => {
    if (a === 'wrong') { const p = S.prog[w]; p.s = 1; p.lapse++; p.due = Date.now() + 10 * 60000; save(); Q.splice(Math.min(qi + 6, Q.length), 0, w); toast('已标为不认识，稍后再复习'); }
    qi++; showCard(); window.scrollTo(0, 0);
  });
}
function setAnswer(html, fn) {
  let a = $('#answer'); if (!a) { a = document.createElement('div'); a.id = 'answer'; a.className = 'answer'; document.body.appendChild(a); }
  a.innerHTML = `<div class="inner">${html}</div>`;
  a.querySelectorAll('[data-g]').forEach(b => b.onclick = () => fn(b.dataset.g));
}
function removeAnswer() { const a = $('#answer'); if (a) a.remove(); }

/* ========== 视图：单词本 / 查词 ========== */
let listTab = 'all', listQ = '';
function list(focus) {
  setTitle('单词本', true);
  const tabs = [['all', '全部'], ['new', '生词'], ['learn', '学习中'], ['mast', '已掌握']];
  $('#view').innerHTML = `<div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${listTab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <input type="search" id="q" placeholder="搜索英文或中文…" value="${esc(listQ)}"><div class="card list" id="lst" style="margin-top:10px"></div>`;
  const draw = () => {
    const q = listQ.trim().toLowerCase();
    let ws = Object.keys(IDX.dict);
    ws = ws.filter(w => { const s = stageOf(w); return listTab === 'all' || (listTab === 'new' && (S.prog[w] || {}).lapse > 0 && s < MASTER) || (listTab === 'learn' && s >= 0 && s < MASTER) || (listTab === 'mast' && s >= MASTER); });
    if (q) ws = ws.filter(w => w.toLowerCase().includes(q) || IDX.dict[w][2].includes(q) || IDX.dict[w][3].includes(q));
    const shown = ws.slice(0, 300);
    $('#lst').innerHTML = shown.length ? shown.map(w => { const s = stageOf(w); return `<div class="it" data-open="${esc(w)}"><b><i class="dot ${s < 0 ? '' : s < 3 ? 's1' : s < MASTER ? 's2' : 's3'}"></i>${esc(w)}</b><span>${esc(IDX.dict[w][2])}</span></div>`; }).join('') + (ws.length > 300 ? `<p class="muted">还有 ${ws.length - 300} 个，请用搜索缩小范围</p>` : '') : '<p class="muted">没有单词</p>';
  };
  draw();
  $('#q').oninput = e => { listQ = e.target.value; draw(); };
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { listTab = b.dataset.tab; list(); });
  if (focus) $('#q').focus();
}
async function wordPage(w) {
  setTitle(w, true);
  const x = await getWord(w); if (!x) { $('#view').innerHTML = '<p>找不到这个词</p>'; return; }
  curWord = x;
  $('#view').innerHTML = wordHead(x, IDX.dict[w], false) + wordBody(x, false);
}

/* ========== 视图：设置 ========== */
function settings() {
  setTitle('设置', true); refreshVoices();
  const vopt = (pref, cur) => `<option value="">自动选择</option>` + voices.filter(v => v.lang.toLowerCase().replace('_', '-').startsWith(pref)).map(v => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === cur ? 'selected' : ''}>${esc(v.name)} (${v.lang})</option>`).join('');
  $('#view').innerHTML = `<div class="card">
    <label>每天新学单词数</label><input type="number" id="daily" min="5" max="200" value="${S.set.daily}">
    <label>英语口音</label><select id="enLang"><option value="en-US" ${S.set.enLang === 'en-US' ? 'selected' : ''}>美式</option><option value="en-GB" ${S.set.enLang === 'en-GB' ? 'selected' : ''}>英式</option></select>
    <label>英语语音</label><select id="enVoice">${vopt(S.set.enLang.toLowerCase(), S.set.enVoice)}</select>
    <label>韩语语音</label><select id="koVoice">${vopt('ko', S.set.koVoice)}</select>
    <label>语速：<span id="rv">${S.set.rate}</span></label><input type="range" id="rate" min="0.5" max="1.3" step="0.05" value="${S.set.rate}" style="width:100%">
    <label><input type="checkbox" id="auto" ${S.set.auto ? 'checked' : ''}> 出现新卡片时自动读单词</label>
    <div class="row"><button class="btn ghost" id="tEn">试听英语</button><button class="btn ghost" id="tKo">试听韩语</button></div>
  </div>
  <div class="card"><b>备份 / 换设备</b><p class="muted">进度只保存在当前设备。换设备时：在旧设备点“导出”，把文字发到新设备，粘贴后点“导入”。</p>
    <textarea id="bk" rows="3" placeholder="导出的进度文字会显示在这里"></textarea>
    <div class="row"><button class="btn ghost" id="exp">导出</button><button class="btn ghost" id="imp">导入</button></div>
    <button class="btn ghost" id="reset" style="color:var(--warn)">清空所有进度</button></div>
  <p class="muted">${voices.filter(v => v.lang.toLowerCase().startsWith('ko')).length ? '' : '⚠ 当前设备没有检测到韩语语音。iPhone：设置 → 辅助功能 → 朗读内容 → 声音 → 韩语 下载；小米平板：设置 → 更多设置 → 语言与输入法 → 文字转语音 → 安装韩语语音数据。'}</p>`;
  const upd = () => { S.set.daily = Math.max(1, +$('#daily').value || 20); S.set.enLang = $('#enLang').value; S.set.enVoice = $('#enVoice').value; S.set.koVoice = $('#koVoice').value; S.set.rate = +$('#rate').value; S.set.auto = $('#auto').checked; $('#rv').textContent = S.set.rate; save(); };
  ['daily', 'enVoice', 'koVoice', 'rate', 'auto'].forEach(id => $('#' + id).oninput = upd);
  $('#enLang').onchange = () => { upd(); S.set.enVoice = ''; save(); settings(); };
  $('#tEn').onclick = () => speak('Practice makes perfect.', 'en');
  $('#tKo').onclick = () => speak('연습이 완벽을 만든다.', 'ko');
  $('#exp').onclick = () => { $('#bk').value = btoa(unescape(encodeURIComponent(JSON.stringify(S)))); $('#bk').select(); toast('已导出，复制这段文字即可'); };
  $('#imp').onclick = () => { try { const s = JSON.parse(decodeURIComponent(escape(atob($('#bk').value.trim())))); if (!s.prog) throw 0; localStorage.setItem(KEY, JSON.stringify(s)); S = load(); toast('导入成功'); } catch (e) { toast('导入失败：文字不完整'); } };
  $('#reset').onclick = () => { if (confirm('确定清空所有学习进度吗？此操作不能撤销。')) { S.prog = {}; S.log = {}; save(); toast('已清空'); } };
}

/* ========== 路由与全局事件 ========== */
function go(h) { location.hash = h; }
window.go = go;
async function route() {
  hidePop(); window.scrollTo(0, 0);
  const h = location.hash || '#/';
  if (!h.startsWith('#/learn')) removeAnswer();
  if (h.startsWith('#/learn')) return learn();
  if (h.startsWith('#/list')) return list(h.includes('q=1'));
  if (h.startsWith('#/w/')) return wordPage(decodeURIComponent(h.slice(4)));
  if (h.startsWith('#/set')) return settings();
  curWord = null; return home();
}
document.addEventListener('click', e => {
  const sb = e.target.closest('[data-say]'); if (sb) { e.stopPropagation(); speak(sb.dataset.say, sb.dataset.lang, sb.dataset.rate ? +sb.dataset.rate : undefined); return; }
  const op = e.target.closest('[data-open]'); if (op) { hidePop(); go('#/w/' + encodeURIComponent(op.dataset.open)); return; }
  const te = e.target.closest('.t[data-en]'); if (te && !te.closest('.blur')) { hidePop(); te.classList.add('act'); onTokenEn(te); speak(te.dataset.en, 'en'); return; }
  const tk = e.target.closest('.t[data-ko]'); if (tk && !tk.closest('.blur')) { hidePop(); tk.classList.add('act'); onTokenKo(tk); speak(tk.dataset.ko.replace(/[^\p{L}\p{N}]/gu, ''), 'ko'); return; }
  const bl = e.target.closest('.blur'); if (bl) { bl.classList.remove('blur'); return; }
  if (!e.target.closest('#pop')) hidePop();
});
$('#backBtn').onclick = () => { if (location.hash.startsWith('#/w/') && history.length > 1) history.back(); else go('#/'); };
$('#setBtn').onclick = () => go('#/set');
window.addEventListener('hashchange', route);
loadIndex().then(route).catch(e => { $('#view').innerHTML = `<div class="card">加载失败：${esc(e.message)}</div>`; });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
