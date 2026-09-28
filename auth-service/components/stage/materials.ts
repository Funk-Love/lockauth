/**
 * 锁芯场景用的程序化纹理和摄影棚环境。全部在运行时用 canvas 画出来，不依赖图片。
 *
 * - brushed：沿一个方向的拉丝，用作外壳侧面的粗糙度 / 凹凸
 * - milled：铣削剖面上的细刀纹和飞刀弧线
 * - patina：黄铜锁芯正面的铜绿锈，边缘和沟槽里多，中间被钥匙磨亮
 * - studio：几块柔光箱和灯条组成的环境，给金属一个有层次的反射
 */

import * as THREE from 'three';

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

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d')! };
}

function toTexture(c: HTMLCanvasElement, color = false, repeat: [number, number] = [1, 1]) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ------------------------------------------------------------------ 拉丝

/**
 * 拉丝：纹理的 u 方向是横截面，v 方向是锁的长度方向，所以丝纹沿 v 走。
 * 灰度 = 粗糙度（G 通道被 roughnessMap 读取），base 附近上下浮动。
 */
export function brushedTexture(base: number, spread: number, size = 1024) {
  const height = size / 4;
  const { c, ctx } = canvas(size, height);
  const img = ctx.createImageData(size, height);
  const random = seeded(7);
  const noise = makeNoise(11, 16);
  // 每一列一根丝：深浅随机，偶尔一根更深的划痕
  const column = new Float32Array(size).map(() => (random() - 0.5) * 0.8 + (random() < 0.015 ? 0.5 : 0));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < size; x++) {
      // 丝纹笔直，只叠一层很淡的大块不均匀（手摸过、氧化的痕迹）
      const streak = column[x];
      const blotch = (noise((x / size) * 4, (y / height) * 1.5) - 0.5) * 1.2;
      const v = clamp01(base + spread * (streak + blotch));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ------------------------------------------------------------------ 铣削面

/** 铣削剖面：面铣刀留下的细密同心弧（圆心在画布外），每一圈深浅随机，再撒一点细颗粒 */
export function milledTexture(base: number, spread: number, size = 1024) {
  const { c, ctx } = canvas(size, size);
  const img = ctx.createImageData(size, size);
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
      const v = clamp01(base + spread * (ring + speck + drift));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ------------------------------------------------------------------ 铜绿

/**
 * 锁芯正面的铜绿：平面贴图，中心对着锁芯轴线，画布半宽 = 锁芯半径。
 * rings 是按半径算的锈带（沟槽、外圈倒角），中间一圈被钥匙磨得发亮。
 * 返回颜色贴图和 ORM 贴图（G = 粗糙度，B = 金属度）。
 */
export function patinaTextures(rings: [number, number][], size = 512) {
  const color = canvas(size, size);
  const orm = canvas(size, size);
  const ci = color.ctx.createImageData(size, size);
  const oi = orm.ctx.createImageData(size, size);
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
      const i = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) {
        const metal = brass[k] + (brassWorn[k] - brass[k]) * worn;
        const rust = verdigris[k] + (verdigrisPale[k] - verdigris[k]) * pale;
        ci.data[i + k] = metal + (rust - metal) * amount + (f - 0.5) * 6;
      }
      ci.data[i + 3] = 255;
      oi.data[i] = 255;
      const turning = Math.sin(r * 960) * 0.025;
      oi.data[i + 1] = clamp01(0.43 - worn * 0.1 + amount * 0.42 + (f - 0.5) * 0.15 + turning) * 255;
      oi.data[i + 2] = (1 - amount * 0.85) * 255;
      oi.data[i + 3] = 255;
    }
  }
  color.ctx.putImageData(ci, 0, 0);
  orm.ctx.putImageData(oi, 0, 0);
  return { color: color.c, orm: orm.c };
}

// ------------------------------------------------------------------ 纹理集合

export interface StageTextures {
  brushed: THREE.CanvasTexture;
  milled: THREE.CanvasTexture;
  milledBrass: THREE.CanvasTexture;
  patinaColor: THREE.CanvasTexture;
  patinaOrm: THREE.CanvasTexture;
  dispose: () => void;
}

