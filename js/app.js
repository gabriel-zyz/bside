// 把桌面畫出來，並處理所有操作：拖唱片、播放、按鈕、進度、時鐘、歌詞、手機上的挑歌。

import { K, pageEdge, f1 } from './projection.js';
import * as O from './objects.js';
import { LAYOUTS, pickLayout } from './layout.js';
import * as sfx from './sfx.js';
import { parseLyrics, spreadOf, slotOf, rangeOf, activeAt } from './lyrics.js';

const $ = (sel) => document.querySelector(sel);
const stage = $('#stage');
const audio = $('#audio');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  songs: [],
  layout: 'desktop',
  current: null,     // 轉盤上是第幾首；沒有唱片時是 null
  settled: false,    // 唱片已經落在轉盤上
  starting: false,   // 落針後、歌還沒進來的那一小段
  hover: null,
  browse: null,      // 手機挑歌時：{ pos }，pos 是盒子裡第幾張正對著你
  token: 0,          // 每次換唱片加一，用來丟掉過時的非同步結果
  lyrics: [],
  spread: 0,
  active: -1,
  flipping: false,
};

const cur = () => (state.current == null ? null : state.songs[state.current]);
const item = (name) => LAYOUTS[state.layout].items.find((it) => it[0] === name);
const place = ([, x, y, phi, s]) => `translate(${x} ${y}) rotate(${phi})${s !== 1 ? ` scale(${s})` : ''}`;

/* ---------- 粉筆線條的濾鏡 ---------- */

function chalkFilters(wobble) {
  const one = (id, s1, s2) => `<filter id="${id}" x="-3%" y="-3%" width="106%" height="106%"><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="${s1}" result="n"></feTurbulence><feDisplacementMap in="SourceGraphic" in2="n" scale="${wobble}" xChannelSelector="R" yChannelSelector="G" result="d"></feDisplacementMap><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="${s2}" result="gr"></feTurbulence><feColorMatrix in="gr" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3.4 0 0 0 -0.6" result="ga"></feColorMatrix><feComposite in="d" in2="ga" operator="in"></feComposite></filter>`;
  return one('ck1', 4, 2) + one('ck2', 19, 7) + one('ck3', 33, 12);
}

/* ---------- 畫出整張桌面 ---------- */

function build() {
  const L = LAYOUTS[state.layout];
  let below = '';
  let tt = null;
  let ttItem = null;
  let nb = null;
  let nbItem = null;
  const plane = `scale(1 ${K})`;
  for (const it of L.items) {
    const [name, , , phi] = it;
    let inner = '';
    switch (name) {
      case 'jersey': inner = O.jersey('外國語學院', '12'); break;
      case 'photo': inner = O.photo(); break;
      case 'camera': inner = O.camera(phi); break;
      case 'clock': inner = O.clock(phi); break;
      case 'turntable': tt = O.turntable(phi, { withControls: L.deckControls }); ttItem = it; inner = tt.below; break;
      case 'notebook': nb = O.notebook(phi); nbItem = it; inner = nb.below; break;
      case 'note': inner = O.note(); break;
      case 'pick': inner = O.pick(); break;
      case 'headphones': inner = O.headphones(phi); break;
      case 'guitar': inner = O.guitar(phi); break;
      default: break;   // 盒子的內容由 renderBox 填
    }
    // 每件東西各自套粉筆效果：畫面局部變動時，只有碰到的那幾件需要重算
    below += `<g class="chalk boil"><g transform="${plane}"><g id="obj-${name}" transform="${place(it)}">${inner}</g></g></g>`;
  }
  const c = L.controls;
  const screenControls = c ? O.controls(c.xs, c.y, c.r) + O.seekLine(c.seek[0], c.seek[1], c.seek[2]) : '';

  // 畫面拆成幾層疊在一起：唱片轉動、歌詞出現時，只需要重畫那一層，
  // 不用每一幀都重算整張桌面的粉筆效果。
  const open = (id, extra = '') => `<svg id="${id}" class="layer" viewBox="0 0 ${L.w} ${L.h}" preserveAspectRatio="xMidYMid meet" ${extra}>`;
  const playing = stage.classList.contains('is-playing');
  stage.className = state.layout + (playing ? ' is-playing' : '');
  stage.innerHTML = `${open('scene', 'role="application" aria-label="桌上有一台唱片機和一盒唱片。把唱片放到唱片機上就會播放。"')}
<defs>${chalkFilters(state.layout === 'mobile' ? 3 : 4)}</defs>
<rect class="hit" id="backdrop" x="0" y="0" width="${L.w}" height="${L.h}"></rect>
${below}
</svg>
${open('layer-text', 'aria-hidden="true"')}
<g class="chalk"><g transform="${plane}"><g transform="${place(nbItem)}">${nb.text}</g></g></g>
</svg>
${open('layer-rec', 'aria-hidden="true"')}
<g class="chalk"><g transform="${plane}"><g transform="${place(ttItem)}">${tt.record}</g></g></g>
</svg>
${open('layer-top')}
<g class="chalk boil"><g transform="${plane}"><g transform="${place(ttItem)}">${tt.above}</g></g>${screenControls}</g>
<g class="chalk"><g id="plane-top" transform="${plane}"><g id="held" visibility="hidden"></g></g></g>
</svg>`;

  for (const g of document.querySelectorAll('.chalk')) g.setAttribute('filter', 'url(#ck1)');
  restore();
}

