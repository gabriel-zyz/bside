// 桌上每一件東西的線條畫。每個函式回傳 SVG 字串，畫在物件自己的座標裡；
// 位置、角度、大小由 layout.js 決定。phi 是物件在桌面上轉的角度，
// 立體的部分（厚度、側面）會依 phi 算出來。

import { up, face, tangent, f1 } from './projection.js';

const p = (x, y) => `${f1(x)},${f1(y)}`;
const tr = ([x, y]) => `translate(${f1(x)} ${f1(y)})`;
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 歌名排版 ---------- */

const charW = (c) => (/[\u0000-ÿ]/.test(c) ? 0.55 : 1);
export const textW = (s) => [...s].reduce((a, c) => a + charW(c), 0);

/** 把歌名拆成最多兩行，盡量在標點或空格處斷開 */
export function titleLines(title) {
  const chars = [...title];
  const total = textW(title);
  if (total <= 4.6) return [title];
  let best = -1;
  let bestD = Infinity;
  let acc = 0;
  chars.forEach((c, i) => {
    acc += charW(c);
    if (/[，,、\s·]/.test(c)) {
      const d = Math.abs(acc - total / 2);
      if (d < bestD) { bestD = d; best = i; }
    }
  });
  if (best < 0 || bestD > total * 0.3) {
    acc = 0;
    best = chars.length - 1;
    for (let i = 0; i < chars.length; i++) {
      acc += charW(chars[i]);
      if (acc >= total / 2) { best = i; break; }
    }
  }
  const a = chars.slice(0, best + 1).join('').trim();
  const b = chars.slice(best + 1).join('').trim();
  return b ? [a, b] : [a];
}

/** 圓標上的字：歌名和年份。cx, cy 是圓標中心 */
function labelText(song, cx, cy, r) {
  const lines = titleLines(song.title);
  const year = (song.date || '').slice(0, 4);
  const fit = (s) => Math.min(21, (r * 1.72) / Math.max(textW(s), 1));
  let out = '';
  if (lines.length === 1) {
    out += `<text class="tx" x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="${f1(fit(lines[0]))}">${esc(lines[0])}</text>`;
  } else {
    out += `<text class="tx" x="${cx}" y="${cy - 16}" text-anchor="middle" font-size="${f1(fit(lines[0]))}">${esc(lines[0])}</text>`;
    out += `<text class="tx" x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="${f1(fit(lines[1]))}">${esc(lines[1])}</text>`;
  }
  if (year) out += `<text class="tx" x="${cx}" y="${cy + 34}" text-anchor="middle" font-size="12" opacity=".7">${year}</text>`;
  return out;
}

/* ---------- 唱片 ---------- */

/** 平放的唱片（在轉盤上、或被拿在手上）。中心在原點，半徑 152 */
export function flatRecord(song) {
  return `
<circle class="s" cx="0" cy="0" r="152"></circle>
<circle class="g" cx="0" cy="0" r="142"></circle>
<circle class="g" cx="0" cy="0" r="130"></circle>
<circle class="g" cx="0" cy="0" r="118"></circle>
<circle class="g" cx="0" cy="0" r="106"></circle>
<circle class="g" cx="0" cy="0" r="94"></circle>
<circle class="g" cx="0" cy="0" r="82"></circle>
<circle class="g" cx="0" cy="0" r="70"></circle>
<path class="f" d="M136,0 A136,136 0 0 1 96.2,96.2"></path>
<path class="f" d="M-112,0 A112,112 0 0 1 -79.2,-79.2"></path>
<path class="f" d="M0,88 A88,88 0 0 1 -62.2,62.2"></path>
<path class="f" d="M53,-112 A124,124 0 0 1 112,-53"></path>
<circle class="l" cx="0" cy="0" r="56"></circle>
${labelText(song, 0, 0, 56)}`;
}

