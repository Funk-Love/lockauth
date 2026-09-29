/**
 * 锁芯场景的程序化纹理：只算像素，不碰 DOM 和 three.js，放在 Worker 里跑，不占主线程。
 *
 * - brushed：沿一个方向的拉丝，用作外壳侧面的粗糙度 / 凹凸
 * - milled：铣削剖面上的细刀纹和飞刀弧线
 * - patina：黄铜锁芯正面的铜绿锈，边缘和沟槽里多，中间被钥匙磨亮
 *
 * 像素按 WebGL 的习惯从下往上存（第 0 行是 v = 0），上传时不用再翻转。
 */

// ------------------------------------------------------------------ 噪声

/** 固定种子的伪随机（mulberry32），每次生成的纹理都一样 */
export function seeded(seed: number) {
  let a = seed * 2654435761;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 可平铺的 2D 值噪声 + 分形叠加 */
function makeNoise(seed: number, period: number) {
  const random = seeded(seed);
  const grid = new Float32Array(period * period).map(() => random());
  const at = (x: number, y: number) => grid[((y % period) + period) % period * period + (((x % period) + period) % period)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const value = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = smooth(x - xi);
    const fy = smooth(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x: number, y: number, octaves = 4) => {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += value(x * f, y * f) * amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / (1 - Math.pow(0.5, octaves));
  };
}

export interface Pixels {
  /** RGBA，每像素 4 字节 */
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}

function pixels(width: number, height: number): Pixels {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

/** 画布坐标（y 向下）对应的像素下标 */
const index = (p: Pixels, x: number, y: number) => ((p.height - 1 - y) * p.width + x) * 4;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function gray(p: Pixels, x: number, y: number, v: number) {
  const i = index(p, x, y);
  p.data[i] = p.data[i + 1] = p.data[i + 2] = v * 255;
  p.data[i + 3] = 255;
}

// ------------------------------------------------------------------ 拉丝

/**
 * 拉丝：纹理的 u 方向是横截面，v 方向是锁的长度方向，所以丝纹沿 v 走。
 * 灰度 = 粗糙度（G 通道被 roughnessMap 读取），base 附近上下浮动。
 */
export function brushedTexture(base: number, spread: number, size = 1024) {
  const height = size / 4;
  const img = pixels(size, height);
  const random = seeded(7);
  const noise = makeNoise(11, 16);
  // 每一列一根丝：深浅随机，偶尔一根更深的划痕
  const column = new Float32Array(size).map(() => (random() - 0.5) * 0.8 + (random() < 0.015 ? 0.5 : 0));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < size; x++) {
      // 丝纹笔直，只叠一层很淡的大块不均匀（手摸过、氧化的痕迹）
      const streak = column[x];
      const blotch = (noise((x / size) * 4, (y / height) * 1.5) - 0.5) * 1.2;
      gray(img, x, y, clamp01(base + spread * (streak + blotch)));
    }
  }
  return img;
}

// ------------------------------------------------------------------ 铣削面

/** 铣削剖面：面铣刀留下的细密同心弧（圆心在画布外），每一圈深浅随机，再撒一点细颗粒 */
export function milledTexture(base: number, spread: number, size = 1024) {
  const img = pixels(size, size);
  const random = seeded(23);
  const noise = makeNoise(5, 32);
  const rings = new Float32Array(4096).map(() => random() - 0.5);
  const cx = size * 0.5;
  const cy = -size * 1.3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - cx, y - cy) / 1.6;
      const k = Math.floor(r);
      const ring = rings[k % 4096] * (1 - (r - k)) + rings[(k + 1) % 4096] * (r - k);
      const speck = (noise((x / size) * 96, (y / size) * 96, 2) - 0.5) * 0.6;
      const drift = (noise((x / size) * 3, (y / size) * 3, 3) - 0.5) * 0.8;
      gray(img, x, y, clamp01(base + spread * (ring + speck + drift)));
    }
  }
  return img;
}

// ------------------------------------------------------------------ 铜绿

/**
 * 锁芯正面的铜绿：平面贴图，中心对着锁芯轴线，画布半宽 = 锁芯半径。
 * rings 是按半径算的锈带（沟槽、外圈倒角），中间一圈被钥匙磨得发亮。
 * 返回颜色贴图和 ORM 贴图（G = 粗糙度，B = 金属度）。
 */
export function patinaTextures(rings: [number, number][], size = 512) {
  const color = pixels(size, size);
  const orm = pixels(size, size);
  const noise = makeNoise(41, 16);
  const fine = makeNoise(97, 64);
  const brass = [151, 120, 80];
  const brassWorn = [192, 158, 111];
  const verdigris = [37, 99, 83];
  const verdigrisPale = [57, 167, 144];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const w = y / size;
      const r = Math.hypot(u - 0.5, w - 0.5) * 2;
      let band = 0;
      for (const [a, b] of rings) {
        const mid = (a + b) / 2;
        const half = (b - a) / 2;
        band = Math.max(band, clamp01(1 - Math.abs(r - mid) / (half + 0.03)));
      }
      const worn = clamp01(1 - r / 0.5) ** 1.5; // 钥匙进出的那一圈最亮
      const n = noise(u * 7, w * 7);
      const f = fine(u * 40, w * 40, 2);
      // 锈一块一块地长：锈带权重 × 噪声阈值
      const amount = clamp01((band * 0.8 + (n - 0.66) * 1.3) * (0.6 + f * 0.5)) * (1 - worn) * 0.8;
      const pale = clamp01((f - 0.55) * 3);
      const i = index(color, x, y);
      for (let k = 0; k < 3; k++) {
        const metal = brass[k] + (brassWorn[k] - brass[k]) * worn;
        const rust = verdigris[k] + (verdigrisPale[k] - verdigris[k]) * pale;
        color.data[i + k] = metal + (rust - metal) * amount + (f - 0.5) * 6;
      }
      color.data[i + 3] = 255;
      orm.data[i] = 255;
      const turning = Math.sin(r * 960) * 0.025;
      orm.data[i + 1] = clamp01(0.43 - worn * 0.1 + amount * 0.42 + (f - 0.5) * 0.15 + turning) * 255;
      orm.data[i + 2] = (1 - amount * 0.85) * 255;
      orm.data[i + 3] = 255;
    }
  }
  return { color, orm };
}

// ------------------------------------------------------------------ 整套

export interface StagePixels {
  brushed: Pixels;
  milled: Pixels;
  milledBrass: Pixels;
  patinaColor: Pixels;
  patinaOrm: Pixels;
}

export function stagePixels(lite: boolean, patinaRings: [number, number][]): StagePixels {
  const size = lite ? 512 : 1024;
  const patina = patinaTextures(patinaRings, lite ? 256 : 512);
  return {
    brushed: brushedTexture(0.72, 0.36, size),
    milled: milledTexture(0.76, 0.34, size),
    milledBrass: milledTexture(0.78, 0.28, size),
    patinaColor: patina.color,
    patinaOrm: patina.orm,
  };
}