/** 重畫之後，把畫面恢復成目前的狀態 */
function restore() {
  const song = cur();
  if (state.browse) applyBrowse(); else renderBox();
  $('#platter-record').innerHTML = song && state.settled ? O.flatRecord(song) : '';
  setClock((song || state.songs[0] || {}).date);
  renderSpread(state.spread);
  armToTime();
  updatePlaying();
  updateProgress();
}

/* ---------- 盒子 ---------- */

/** 還在盒子裡的唱片（不含轉盤上那張），從前到後 */
const inBox = () => state.songs.map((_, i) => i).filter((i) => i !== state.current);

function renderBox() {
  const g = $('#obj-box');
  if (!g) return;
  const phi = item('box')[3];
  const { back, front } = O.box(phi);
  const n = state.songs.length;
  let recs = '';
  if (state.browse) {
    const list = inBox();
    const pos = clamp(state.browse.pos, 0, Math.max(0, list.length - 1));
    const base0 = pos === 0 ? 190 : 204 - 8 * (pos - 1) - 34;
    for (let j = list.length - 1; j >= 0; j--) {
      const i = list[j];
      if (j < pos) recs += O.standingRecord(state.songs[i], i, phi, 204 - 8 * j, 14);
      else recs += O.standingRecord(state.songs[i], i, phi, base0 - 9 * (j - pos), -12, j === pos ? 'peek' : '');
    }
  } else {
    const gap = n > 1 ? Math.min(14, 182 / (n - 1)) : 0;
    for (let i = n - 1; i >= 0; i--) {
      if (i === state.current) continue;
      recs += O.standingRecord(state.songs[i], i, phi, 204 - i * gap, 0, i === state.hover ? 'up' : '');
    }
  }
  g.innerHTML = back + recs + front;
}

function setHover(i) {
  if (state.hover === i) return;
  state.hover = i;
  for (const el of document.querySelectorAll('.rec')) el.classList.toggle('up', Number(el.dataset.i) === i);
}

/* ---------- 座標換算 ---------- */

function clientToPlane(x, y) {
  return new DOMPoint(x, y).matrixTransform($('#plane-top').getScreenCTM().inverse());
}

function elToPlane(el, x, y) {
  return new DOMPoint(x, y).matrixTransform($('#plane-top').getScreenCTM().inverse().multiply(el.getScreenCTM()));
}

function platterPos() {
  const pt = elToPlane($('#platter-center'), 0, 0);
  return { x: pt.x, y: pt.y, s: item('turntable')[4] };
}

function recordPos(i) {
  const boxScale = state.browse ? LAYOUTS[state.layout].browseBox[3] : item('box')[4];
  const rec = document.querySelector(`.rec[data-i="${i}"]`);
  if (!rec) {
    const pt = elToPlane($('#obj-box'), 165, 120);
    return { x: pt.x, y: pt.y, s: boxScale };
  }
  const pt = elToPlane(rec.firstElementChild, Number(rec.dataset.cx), -152);
  return { x: pt.x, y: pt.y, s: boxScale };
}

