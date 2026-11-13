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

// 第一個跨頁：左頁上面是歌名和日期，下面寫 6 句；右頁 9 句。之後每個跨頁 18 句。
const FIRST_LEFT = 6;
const PER_PAGE = 9;
const FIRST = FIRST_LEFT + PER_PAGE;

/** 第 k 句在第幾個跨頁 */
export function spreadOf(k) {
  return k < FIRST ? 0 : 1 + Math.floor((k - FIRST) / (PER_PAGE * 2));
}

/** 第 k 句的位置：{ side: 'L' | 'R', row: 0..8 } */
export function slotOf(k) {
  if (k < FIRST_LEFT) return { side: 'L', row: k + 3 };
  if (k < FIRST) return { side: 'R', row: k - FIRST_LEFT };
  const j = (k - FIRST) % (PER_PAGE * 2);
  return j < PER_PAGE ? { side: 'L', row: j } : { side: 'R', row: j - PER_PAGE };
}

/** 某個跨頁裡有哪些句子（索引範圍 [from, to)） */
export function rangeOf(spread, total) {
  const from = spread === 0 ? 0 : FIRST + (spread - 1) * PER_PAGE * 2;
  const to = Math.min(total, spread === 0 ? FIRST : from + PER_PAGE * 2);
  return [from, to];
}

/** 時間 t 時正在唱第幾句；還沒開始唱回傳 -1 */
export function activeAt(lines, t) {
  let k = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= t) k = i; else break;
  }
  return k;
}