export function createTextures(lite: boolean, patinaRings: [number, number][]): StageTextures {
  const size = lite ? 512 : 1024;
  const brushed = toTexture(brushedTexture(0.72, 0.36, size), false, [0.19, 0.19]);
  brushed.offset.set(0.5, 0.5);
  // 剖面的 uv 就是形状坐标（约 -2.2…2.3），刀纹不是无缝图案，所以整块剖面只铺一张，不重复
  const span = 1 / 4.6;
  const milled = toTexture(milledTexture(0.76, 0.34, size), false, [span, span]);
  const milledBrass = toTexture(milledTexture(0.78, 0.28, size), false, [span, span]);
  milled.offset.set(0.5, 0.5);
  milledBrass.offset.set(0.5, 0.5);
  const patina = patinaTextures(patinaRings, lite ? 256 : 512);
  const patinaColor = toTexture(patina.color, true);
  patinaColor.wrapS = patinaColor.wrapT = THREE.ClampToEdgeWrapping;
  const patinaOrm = toTexture(patina.orm);
  const all = [brushed, milled, milledBrass, patinaColor, patinaOrm];
  all.forEach((t) => {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = lite ? 2 : 4;
  });
  return { brushed, milled, milledBrass, patinaColor, patinaOrm, dispose: () => all.forEach((t) => t.dispose()) };
}

// ------------------------------------------------------------------ 摄影棚

/**
 * 一个暗房间 + 几块发光面，经 PMREM 过滤后当环境贴图。
 * 金属看起来"真"主要靠反射里有明暗结构：一块大柔光箱给主高光，两根灯条勾边，
 * 地面一点暖色反光，右前方一小块很淡的铜绿色补光。
 */
export function studioEnvironment(gl: THREE.WebGLRenderer, lite: boolean) {
  const scene = new THREE.Scene();
  const disposables: { dispose: () => void }[] = [];

  const room = new THREE.BoxGeometry(30, 20, 30);
  const roomMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.018, 0.016, 0.014), side: THREE.BackSide });
  scene.add(new THREE.Mesh(room, roomMat));
  disposables.push(room, roomMat);

  // 柔光箱的发光面中间亮、边缘暗，反射里才有过渡
  const falloff = (() => {
    const size = lite ? 64 : 128;
    const { c, ctx } = canvas(size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.55, '#9a9a9a');
    g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    disposables.push(tex);
    return tex;
  })();

  const panel = (w: number, h: number, pos: [number, number, number], rgb: [number, number, number], intensity: number, soft = false) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(rgb[0] * intensity, rgb[1] * intensity, rgb[2] * intensity),
      map: soft ? falloff : null,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
    disposables.push(geo, mat);
  };

  panel(7, 4, [-6, 8, 6], [1, 0.93, 0.84], 3.2, true);
  panel(0.7, 7, [8, 2, -1], [0.9, 0.94, 1], 2.8);
  panel(8, 0.5, [-2, 1, -9], [1, 0.95, 0.9], 2);
  panel(14, 14, [0, 11, 0], [1, 0.97, 0.92], 0.5); // 顶部大面积弱光
  panel(20, 20, [0, -6, 0], [0.5, 0.36, 0.22], 0.12); // 地面暖色反光
  panel(3, 2, [6, -1, 7], [0.35, 0.68, 0.58], 0.35);
  panel(9, 6, [-5, -1, 10], [1, 0.95, 0.87], 1.5, true);
  panel(5, 2, [2, 5, 10], [1, 0.96, 0.9], 1.8, true);

  const pmrem = new THREE.PMREMGenerator(gl);
  // 保留 render target 的所有权；只 dispose texture 会泄漏 framebuffer。
  const env = pmrem.fromScene(scene, 0.04, 0.1, 100, { size: lite ? 128 : 256 });
  pmrem.dispose();
  disposables.forEach((d) => d.dispose());
  return env;
}

/** 地面上的接触阴影：中心深、边缘渐隐 */
export function contactShadowTexture(lite: boolean) {
  const size = lite ? 128 : 256;
  const { c, ctx } = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