/**
 * 盒子裡立著的一張唱片。depth 是它在盒子裡的前後位置，lean 是往前倒的角度。
 * 外層 g 帶 class "rec" 和 data-i，裡層 "lift" 用來抬起。
 */
export function standingRecord(song, i, phi, depth, lean = 0, cls = '') {
  const [cx, cy] = face(phi, lean);
  const x = 165 + ((i * 37) % 5) - 2;
  const back = lean > 0;
  const inner = back
    ? `<circle class="s" cx="${x}" cy="-152" r="150"></circle><circle class="f" cx="${x}" cy="-152" r="52"></circle><circle class="f" cx="${x}" cy="-152" r="4"></circle>`
    : `<circle class="s" cx="${x}" cy="-152" r="150"></circle>
<circle class="g" cx="${x}" cy="-152" r="138"></circle><circle class="g" cx="${x}" cy="-152" r="121"></circle><circle class="g" cx="${x}" cy="-152" r="104"></circle><circle class="g" cx="${x}" cy="-152" r="87"></circle><circle class="g" cx="${x}" cy="-152" r="70"></circle>
<circle class="l" cx="${x}" cy="-152" r="56"></circle>${labelText(song, x, -152, 56)}`;
  return `<g class="rec ${cls}" data-i="${i}" data-cx="${x}" transform="matrix(1 0 ${cx.toFixed(4)} ${cy.toFixed(4)} 0 ${f1(depth)})"><g class="lift">${inner}</g></g>`;
}

/* ---------- 盒子（phi 要大於 0：看得到正面和右側面） ---------- */

export function box(phi) {
  const [ux, uy] = up(110, phi);
  const [cx, cy] = face(phi);
  const back = `
<polygon class="s" points="${p(0, 0)} ${p(330, 0)} ${p(330 + ux, uy)} ${p(ux, uy)}"></polygon>
<polygon class="s" points="${p(0, 0)} ${p(0, 240)} ${p(ux, 240 + uy)} ${p(ux, uy)}"></polygon>`;
  const front = `
<polygon class="s" points="${p(330, 0)} ${p(330, 240)} ${p(330 + ux, 240 + uy)} ${p(330 + ux, uy)}"></polygon>
<polygon class="s boxfront" points="${p(0, 240)} ${p(330, 240)} ${p(330 + ux, 240 + uy)} ${p(ux, 240 + uy)}"></polygon>
<g transform="matrix(1 0 ${cx.toFixed(4)} ${cy.toFixed(4)} 0 240)" pointer-events="none"><rect class="f" x="112" y="-124" width="106" height="44"></rect><path class="f" d="M124,-106 c6,-8 10,6 16,0 s10,6 16,-1 s10,-6 16,1 s8,4 14,-1 s6,3 10,0"></path><path class="f" d="M124,-92 c6,-6 10,5 16,0 s8,5 14,-1 s8,3 12,0"></path></g>
<g transform="matrix(0 1 ${cx.toFixed(4)} ${cy.toFixed(4)} 330 0)" pointer-events="none"><rect class="f" x="84" y="-150" width="72" height="24" rx="12"></rect></g>`;
  return { back, front };
}

/* ---------- 唱片機（phi 要小於 0：看得到正面和左側面） ---------- */

export const ARM = { pivot: [440, 72], rest: -44.5, start: -20.6, end: 0.9 };
export const PLATTER = [195, 200];
export const SEEK = { x0: 28, x1: 350, y: 384 };

function deckButton(act, cx, cy, label, icon, r) {
  return `<g class="btn" data-act="${act}" role="button" tabindex="0" aria-label="${label}"><circle class="hit" cx="${cx}" cy="${cy}" r="${r + 7}"></circle><circle class="l ring" cx="${cx}" cy="${cy}" r="${r}"></circle><g transform="translate(${cx} ${cy}) scale(${f1(r / 17)})" class="icon">${icon}</g></g>`;
}

