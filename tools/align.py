"""把一首歌的歌词自动对到音频上，把时间写回这首歌的歌词文件。

用法（在 web-app 目录下）：
    .venv/bin/python tools/align.py <歌的 id> [--force] [--model turbo]

读 songs.json 里这首歌的 audio 和 lyrics。歌词文件一行一句，
对完之后每一行前面会加上 [分:秒]；文件开头的 # 说明原样保留。
如果文件里已经有时间，要加 --force 才会覆盖（免得冲掉手工校对过的结果）。

对齐结果只是初稿，要用 tools/timing.html 听一遍校对。

第一次用之前要装好环境（约 1 GB，另外会下载约 1.5 GB 的模型到 ~/.cache/whisper）：
    python3 -m venv .venv && .venv/bin/pip install stable-ts
一首 4 分钟的歌在 8 GB 内存的 M1 上大约要跑 15 分钟。
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TIMED = re.compile(r"^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$")


def fmt(t):
    m = int(t // 60)
    return f"{m:02d}:{t - m * 60:05.2f}"


def read_lyrics(path):
    """回传 (开头的说明行, 歌词行, 是否已经有时间)"""
    header, lines, timed = [], [], False
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line.startswith("#"):
            if not lines:
                header.append(raw)
            continue
        if not line:
            continue
        m = TIMED.match(line)
        if m:
            timed = True
            if m.group(3):
                lines.append(m.group(3))
        else:
            lines.append(line)
    return header, lines, timed


def dtw_plain(x):
    """和 whisper 自带的 dtw_cpu 算的是同一件事，只是不用 numba。

    这台机器上 numba 编译出来的版本会直接崩溃（segfault），所以换成普通 Python。
    """
    import numpy as np

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


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    model_name = sys.argv[sys.argv.index("--model") + 1] if "--model" in sys.argv else "turbo"
    if "--model" in sys.argv:
        args = [a for a in args if a != model_name]
    if not args:
        sys.exit(__doc__)
    song_id = args[0]

    songs = json.loads((ROOT / "songs.json").read_text(encoding="utf-8"))["songs"]
    song = next((s for s in songs if s["id"] == song_id), None)
    if not song or not song.get("lyrics"):
        sys.exit(f"songs.json 里找不到 {song_id}，或者它没有 lyrics")

    path = ROOT / song["lyrics"]
    header, lines, timed = read_lyrics(path)
    if not lines:
        sys.exit(f"{song['lyrics']} 里没有歌词")
    if timed and not force:
        sys.exit(f"{song['lyrics']} 里已经有时间了。要重新对齐并覆盖，请加 --force")

    import stable_whisper
    import whisper.timing

    whisper.timing.dtw_cpu = dtw_plain
    model = stable_whisper.load_model(model_name, device="cpu")
    # 歌是什么语言：songs.json 里这首歌的 lang，没写就当作中文
    result = model.align(str(ROOT / song["audio"]), "\n".join(lines), language=song.get("lang", "zh"), original_split=True)

    segs = result.segments
    if len(segs) != len(lines):
        print(f"注意：歌词有 {len(lines)} 行，对齐结果有 {len(segs)} 段，对不上的行不写时间", file=sys.stderr)

    out = []
    for i, line in enumerate(lines):
        out.append(f"[{fmt(segs[i].start)}] {line}" if i < len(segs) else line)
        print(out[-1])

    head = "\n".join(header) + "\n\n" if header else ""
    path.write_text(head + "\n".join(out) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
