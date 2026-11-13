// 唱片機的聲音效果：放唱片的一聲、落針的沙沙聲。全部即時合成，不需要音檔。

let ctx = null;

/** 要在使用者的手勢裡呼叫一次，瀏覽器才允許出聲 */
export function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

const ready = () => ctx && ctx.state === 'running' && !document.hidden;

/** 唱片落在轉盤上、或唱臂抬起時的輕輕一聲 */
export function thump() {
  if (!ready()) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(95, t);
  osc.frequency.exponentialRampToValueAtTime(48, t + 0.12);
  gain.gain.setValueAtTime(0.22, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.18);
}

/** 落針後的沙沙聲，長度約 seconds 秒 */
export function needle(seconds = 1.1) {
  if (!ready()) return;
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    let v = (Math.random() * 2 - 1) * 0.05;          // 底噪
    if (Math.random() < 0.0009) v += (Math.random() * 2 - 1) * 0.9;   // 零星的爆點
    d[i] = v;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2600;
  band.Q.value = 0.6;
  const gain = ctx.createGain();
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
  gain.gain.setValueAtTime(0.5, t + seconds - 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  src.connect(band).connect(gain).connect(ctx.destination);
  src.start(t);
}