export const ICON = {
  prev: `<path class="l" d="M-6,-6 L-6,6 M6,-6 L-2.5,0 L6,6 Z"></path>`,
  next: `<path class="l" d="M6,-6 L6,6 M-6,-6 L2.5,0 L-6,6 Z"></path>`,
  play: `<path class="l" d="M-4.5,-7.5 L7,0 L-4.5,7.5 Z"></path>`,
  pause: `<path class="l" d="M-4,-6.5 L-4,6.5 M4,-6.5 L4,6.5"></path>`,
};

/** 進度線。畫在 (x0,y)–(x1,y) 之間 */
export function seekLine(x0, x1, y) {
  return `<g class="seek" role="slider" tabindex="0" aria-label="播放進度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-x0="${x0}" data-x1="${x1}">
<rect class="hit" x="${x0 - 8}" y="${y - 14}" width="${x1 - x0 + 16}" height="28"></rect>
<path class="g" d="M${x0},${y} L${x1},${y}"></path>
<path class="l seek-done" d="M${x0},${y} L${x0},${y}"></path>
<circle class="s seek-knob" cx="${x0}" cy="${y}" r="4.5"></circle></g>`;
}

export function controls(xs, y, r = 17) {
  return deckButton('prev', xs[0], y, '上一首', ICON.prev, r)
    + deckButton('play', xs[1], y, '播放', ICON.play, r)
    + deckButton('next', xs[2], y, '下一首', ICON.next, r);
}

/**
 * 回傳三層：below（機身、轉盤）、record（唱片要放進去的空位）、above（唱臂）。
 * 三層要用同一個外層 transform，分開是因為唱片在機身上面、唱臂又在唱片上面。
 */