/* ---------- 拿在手上、或飛向唱片機的唱片 ---------- */

function showHeld(song) {
  const held = $('#held');
  held.innerHTML = O.flatRecord(song);
  held.setAttribute('visibility', 'visible');
}

function moveHeld(x, y, s) {
  $('#held').setAttribute('transform', `translate(${f1(x)} ${f1(y)}) scale(${s})`);
}

function hideHeld() {
  const held = $('#held');
  held.setAttribute('visibility', 'hidden');
  held.innerHTML = '';
}

function fly(song, from, to) {
  return new Promise((resolve) => {
    showHeld(song);
    const t0 = performance.now();
    const dur = 560;
    let done = false;
    const finish = () => { if (done) return; done = true; hideHeld(); resolve(); };
    const frame = (now) => {
      if (done) return;
      const t = clamp((now - t0) / dur, 0, 1);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const arc = Math.sin(Math.PI * t) * 70;
      moveHeld(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e - arc, from.s + (to.s - from.s) * e);
      if (t < 1) requestAnimationFrame(frame); else finish();
    };
    requestAnimationFrame(frame);
    // 頁面在背景時畫面不會更新，動畫等不到結束；時間到了就直接收尾
    setTimeout(finish, dur + 300);
  });
}

/* ---------- 播放 ---------- */

/**
 * 在使用者的手勢裡先讓 audio 元素靜音播一下再停住。
 * 這樣稍後（落針的沙沙聲之後）不在手勢裡呼叫 play()，瀏覽器也會放行。
 */
function prime(src) {
  audio.src = src;
  audio.muted = true;
  const p = audio.play();
  if (p) {
    p.then(() => {
      if (audio.muted) { audio.pause(); audio.currentTime = 0; audio.muted = false; }
    }).catch(() => { audio.muted = false; });
  }
}

/**
 * 把第 i 首放上唱片機。
 * gesture：這次呼叫發生在使用者的手勢裡。
 * instant：上一首剛播完要接下一首，立刻出聲，不等動畫（鎖屏時動畫不會跑）。
 * animate：唱片從盒子飛過去；拖放的時候不需要。
 */
async function putOn(i, { gesture = false, instant = false, animate = true } = {}) {
  const song = state.songs[i];
  if (!song) return;
  const token = ++state.token;
  const from = animate ? recordPos(i) : null;

  audio.pause();
  state.current = i;
  state.settled = false;
  state.starting = false;
  state.hover = null;
  setArm(O.ARM.rest);
  $('#platter-record').innerHTML = '';
  renderBox();
  setClock(song.date);
  loadLyrics(song, token);
  setMediaSession(song);
  updateProgress();

  if (instant) {
    audio.src = song.audio;
    audio.muted = false;
    audio.play().catch(() => {});
  } else if (gesture) {
    prime(song.audio);
  } else {
    audio.src = song.audio;
  }

  if (from && !reduced && !document.hidden) await fly(song, from, platterPos());
  if (token !== state.token) return;

  $('#platter-record').innerHTML = O.flatRecord(song);
  state.settled = true;
  sfx.thump();
  setArm(O.ARM.start);
  if (instant) return;

  state.starting = true;
  sfx.needle();
  await wait(900);
  if (token !== state.token) return;
  state.starting = false;
  audio.muted = false;
  try { audio.currentTime = 0; } catch { /* 還沒載入時不能設 */ }
  audio.play().catch(() => {});
}

function toggle() {
  if (state.current == null) {
    if (state.songs.length) putOn(0, { gesture: true });
    return;
  }
  if (state.starting) return;
  if (audio.paused) {
    if (audio.ended) audio.currentTime = 0;
    audio.muted = false;
    armToTime();
    audio.play().catch(() => {});
  } else {
    audio.pause();
  }
}

function step(d) {
  const n = state.songs.length;
  if (!n) return;
  if (state.current == null) {
    if (d > 0) putOn(0, { gesture: true });
    return;
  }
  const j = state.current + d;
  if (j < 0 || j >= n) return;       // 第一首和最後一首不循環
  putOn(j, document.hidden ? { instant: true } : { gesture: true });
}

