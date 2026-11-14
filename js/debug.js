// 診斷用：網址加 ?debug=1 時，把播放和點擊的經過一行行記在畫面上方。
// 手機上出問題又接不了電腦看主控台時，截一張圖就知道當時發生了什麼。平常不會載入這個檔案。

const AUDIO_EVENTS = ['loadstart', 'loadedmetadata', 'canplay', 'play', 'playing', 'pause', 'waiting', 'stalled',
  'seeking', 'seeked', 'ended', 'error', 'emptied', 'abort'];

/** 開始記錄；回傳一個函式，讓 app.js 也能往裡面寫一行 */
export function start(audio) {
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:0;top:0;right:0;z-index:99;margin:0;padding:4px 6px;max-height:46vh;overflow:hidden;'
    + 'font:10px/1.25 ui-monospace,Menlo,monospace;color:#9f9;background:rgba(0,0,0,.72);pointer-events:none;white-space:pre-wrap;word-break:break-all';
  document.body.appendChild(box);

  const t0 = performance.now();
  const lines = [navigator.userAgent];
  const write = (text) => {
    lines.push(`${((performance.now() - t0) / 1000).toFixed(1)} ${text}`);
    if (lines.length > 26) lines.splice(1, lines.length - 26);
    box.textContent = lines.join('\n');
  };

  const file = () => (audio.currentSrc || audio.src || '').split('/').pop().replace('.mp3', '');
  for (const type of AUDIO_EVENTS) {
    audio.addEventListener(type, () => {
      const d = isFinite(audio.duration) ? audio.duration.toFixed(0) : String(audio.duration);
      write(`♪ ${type} ${file()} t=${audio.currentTime.toFixed(1)}/${d} rs=${audio.readyState} ns=${audio.networkState}`
        + `${audio.muted ? ' muted' : ''}${audio.paused ? ' paused' : ''}${audio.error ? ' err=' + audio.error.code : ''}`);
    });
  }

  const name = (t) => {
    if (!t || !t.closest) return '?';
    const act = t.closest('[data-act]');
    const rec = t.closest('.rec');
    const obj = t.closest('[id]');
    return act ? `[${act.dataset.act}]` : rec ? `rec${rec.dataset.i}` : obj ? `#${obj.id}` : t.tagName;
  };
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) {
    window.addEventListener(type, (e) => write(`${type} ${name(e.target)}${type === 'click' ? ' detail=' + e.detail : ''}`), true);
  }
  window.addEventListener('error', (e) => write(`JS error: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => write(`rejection: ${e.reason && e.reason.message ? e.reason.message : e.reason}`));

  write('debug on');
  return write;
}