export function turntable(phi, { withControls = true } = {}) {
  const U = up(30, phi);
  const [ux, uy] = U;
  const pl = up(8, phi);
  const [tx, ty] = tangent(166, phi);
  const pv = up(14, phi);
  const [px, py] = tangent(24, phi);
  const rest = up(11, phi);
  const [rx, ry] = tangent(7, phi);
  const foot = up(-6, phi);
  const [PX, PY] = ARM.pivot;
  const [CX, CY] = PLATTER;

  const below = `
<polygon class="s" points="${p(30, 400)} ${p(72, 400)} ${p(72 + foot[0], 400 + foot[1])} ${p(30 + foot[0], 400 + foot[1])}"></polygon>
<polygon class="s" points="${p(428, 400)} ${p(470, 400)} ${p(470 + foot[0], 400 + foot[1])} ${p(428 + foot[0], 400 + foot[1])}"></polygon>
<polygon class="s" points="${p(0, 0)} ${p(0, 400)} ${p(ux, 400 + uy)} ${p(ux, uy)}"></polygon>
<polygon class="s" points="${p(0, 400)} ${p(500, 400)} ${p(500 + ux, 400 + uy)} ${p(ux, 400 + uy)}"></polygon>
<g transform="${tr(U)}">
<rect class="s" x="0" y="0" width="500" height="400"></rect>
<rect class="g" x="9" y="9" width="482" height="382"></rect>
<circle class="l" cx="36" cy="36" r="12"></circle>
<path class="l" d="M36,36 L36,27"></path>
<circle class="s" cx="418" cy="200" r="7"></circle>
<path class="l" d="M${p(418 - rx, 200 - ry)} l${p(rest[0], rest[1])} M${p(418 + rx, 200 + ry)} l${p(rest[0], rest[1])}"></path>
<g transform="${tr(rest)}"><circle class="s" cx="418" cy="200" r="7"></circle><path class="f" d="M413,200 L423,200"></path></g>
<circle class="s platter" cx="${CX}" cy="${CY}" r="166"></circle>
<path class="l" d="M${p(CX - tx, CY - ty)} l${p(pl[0], pl[1])} M${p(CX + tx, CY + ty)} l${p(pl[0], pl[1])}"></path>
<g transform="${tr(pl)}">
<circle class="s platter" id="platter" cx="${CX}" cy="${CY}" r="166"></circle>
<g transform="translate(${CX} ${CY})" id="platter-center">
<circle class="f" cx="0" cy="0" r="159" stroke-dasharray="1 7"></circle>
<circle class="f" id="platter-hint" cx="0" cy="0" r="152" stroke-dasharray="5 8"></circle>
<circle class="s" cx="0" cy="0" r="3.5"></circle>
</g>
</g>
<circle class="s" cx="${PX}" cy="${PY}" r="24"></circle>
<path class="l" d="M${p(PX - px, PY - py)} l${p(pv[0], pv[1])} M${p(PX + px, PY + py)} l${p(pv[0], pv[1])}"></path>
${withControls ? controls([372, 420, 468], 338) + seekLine(SEEK.x0, SEEK.x1, SEEK.y) : ''}
</g>`;

  const record = `
<g transform="${tr(U)}"><g transform="${tr(pl)}"><g transform="translate(${CX} ${CY})">
<g class="spin" id="platter-record"></g>
<circle class="s" cx="0" cy="0" r="3.5"></circle>
</g></g></g>`;

  // 唱臂以軸心為原點畫，轉動時就不用另外指定圓心
  const above = `
<g transform="${tr(U)}"><g transform="${tr(pv)}"><g transform="translate(${PX} ${PY})">
<circle class="s" cx="0" cy="0" r="24"></circle>
<circle class="f" cx="0" cy="0" r="15"></circle>
<g id="arm" style="transform: rotate(${ARM.rest}deg)">
<path class="bo" stroke-width="17" d="M16.3,-11.6 L40.7,-29.1"></path>
<path class="bi" stroke-width="14.7" d="M17.2,-12.3 L39.8,-28.4"></path>
<path class="to" stroke-width="5.4" d="M16.3,-11.6 L-120.4,86"></path>
<path class="ti" stroke-width="3.1" d="M16.3,-11.6 L-120.4,86"></path>
<path class="bo" stroke-width="13" d="M-118.8,84.8 L-143.2,102.3"></path>
<path class="bi" stroke-width="10.7" d="M-119.7,85.5 L-142.3,101.6"></path>
<path class="l" d="M-140,106.6 L-132.5,117.2"></path>
</g>
<circle class="dot" cx="0" cy="0" r="2.6"></circle>
</g></g></g>`;

  return { below, record, above };
}

/* ---------- 筆記本 ---------- */

export const PAGE = { w: 480, h: 330, spine: 240, rows: 9, row0: 50, rowH: 30 };

/**
 * 回傳兩層：below 是本子本身，text 是寫在上面的字和翻頁的那一頁。
 * 字單獨一層，是為了歌詞出現時不用重畫整張桌面。兩層要用同一個外層 transform。
 */
export function notebook(phi) {
  const U = up(6, phi);
  const rules = (x0, x1) => Array.from({ length: PAGE.rows }, (_, k) => `M${x0},${PAGE.row0 + PAGE.rowH * k} H${x1}`).join(' ');
  const below = `
<rect class="s" x="0" y="0" width="480" height="330"></rect>
<g transform="${tr(U)}">
<rect class="s" x="3" y="2" width="237" height="326"></rect>
<rect class="s" x="240" y="2" width="237" height="326"></rect>
<path class="g" d="${rules(22, 224)}"></path>
<path class="g" d="${rules(258, 460)}"></path>
<path class="to" stroke-width="4.5" stroke-dasharray="0.1 17" d="M240,16 L240,318"></path>
</g>`;
  const text = `
<g transform="${tr(U)}">
<g id="nb-text"></g>
<polygon class="s" id="nb-flip" points="240,2 477,2 477,328 240,328" visibility="hidden"></polygon>
</g>`;
  return { below, text };
}

/* ---------- 時鐘（phi 要小於 0） ---------- */