function onEnded() {
  const n = state.songs.length;
  if (state.current != null && state.current < n - 1) {
    putOn(state.current + 1, { instant: true });
  } else {
    setArm(O.ARM.rest);
    sfx.thump();
    updatePlaying();
  }
}

const isPlaying = () => !audio.paused && !audio.muted;

function updatePlaying() {
  const on = isPlaying();
  stage.classList.toggle('is-playing', on);
  const btn = $('#btn-play');
  if (btn) {
    btn.querySelector('.icon').innerHTML = on ? O.ICON.pause : O.ICON.play;
    btn.setAttribute('aria-label', on ? '暫停' : '播放');
  }
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
}

const progress = () => (audio.duration > 0 && isFinite(audio.duration) ? clamp(audio.currentTime / audio.duration, 0, 1) : 0);

function setArm(deg, track = false) {
  const arm = $('#arm');
  if (!arm) return;
  arm.classList.toggle('track', track);
  arm.style.transform = `rotate(${f1(deg)}deg)`;
}

/** 唱臂的位置跟著播放進度走：從外圈到內圈 */
function armToTime(track = false) {
  if (state.current == null || !state.settled) { setArm(O.ARM.rest); return; }
  if (audio.ended) { setArm(O.ARM.rest); return; }
  setArm(O.ARM.start + (O.ARM.end - O.ARM.start) * progress(), track);
}

function updateProgress() {
  const seek = $('#seek');
  if (!seek) return;
  const x0 = Number(seek.dataset.x0);
  const x1 = Number(seek.dataset.x1);
  const p = state.current == null ? 0 : progress();
  const x = f1(x0 + (x1 - x0) * p);
  const knob = $('#seek-knob');
  const y = knob.getAttribute('cy');
  knob.setAttribute('cx', x);
  $('#seek-done').setAttribute('d', `M${x0},${y} L${x},${y}`);
  seek.setAttribute('aria-valuenow', Math.round(p * 100));
}

function seekFromPointer(e) {
  const seek = $('#seek');
  if (!seek || state.current == null || !(audio.duration > 0)) return;
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(seek.getScreenCTM().inverse());
  const x0 = Number(seek.dataset.x0);
  const x1 = Number(seek.dataset.x1);
  audio.currentTime = clamp((pt.x - x0) / (x1 - x0), 0, 1) * audio.duration;
  onTime();
}

function onTime() {
  updateProgress();
  if (state.settled && !state.starting) armToTime(isPlaying());
  updateLyrics(audio.currentTime);
}

function setMediaSession(song) {
  if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: song.title });
}

/* ---------- 時鐘 ---------- */

function setClock(date) {
  const [y = '', m = '', d = ''] = (date || '').split('-');
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('#clock-y', y);
  set('#clock-m', m);
  set('#clock-d', d);
}

/* ---------- 筆記本上的歌詞 ---------- */

async function loadLyrics(song, token) {
  state.lyrics = [];
  state.spread = 0;
  state.active = -1;
  renderSpread(0);
  if (!song.lyrics) return;
  try {
    const res = await fetch(song.lyrics);
    if (!res.ok) return;
    const lines = parseLyrics(await res.text());
    if (token !== state.token) return;
    state.lyrics = lines;
    renderSpread(0);
  } catch { /* 沒有歌詞就留白 */ }
}

