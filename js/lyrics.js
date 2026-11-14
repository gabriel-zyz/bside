// 歌詞：讀 LRC 檔，以及決定每一句寫在筆記本的哪一頁哪一行。

/**
 * 解析歌詞檔。一行一句，順序就是檔案裡的順序：
 *   [mm:ss.xx] 歌詞    這一句開始唱的時間
 *   歌詞               還沒對時間的句子
 *   # 開頭              說明，不顯示
 * 回傳 [{ t, text, timed }]。沒寫時間的句子會先排在前後兩句之間，讓它照樣能顯示。
 */
export function parseLyrics(source) {
  const rows = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (m) {
      if (m[3]) rows.push({ t: Number(m[1]) * 60 + Number(m[2]), text: m[3], timed: true });
    } else {
      rows.push({ t: null, text: line, timed: false });
    }
  }

  // 替沒寫時間的句子估一個時間
  const STEP = 4;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].timed) continue;
    let j = i;
    while (j < rows.length && !rows[j].timed) j++;
    const before = i > 0 ? rows[i - 1].t : null;
    const after = j < rows.length ? rows[j].t : null;
    const n = j - i;
    for (let k = 0; k < n; k++) {
      if (before != null && after != null) rows[i + k].t = before + ((after - before) * (k + 1)) / (n + 1);
      else if (before != null) rows[i + k].t = before + STEP * (k + 1);
      else if (after != null) rows[i + k].t = Math.max(0, after - STEP * (n - k));
      else rows[i + k].t = 10 + STEP * k;
    }
    i = j - 1;
  }
  // 時間不能往回走，否則後面的句子會永遠輪不到
  for (let i = 1; i < rows.length; i++) rows[i].t = Math.max(rows[i].t, rows[i - 1].t);
  return rows;
}

// 筆記本一頁 9 行。第一個跨頁的左頁上面是歌名和署名，歌詞從第 4 行開始。
const ROWS = 9;
const FIRST_ROW = 3;

/**
 * 把一句歌詞拆成寫得下的幾段。
 * units 量一段字有多寬（中文一個字算 1，英文字母約半個）；一行大約放得下 max。
 * 稍微超出一點（到 squeeze 為止）就不拆，交給畫面把字略微壓窄。
 */
export function wrapLine(text, units, max = 10.2, squeeze = 12) {
  const total = units(text);
  if (total <= squeeze) return [text];
  const n = Math.ceil(total / max);
  const target = total / n;
  // 有空格的（英文）在空格處斷；沒有空格的（中文）可以在任何兩個字之間斷
  const spaced = /\s/.test(text.trim());
  const pieces = spaced ? text.trim().split(/(\s+)/) : [...text];
  const parts = [];
  let cur = '';
  for (const piece of pieces) {
    const next = cur + piece;
    if (cur.trim() && units(next.trim()) > max) { parts.push(cur.trim()); cur = piece.trim() ? piece : ''; continue; }
    cur = next;
    if (parts.length < n - 1 && units(cur.trim()) >= target) { parts.push(cur.trim()); cur = ''; }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/**
 * 決定每一句寫在第幾個跨頁、哪一頁、哪一行。
 * 回傳和 lines 等長的陣列：[{ spread, parts: [{ side: 'L' | 'R', row, text }] }]。
 * 一句拆成幾段時，這幾段一定在同一頁，不會被翻頁切開。
 */
export function layoutPages(lines, units) {
  const pages = [];
  let spread = 0;
  let side = 'L';
  let row = FIRST_ROW;
  const nextPage = () => {
    if (side === 'L') side = 'R'; else { side = 'L'; spread += 1; }
    row = 0;
  };
  for (const line of lines) {
    const texts = wrapLine(line.text, units);
    if (row + texts.length > ROWS && texts.length <= ROWS) nextPage();
    const first = spread;
    const parts = [];
    for (const text of texts) {
      if (row >= ROWS) nextPage();
      parts.push({ side, row, text });
      row += 1;
    }
    pages.push({ spread: first, parts });
  }
  return pages;
}

/** 時間 t 時正在唱第幾句；還沒開始唱回傳 -1 */
export function activeAt(lines, t) {
  let k = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= t) k = i; else break;
  }
  return k;
}
