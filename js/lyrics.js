// 歌詞：讀 LRC 檔，以及決定每一句寫在筆記本的哪一頁哪一行。

/** 解析 LRC：每行形如 [mm:ss.xx]歌詞。回傳依時間排序的 [{ t, text }] */
export function parseLrc(source) {
  const out = [];
  for (const raw of source.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!tags.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (!text) continue;
    for (const m of tags) out.push({ t: Number(m[1]) * 60 + Number(m[2]), text });
  }
  return out.sort((a, b) => a.t - b.t);
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