function renderSpread(spread) {
  const g = $('#nb-text');
  if (!g) return;
  const song = cur();
  const P = O.PAGE;
  let out = '';
  if (song && spread === 0) {
    const size = Math.min(26, 205 / Math.max(O.textW(song.title), 1));
    out += `<text class="tx" x="24" y="38" font-size="${f1(size)}">${O.esc(song.title)}</text>`;
    // 歌名下面寫署名（詞曲、重製）。每首歌預設用 songs.json 最上面的 credits，個別歌可以自己另寫
    const credits = song.credits || state.credits;
    if (credits) {
      const small = Math.min(15, 198 / Math.max(O.textW(credits), 1));
      out += `<text class="tx" x="26" y="70" font-size="${f1(small)}" opacity=".55">${O.esc(credits)}</text>`;
    }
  }
  const [from, to] = rangeOf(spread, state.lyrics.length);
  for (let k = from; k < to; k++) {
    const { side, row } = slotOf(k);
    const text = state.lyrics[k].text;
    const squeeze = O.textW(text) * 20 > 204 ? ' textLength="204" lengthAdjust="spacingAndGlyphs"' : '';
    out += `<text class="ly" data-k="${k}" x="${side === 'L' ? 24 : 260}" y="${P.row0 - 4 + P.rowH * row}" font-size="20"${squeeze}>${O.esc(text)}</text>`;
  }
  g.innerHTML = out;
  markLines();
}

function markLines() {
  for (const el of document.querySelectorAll('#nb-text .ly')) {
    const k = Number(el.dataset.k);
    el.classList.toggle('on', k <= state.active);
    el.classList.toggle('past', k < state.active);
  }
}

function updateLyrics(t) {
  if (!state.lyrics.length || state.flipping) return;
  const a = activeAt(state.lyrics, t);
  if (a === state.active) return;
  state.active = a;
  const target = a < 0 ? 0 : spreadOf(a);
  if (target === state.spread) { markLines(); return; }
  if (target === state.spread + 1 && !reduced && !document.hidden) flipTo(target);
  else { state.spread = target; renderSpread(target); }
}

/** 這一頁寫滿了：右頁立起來翻到左邊，再接著寫 */
function flipTo(target) {
  const poly = $('#nb-flip');
  if (!poly) { state.spread = target; renderSpread(target); return; }
  const phi = item('notebook')[3];
  const token = state.token;
  state.flipping = true;
  for (const el of document.querySelectorAll('#nb-text .ly, #nb-text .tx')) {
    if (Number(el.getAttribute('x')) >= 240) el.setAttribute('visibility', 'hidden');
  }
  poly.setAttribute('visibility', 'visible');
  const t0 = performance.now();
  const dur = 950;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    poly.setAttribute('visibility', 'hidden');
    state.flipping = false;
    if (token !== state.token) return;
    // 翻頁的這一秒裡歌還在走，落下來時直接顯示現在唱到的那一頁
    state.active = activeAt(state.lyrics, audio.currentTime);
    state.spread = state.active < 0 ? target : spreadOf(state.active);
    renderSpread(state.spread);
  };
  const frame = (now) => {
    if (done) return;
    const t = clamp((now - t0) / dur, 0, 1);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const [ex, ey] = pageEdge(240, 237, 180 * e, phi);
    poly.setAttribute('points', `240,2 ${f1(ex)},${f1(2 + ey)} ${f1(ex)},${f1(328 + ey)} 240,328`);
    if (t < 1 && token === state.token) requestAnimationFrame(frame); else finish();
  };
  requestAnimationFrame(frame);
  setTimeout(finish, dur + 300);
}

/* ---------- 手機上的挑歌 ---------- */

function applyBrowse() {
  const L = LAYOUTS[state.layout];
  const g = $('#obj-box');
  if (!g) return;
  if (state.browse && L.browseBox) {
    const [x, y, phi, s] = L.browseBox;
    g.setAttribute('transform', `translate(${x} ${y}) rotate(${phi}) scale(${s})`);
  } else {
    g.setAttribute('transform', place(item('box')));
  }
  const nb = $('#obj-notebook');
  if (nb) nb.classList.toggle('dim', Boolean(state.browse));
  const text = $('#layer-text');
  if (text) text.style.visibility = state.browse ? 'hidden' : '';
  renderBox();
}

function openBrowse(i) {
  const list = inBox();
  if (!list.length) return;
  let pos = i == null ? -1 : list.indexOf(i);
  if (pos < 0) pos = state.current == null ? 0 : clamp(list.findIndex((j) => j > state.current), 0, list.length - 1);
  state.browse = { pos };
  applyBrowse();
}

function closeBrowse() {
  state.browse = null;
  applyBrowse();
}