export function clock(phi) {
  const [ux, uy] = up(70, phi);
  const [cx, cy] = face(phi);
  return `
<polygon class="s" points="${p(0, 0)} ${p(0, 64)} ${p(ux, 64 + uy)} ${p(ux, uy)}"></polygon>
<polygon class="s" points="${p(0, 64)} ${p(200, 64)} ${p(200 + ux, 64 + uy)} ${p(ux, 64 + uy)}"></polygon>
<g transform="translate(${f1(ux)} ${f1(uy)})"><rect class="s" x="0" y="0" width="200" height="64"></rect></g>
<g transform="matrix(1 0 ${cx.toFixed(4)} ${cy.toFixed(4)} 0 64)">
<rect class="l" x="8" y="-102" width="88" height="86"></rect>
<rect class="l" x="104" y="-102" width="42" height="86"></rect>
<rect class="l" x="152" y="-102" width="42" height="86"></rect>
<path class="f" d="M8,-59 L96,-59 M104,-59 L146,-59 M152,-59 L194,-59"></path>
<text class="dg" id="clock-y" x="52" y="-47" text-anchor="middle" font-size="31"></text>
<text class="dg" id="clock-m" x="125" y="-47" text-anchor="middle" font-size="31"></text>
<text class="dg" id="clock-d" x="173" y="-47" text-anchor="middle" font-size="31"></text>
</g>`;
}

/* ---------- 照片和相機 ---------- */

export function photo() {
  return `
<rect class="s" x="0" y="0" width="124" height="146"></rect>
<rect class="l" x="10" y="10" width="104" height="100"></rect>
<path class="f" d="M10,84 L114,84"></path>
<path class="f" d="M10,76 C30,68 44,72 58,76"></path>
<path class="l" d="M64,84 C63,74 65,66 62,56"></path>
<path class="l" d="M62,62 C56,56 50,54 44,53"></path>
<path class="l" d="M63,60 C70,54 78,52 86,52"></path>
<path class="l" d="M34,52 C48,40 76,38 94,50 C74,45 52,46 34,52 Z"></path>
<circle class="l" cx="96" cy="30" r="8"></circle>
<path class="f" d="M20,96 l3,-5 M30,98 l2,-5 M84,96 l3,-5 M98,99 l2,-5 M46,100 l2,-4"></path>`;
}

/** phi 要大於 0 */
export function camera(phi) {
  const [ux, uy] = up(30, phi);
  const lens = up(22, phi);
  const [tx, ty] = tangent(32, phi);
  return `
<path class="l" d="M2,52 C-38,62 -58,118 -20,138 S52,128 30,152"></path>
<polygon class="s" points="${p(150, 0)} ${p(150, 95)} ${p(150 + ux, 95 + uy)} ${p(150 + ux, uy)}"></polygon>
<polygon class="s" points="${p(0, 95)} ${p(150, 95)} ${p(150 + ux, 95 + uy)} ${p(ux, 95 + uy)}"></polygon>
<g transform="translate(${f1(ux)} ${f1(uy)})">
<polygon class="s" points="50,0 59,-11 91,-11 100,0"></polygon>
<rect class="s" x="16" y="-6" width="16" height="6"></rect>
<rect class="s" x="114" y="-7" width="24" height="7"></rect>
<rect class="s" x="0" y="0" width="150" height="95"></rect>
<path class="f" d="M0,18 H150 M0,80 H150"></path>
<rect class="l" x="112" y="27" width="26" height="15"></rect>
<circle class="s" cx="72" cy="50" r="32"></circle>
<path class="l" d="M${p(72 + tx, 50 + ty)} l${p(lens[0], lens[1])} M${p(72 - tx, 50 - ty)} l${p(lens[0], lens[1])}"></path>
<g transform="${tr(lens)}">
<circle class="s" cx="72" cy="50" r="32"></circle>
<circle class="l" cx="72" cy="50" r="24"></circle>
<circle class="f" cx="72" cy="50" r="14"></circle>
<path class="f" d="M60,40 a16,16 0 0 1 12,-6"></path>
</g>
</g>`;
}

