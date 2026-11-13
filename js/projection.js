// 桌面的畫法：從斜上方看，不帶近大遠小。
// 桌面上的東西先畫成正上方看到的樣子，再整體在垂直方向壓扁到 K 倍；
// 高度則直接往螢幕上方推。這個檔案只負責算這些偏移量。

export const K = 0.8;        // 桌面在螢幕垂直方向的壓縮比
const HZ = 0.6 / K;          // 立起來的面：每單位真實高度，在物件自己座標裡的長度

const rad = (d) => (d * Math.PI) / 180;

/** 四捨五入到一位小數，寫進 SVG 用 */
export const f1 = (n) => Math.round(n * 10) / 10;

/**
 * 一個轉了 phi 度的物件，要讓某個點在螢幕上抬高 h 像素，
 * 在物件自己的座標裡要移動多少。
 */
export function up(h, phi) {
  const p = rad(phi);
  return [-(h / K) * Math.sin(p), -(h / K) * Math.cos(p)];
}

/**
 * 立在桌面上的面（例如盒子裡的唱片、時鐘正面）用的矩陣係數。
 * 面的橫軸沿物件的 x 軸，縱軸朝上；lean 是往觀看者方向倒下去的角度。
 * 回傳 [cx, cy]，用法：matrix(1 0 cx cy ox oy)，面裡的 y 往下為正。
 */
export function face(phi, lean = 0) {
  const p = rad(phi);
  const a = rad(lean);
  return [HZ * Math.cos(a) * Math.sin(p), HZ * Math.cos(a) * Math.cos(p) - Math.sin(a)];
}

/** 圓柱側面的切線位置：圓心加減這個向量 */
export function tangent(r, phi) {
  const p = rad(phi);
  return [r * Math.cos(p), -r * Math.sin(p)];
}

/** 翻頁時書頁外緣的位置。theta 0 是平放在右邊，180 是翻到左邊。 */
export function pageEdge(spineX, width, theta, phi) {
  const t = rad(theta);
  const p = rad(phi);
  const lift = width * Math.sin(t);
  return [spineX + width * Math.cos(t) - HZ * Math.sin(p) * lift, -HZ * Math.cos(p) * lift];
}
