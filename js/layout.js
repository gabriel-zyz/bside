// 桌上的東西擺在哪。每一項是 [名稱, x, y, 角度, 縮放]，座標是壓扁之前的桌面座標。
// 順序就是畫的順序：排在後面的會蓋住前面的。

export const LAYOUTS = {
  desktop: {
    w: 1440,
    h: 900,
    deckControls: true,
    items: [
      ['jersey', -25, 148, 12, 2],
      ['photo', 585, 30, -9, 1],
      ['camera', 680, 135, 18, 0.9],
      ['clock', 880, 130, -14, 1],
      ['box', 250, 215, 25, 1],
      ['turntable', 640, 330, -8, 1],
      ['notebook', 255, 715, 9, 1],
      ['note', 1050, 800, 7, 1],
      ['pick', 790, 800, 25, 1],
      ['headphones', 900, 960, 10, 1],
      ['guitar', 1415, 930, -12, 1.6],
    ],
    lamp: [1330, 95, 0, 1],
    // 燈光：[中心 x, 中心 y, 半徑, 垂直方向的比例]。半徑六成以內全亮，再往外漸暗
    light: [560, 450, 900, 0.75],
  },
  mobile: {
    w: 390,
    h: 844,
    deckControls: false,
    // 手機上按鈕和進度線不在唱片機上，直接畫在螢幕座標裡
    controls: { xs: [135, 195, 255], y: 386, r: 22, seek: [40, 308, 350] },
    items: [
      ['jersey', -70, 612, -10, 1.3],
      ['guitar', 795, 425, -100, 1.28],
      ['photo', 18, 10, -9, 0.42],
      ['camera', 58, 54, 18, 0.378],
      ['headphones', 146, 58, 10, 0.38],
      ['clock', 196, 42, -14, 0.42],
      ['note', 10, 445, 7, 0.5],
      ['pick', 98, 470, 25, 0.8],
      ['turntable', 26, 156, -8, 0.66],
      ['notebook', 42, 510, 9, 0.72],
      ['box', 225, 905, 25, 0.68],
    ],
    // 挑歌時盒子移到這裡
    browseBox: [110, 700, 25, 0.9],
    lamp: [372, 34, 0, 0.4],
    light: [195, 450, 400, 1.7],
  },
};

export function pickLayout() {
  return window.innerWidth / window.innerHeight < 0.8 ? 'mobile' : 'desktop';
}