/* ---------- 籃球服 ---------- */

export function jersey(text, number) {
  return `
<path class="s" d="M55,0 L95,0 C95,50 110,72 125,72 C140,72 155,50 155,0 L195,0 C195,70 215,125 232,140 L238,360 L12,360 L18,140 C35,125 55,70 55,0 Z"></path>
<path class="f" d="M84,0 C85,58 106,83 125,83 C144,83 165,58 166,0"></path>
<path class="f" d="M66,0 C66,74 44,128 28,144"></path>
<path class="f" d="M184,0 C184,74 206,128 222,144"></path>
<path class="f" d="M14,344 L236,344"></path>
<path class="g" d="M40,200 C70,230 80,290 62,358"></path>
<path class="g" d="M205,190 C180,240 190,300 204,358"></path>
<text class="ot" x="125" y="170" text-anchor="middle" font-size="27" letter-spacing="2">${esc(text)}</text>
<text class="nb" x="125" y="268" text-anchor="middle" font-size="96">${esc(number)}</text>`;
}

/* ---------- 吉他 ---------- */

const BODY = 'M0,-125 C40,-125 72,-115 72,-80 C72,-55 56,-45 56,-22 C56,5 96,15 96,60 C96,105 55,125 0,125 C-55,125 -96,105 -96,60 C-96,15 -56,5 -56,-22 C-56,-45 -72,-55 -72,-80 C-72,-115 -40,-125 0,-125 Z';

export function guitar(phi) {
  const U = up(30, phi);
  const [tx, ty] = tangent(96, phi);
  const under = up(-10, phi);
  const frets = [-284.9, -265.9, -248, -231.1, -215.2, -200.1, -185.9, -172.5, -159.9, -147.9, -136.6, -126, -116, -106.5, -97.5, -89, -81]
    .map((y) => { const w = 14 - (2.5 * (-72 - y)) / 233; return `M${f1(-w)},${y} H${f1(w)}`; }).join(' ');
  const strings = [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5].map((x, i) => `M${x},53 L${f1(-8.5 + i * 3.4)},-305`).join(' ');
  const pegs = [-331, -349, -367].map((y) => `<circle class="l" cx="-24" cy="${y}" r="4.5"></circle><circle class="l" cx="24" cy="${y}" r="4.5"></circle>`).join('');
  return `
<path class="s" d="${BODY}"></path>
<path class="l" d="M${p(tx, 60 + ty)} l${p(U[0], U[1])} M${p(-tx, 60 - ty)} l${p(U[0], U[1])}"></path>
<g transform="${tr(U)}">
<path class="s" d="${BODY}"></path>
<circle class="l" cx="0" cy="-42" r="26"></circle>
<circle class="f" cx="0" cy="-42" r="31"></circle>
<rect class="l" x="-36" y="48" width="72" height="11" rx="2"></rect>
<g transform="${tr(under)}"><polygon class="s" points="-14,-118 14,-118 11.5,-305 -11.5,-305"></polygon></g>
<polygon class="s" points="-11.5,-305 11.5,-305 17,-317 16,-383 -16,-383 -17,-317"></polygon>
${pegs}
<path class="f" d="M-16.5,-331 H-19.5 M-16.3,-349 H-19.5 M-16.1,-367 H-19.5 M16.5,-331 H19.5 M16.3,-349 H19.5 M16.1,-367 H19.5"></path>
<polygon class="s" points="-14,-72 14,-72 11.5,-305 -11.5,-305"></polygon>
<path class="l" d="M-11.5,-305 H11.5"></path>
<path class="f" d="${frets}"></path>
<path class="f" d="${strings}"></path>
</g>`;
}

/* ---------- 耳機、紙條、撥片 ---------- */