function browseStep(d) {
  const list = inBox();
  const pos = clamp(state.browse.pos + d, 0, list.length - 1);
  if (pos === state.browse.pos) return;
  state.browse.pos = pos;
  renderBox();
}

/* ---------- 操作 ---------- */

let ptr = null;

function onDown(e) {
  sfx.unlock();
  if (e.button > 0) return;
  const svg = stage;
  if (e.target.closest('.btn')) return;
  if (e.target.closest('#seek')) {
    ptr = { type: 'seek' };
    svg.setPointerCapture(e.pointerId);
    seekFromPointer(e);
    return;
  }
  const recEl = e.target.closest('.rec');
  const rec = recEl ? Number(recEl.dataset.i) : null;
  const onBox = Boolean(e.target.closest('#obj-box'));
  const touch = e.pointerType === 'touch';
  ptr = { type: 'tap', x0: e.clientX, y0: e.clientY, lastX: e.clientX, rec, onBox, moved: false };
  if (state.layout === 'mobile') {
    if (state.browse) { ptr.type = 'browse'; svg.setPointerCapture(e.pointerId); }
  } else if (rec != null && !touch) {
    ptr.type = 'drag-pending';
    svg.setPointerCapture(e.pointerId);
  }
}

function onMove(e) {
  if (!ptr) return;
  if (ptr.type === 'seek') { seekFromPointer(e); return; }
  const dist = Math.hypot(e.clientX - ptr.x0, e.clientY - ptr.y0);
  if (dist > 8) ptr.moved = true;
  if (ptr.type === 'drag-pending' && dist > 5) {
    ptr.type = 'drag';
    stage.classList.add('dragging');
    const el = document.querySelector(`.rec[data-i="${ptr.rec}"]`);
    if (el) el.setAttribute('visibility', 'hidden');
    showHeld(state.songs[ptr.rec]);
  }
  if (ptr.type === 'drag') {
    const pt = clientToPlane(e.clientX, e.clientY);
    moveHeld(pt.x, pt.y, item('turntable')[4]);
  }
  if (ptr.type === 'browse') {
    const dx = e.clientX - ptr.lastX;
    if (Math.abs(dx) > 26) { browseStep(dx < 0 ? 1 : -1); ptr.lastX = e.clientX; }
  }
}

function onUp(e) {
  const p = ptr;
  ptr = null;
  if (!p) return;
  const svg = stage;
  if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  if (p.type === 'seek') return;

  if (p.type === 'drag') {
    svg.classList.remove('dragging');
    hideHeld();
    const pt = clientToPlane(e.clientX, e.clientY);
    const c = platterPos();
    if (Math.hypot(pt.x - c.x, pt.y - c.y) < 175 * c.s) {
      putOn(p.rec, { gesture: true, animate: false });
    } else {
      const el = document.querySelector(`.rec[data-i="${p.rec}"]`);
      if (el) el.removeAttribute('visibility');
    }
    return;
  }
  if (p.moved) return;

  if (state.layout === 'mobile') {
    if (state.browse) {
      const list = inBox();
      if (p.rec != null && p.rec === list[state.browse.pos]) {
        const from = p.rec;
        const start = recordPos(from);
        closeBrowse();
        putOnFrom(from, start);
      } else if (p.rec != null && list.includes(p.rec)) {
        state.browse.pos = list.indexOf(p.rec);
        renderBox();
      } else if (!p.onBox) {
        closeBrowse();
      }
    } else if (p.onBox) {
      openBrowse(p.rec);
    }
    return;
  }
  // 電腦版面但用手指點：點一下就飛上去
  if (p.type === 'tap' && p.rec != null) putOn(p.rec, { gesture: true });
}

/** 挑歌時盒子的位置和平常不同：先記下唱片原來的位置，再讓它從那裡飛過去 */
async function putOnFrom(i, start) {
  const song = state.songs[i];
  const token = ++state.token;
  audio.pause();
  state.current = i;
  state.settled = false;
  state.starting = false;
  setArm(O.ARM.rest);
  $('#platter-record').innerHTML = '';
  renderBox();
  setClock(song.date);
  loadLyrics(song, token);
  setMediaSession(song);
  updateProgress();
  prime(song.audio);
  if (!reduced) await fly(song, start, platterPos());
  if (token !== state.token) return;
  $('#platter-record').innerHTML = O.flatRecord(song);
  state.settled = true;
  sfx.thump();
  setArm(O.ARM.start);
  state.starting = true;
  sfx.needle();
  await wait(900);
  if (token !== state.token) return;
  state.starting = false;
  audio.muted = false;
  try { audio.currentTime = 0; } catch { /* 還沒載入 */ }
  audio.play().catch(() => {});
}

