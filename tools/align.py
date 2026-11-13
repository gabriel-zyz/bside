"""把一首歌的歌词自动对到音频上，生成 .lrc 初稿。

用法（在 web-app 目录下）：
    .venv/bin/python tools/align.py <歌的 id> [模型名，默认 turbo]

读 songs.json 里这首歌的 audio 和 lyricsText，写出：
    lyrics/<id>.lrc          每一行歌词的开始时间
    lyrics/<id>.align.json   每一行的起止时间，检查用（不随网页发布）

对齐结果只是初稿，要用 tools/timing.html 听一遍校对。

第一次用之前要装好环境（约 1 GB，另外会下载约 1.5 GB 的模型到 ~/.cache/whisper）：
    python3 -m venv .venv && .venv/bin/pip install stable-ts
一首 4 分钟的歌在 8 GB 内存的 M1 上大约要跑 15 分钟。
"""

import json
import sys
from pathlib import Path

import numpy as np
import stable_whisper
import whisper.timing

ROOT = Path(__file__).resolve().parent.parent


def dtw_plain(x):
    """和 whisper 自带的 dtw_cpu 算的是同一件事，只是不用 numba。

    这台机器上 numba 编译出来的版本会直接崩溃（segfault），所以换成普通 Python。
    """
    rows = x.tolist()
    n, m = len(rows), len(rows[0])
    inf = float("inf")
    cost = [[inf] * (m + 1) for _ in range(n + 1)]
    trace = [[-1] * (m + 1) for _ in range(n + 1)]
    cost[0][0] = 0.0
    for j in range(1, m + 1):
        for i in range(1, n + 1):
            c0, c1, c2 = cost[i - 1][j - 1], cost[i - 1][j], cost[i][j - 1]
            if c0 < c1 and c0 < c2:
                c, t = c0, 0
            elif c1 < c0 and c1 < c2:
                c, t = c1, 1
            else:
                c, t = c2, 2
            cost[i][j] = rows[i - 1][j - 1] + c
            trace[i][j] = t
    for j in range(m + 1):
        trace[0][j] = 2
    for i in range(n + 1):
        trace[i][0] = 1
    i, j = n, m
    path = []
    while i > 0 or j > 0:
        path.append((i - 1, j - 1))
        t = trace[i][j]
        if t == 0:
            i -= 1
            j -= 1
        elif t == 1:
            i -= 1
        else:
            j -= 1
    return np.array(path[::-1]).T


whisper.timing.dtw_cpu = dtw_plain


def fmt(t):
    m = int(t // 60)
    return f"{m:02d}:{t - m * 60:05.2f}"


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    song_id = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "turbo"

    songs = json.loads((ROOT / "songs.json").read_text(encoding="utf-8"))["songs"]
    song = next((s for s in songs if s["id"] == song_id), None)
    if not song or not song.get("lyricsText"):
        sys.exit(f"songs.json 里找不到 {song_id}，或者它没有 lyricsText")

    lines = [l.strip() for l in (ROOT / song["lyricsText"]).read_text(encoding="utf-8").splitlines() if l.strip()]
    audio = str(ROOT / song["audio"])

    model = stable_whisper.load_model(model_name, device="cpu")
    result = model.align(audio, "\n".join(lines), language="zh", original_split=True)

    segs = result.segments
    if len(segs) != len(lines):
        print(f"注意：歌词有 {len(lines)} 行，对齐结果有 {len(segs)} 段，按顺序尽量对应", file=sys.stderr)

    rows = []
    for i, line in enumerate(lines):
        if i < len(segs):
            rows.append({"n": i + 1, "start": round(segs[i].start, 2), "end": round(segs[i].end, 2), "text": line, "heard": segs[i].text.strip()})
        else:
            rows.append({"n": i + 1, "start": None, "end": None, "text": line, "heard": ""})

    out = ROOT / "lyrics" / f"{song_id}.lrc"
    out.write_text("".join(f"[{fmt(r['start'])}]{r['text']}\n" for r in rows if r["start"] is not None), encoding="utf-8")
    (ROOT / "lyrics" / f"{song_id}.align.json").write_text(json.dumps({"model": model_name, "lines": rows}, ensure_ascii=False, indent=1), encoding="utf-8")

    for r in rows:
        print(f"{r['n']:>2}  {fmt(r['start']) if r['start'] is not None else '--:--.--'}  {fmt(r['end']) if r['end'] is not None else '--:--.--'}  {r['text']}")


if __name__ == "__main__":
    main()