export function headphones(phi) {
  const U = up(16, phi);
  const [tx, ty] = tangent(40, phi);
  const side = (c) => `M${p(c - tx, -ty)} l${p(U[0], U[1])} M${p(c + tx, ty)} l${p(U[0], U[1])}`;
  return `
<path class="to" stroke-width="9" d="M-62,-30 C-80,-190 80,-190 62,-30"></path>
<path class="ti" stroke-width="6.7" d="M-62,-30 C-80,-190 80,-190 62,-30"></path>
<path class="l" d="M-70,36 C-95,80 -40,100 -70,150 S-110,170 -130,210"></path>
<circle class="s" cx="-62" cy="0" r="40"></circle>
<circle class="s" cx="62" cy="0" r="40"></circle>
<path class="l" d="${side(-62)} ${side(62)}"></path>
<g transform="${tr(U)}">
<circle class="s" cx="-62" cy="0" r="40"></circle>
<circle class="f" cx="-62" cy="0" r="27"></circle>
<circle class="s" cx="62" cy="0" r="40"></circle>
<circle class="f" cx="62" cy="0" r="27"></circle>
</g>`;
}

/**
 * 檯燈：立在桌上，底座、兩節燈臂、朝著桌面的燈罩。整盞燈是一個可以點的開關。
 * 它是站起來的東西，直接用螢幕上的樣子畫（原點在底座中心），不經過桌面的壓扁。
 */
export const LAMP = { mouth: [-107.2, -118.4], dir: [-0.6, 0.8], across: [0.8, 0.6], half: 50 };

export function lamp() {
  return `<g class="btn" data-act="lamp" role="button" tabindex="0" aria-label="檯燈">
<rect class="hit" x="-165" y="-200" width="225" height="245"></rect>
<ellipse class="s" cx="0" cy="0" rx="46" ry="37"></ellipse>
<path class="l" d="M-46,0 v-7 M46,0 v-7"></path>
<ellipse class="s" cx="0" cy="-7" rx="46" ry="37"></ellipse>
<ellipse class="f" cx="0" cy="-7" rx="14" ry="11"></ellipse>
<path class="to" stroke-width="8" d="M0,-9 L34,-120"></path>
<path class="ti" stroke-width="5.7" d="M0,-9 L34,-120"></path>
<path class="to" stroke-width="8" d="M34,-120 L-70,-168"></path>
<path class="ti" stroke-width="5.7" d="M34,-120 L-70,-168"></path>
<circle class="s" cx="34" cy="-120" r="7"></circle>
<circle class="s" cx="-70" cy="-168" r="16"></circle>
<polygon class="s" points="-57.2,-158.4 -67.2,-88.4 -147.2,-148.4 -82.8,-177.6"></polygon>
<ellipse class="s ring mouth" cx="-107.2" cy="-118.4" rx="50" ry="26" transform="rotate(36.87 -107.2 -118.4)"></ellipse>
<circle class="l" cx="-104" cy="-122" r="11"></circle>
</g>`;
}

export function note() {
  return `
<g id="note">
<path class="s" d="M0,0 L132,0 L150,18 L150,96 L0,96 Z"></path>
<path class="l" d="M132,0 L132,18 L150,18"></path>
<path class="f" d="M16,36 c8,-10 10,8 18,0 s10,6 18,-2 s12,8 20,0 s10,-6 18,2 s8,4 16,-2"></path>
<path class="f" d="M16,56 c6,-8 12,6 20,-1 s10,7 18,0 s12,-6 20,2 s10,4 18,-2 s6,4 12,0"></path>
<path class="f" d="M16,76 c8,-8 10,6 18,0 s12,6 20,-2 s8,4 14,0"></path>
</g>`;
}

export function pick() {
  return `<path class="s" d="M0,-14 C12,-14 16,-6 12,2 L3,14 C1,17 -1,17 -3,14 L-12,2 C-16,-6 -12,-14 0,-14 Z"></path>`;
}