function onCancel() {
  if (ptr && ptr.type === 'drag') {
    hideHeld();
    stage.classList.remove('dragging');
    renderBox();
  }
  ptr = null;
}

function onOver(e) {
  if (ptr || e.pointerType !== 'mouse' || state.layout === 'mobile') return;
  const rec = e.target.closest('.rec');
  if (rec) setHover(Number(rec.dataset.i));
}

function onOut(e) {
  if (ptr || e.pointerType !== 'mouse') return;
  const rec = e.target.closest('.rec');
  if (!rec) return;
  const to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('.rec') : null;
  if (to !== rec) setHover(to ? Number(to.dataset.i) : null);
}

function press(id) {
  if (id === 'btn-play') toggle();
  else if (id === 'btn-prev') step(-1);
  else if (id === 'btn-next') step(1);
}

function onClick(e) {
  const btn = e.target.closest('.btn');
  if (btn) press(btn.id);
}

function onKey(e) {
  const btn = e.target.closest ? e.target.closest('.btn') : null;
  if (btn && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); sfx.unlock(); press(btn.id); return; }
  if (e.target.id === 'seek' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && audio.duration > 0) {
    e.preventDefault();
    audio.currentTime = clamp(audio.currentTime + (e.key === 'ArrowRight' ? 5 : -5), 0, audio.duration);
    onTime();
  }
}

function bind() {
  const svg = stage;
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onCancel);
  svg.addEventListener('pointerover', onOver);
  svg.addEventListener('pointerout', onOut);
  svg.addEventListener('click', onClick);
  svg.addEventListener('keydown', onKey);
}

/* ---------- 啟動 ---------- */

async function init() {
  const dev = new URLSearchParams(location.search).has('dev');
  const data = await (await fetch('songs.json')).json();
  state.songs = data.songs.filter((s) => dev || !s.dev);
  state.credits = data.credits || '';
  state.layout = pickLayout();
  bind();
  build();

  audio.addEventListener('play', updatePlaying);
  audio.addEventListener('pause', updatePlaying);
  audio.addEventListener('volumechange', updatePlaying);
  audio.addEventListener('timeupdate', onTime);
  audio.addEventListener('loadedmetadata', onTime);
  audio.addEventListener('ended', onEnded);

  if ('mediaSession' in navigator) {
    const set = (name, fn) => { try { navigator.mediaSession.setActionHandler(name, fn); } catch { /* 不支援就算了 */ } };
    set('play', () => { if (audio.paused) toggle(); });
    set('pause', () => { if (!audio.paused) toggle(); });
    set('previoustrack', () => step(-1));
    set('nexttrack', () => step(1));
  }

  // 線條輕微抖動
  if (!reduced) {
    let n = 0;
    setInterval(() => {
      if (document.hidden) return;
      n = (n + 1) % 3;
      for (const g of document.querySelectorAll('.boil')) g.setAttribute('filter', `url(#ck${n + 1})`);
    }, 180);
  }

  // 還沒放唱片時，第一張偶爾抬一下，提示可以拿
  setInterval(() => {
    if (state.current != null || state.hover != null || ptr || state.browse || document.hidden) return;
    const first = document.querySelector('.rec[data-i="0"]');
    if (!first) return;
    first.classList.add('peek');
    setTimeout(() => first.classList.remove('peek'), 700);
  }, 9000);

  let timer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const next = pickLayout();
      if (next === state.layout) return;
      state.layout = next;
      state.browse = null;
      state.hover = null;
      build();
    }, 150);
  });

  if (dev) window.__app = { state, audio, putOn, toggle, step, openBrowse, closeBrowse, browseStep };
}

init();
