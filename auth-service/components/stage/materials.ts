/**
 * 锁芯场景的纹理和摄影棚环境。全部在运行时生成，不依赖图片。
 *
 * - 拉丝、铣削、铜绿的像素在 Worker 里算（pixels.ts），这里只把结果包成纹理
 * - studio：几块柔光箱和灯条组成的环境，给金属一个有层次的反射
 */

import * as THREE from 'three';
import { stagePixels, type Pixels, type StagePixels } from './pixels';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d')! };
}

// ------------------------------------------------------------------ 纹理

const pending = new Map<boolean, Promise<StagePixels>>();

/** 纹理像素：放到 Worker 里算，算一次缓存下来；Worker 用不了就在主线程算 */
export function loadStagePixels(lite: boolean, patinaRings: [number, number][]): Promise<StagePixels> {
  const cached = pending.get(lite);
  if (cached) return cached;
  const job = new Promise<StagePixels>((resolve) => {
    const inline = () => resolve(stagePixels(lite, patinaRings));
    let worker: Worker;
    try {
      worker = new Worker(new URL('./textures.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      inline();
      return;
    }
    worker.onmessage = (event: MessageEvent<StagePixels>) => {
      resolve(event.data);
      worker.terminate();
    };
    worker.onerror = () => {
      worker.terminate();
      inline();
    };
    worker.postMessage({ lite, rings: patinaRings });
  });
  pending.set(lite, job);
  return job;
}

function toTexture(p: Pixels, color = false, repeat: [number, number] = [1, 1]) {
  const tex = new THREE.DataTexture(p.data, p.width, p.height);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface StageTextures {
  brushed: THREE.DataTexture;
  milled: THREE.DataTexture;
  milledBrass: THREE.DataTexture;
  patinaColor: THREE.DataTexture;
  patinaOrm: THREE.DataTexture;
  dispose: () => void;
}

export function createTextures(lite: boolean, pixels: StagePixels): StageTextures {
  const brushed = toTexture(pixels.brushed, false, [0.19, 0.19]);
  brushed.offset.set(0.5, 0.5);
  // 剖面的 uv 就是形状坐标（约 -2.2…2.3），刀纹不是无缝图案，所以整块剖面只铺一张，不重复
  const span = 1 / 4.6;
  const milled = toTexture(pixels.milled, false, [span, span]);
  const milledBrass = toTexture(pixels.milledBrass, false, [span, span]);
  milled.offset.set(0.5, 0.5);
  milledBrass.offset.set(0.5, 0.5);
  const patinaColor = toTexture(pixels.patinaColor, true);
  const patinaOrm = toTexture(pixels.patinaOrm);
  const all = [brushed, milled, milledBrass, patinaColor, patinaOrm];
  all.forEach((t) => {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = lite ? 2 : 4;
  });
  return { brushed, milled, milledBrass, patinaColor, patinaOrm, dispose: () => all.forEach((t) => t.dispose()) };
}

// ------------------------------------------------------------------ 摄影棚

/** PMREMGenerator 的内部成员：用来提前拿到它的滤波材质 */
interface PMREMInternals {
  _setSize?: (size: number) => void;
  _allocateTargets?: () => THREE.WebGLRenderTarget;
  _ggxMaterial?: THREE.Material | null;
  _blurMaterial?: THREE.Material | null;
}

/**
 * 一个暗房间 + 几块发光面，经 PMREM 过滤后当环境贴图。
 * 金属看起来"真"主要靠反射里有明暗结构：一块大柔光箱给主高光，两根灯条勾边，
 * 地面一点暖色反光，右前方一小块很淡的铜绿色补光。
 *
 * PMREM 的滤波着色器很重，同步编译会让页面卡住几百毫秒，所以先在后台编好再生成。
 * 用到了 PMREMGenerator 的私有成员；three.js 改了实现就退回直接生成。
 */
export async function studioEnvironment(gl: THREE.WebGLRenderer, lite: boolean) {
  const size = lite ? 128 : 256;
  const pmrem = new THREE.PMREMGenerator(gl);
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

  const internal = pmrem as unknown as PMREMInternals;
  if (internal._setSize && internal._allocateTargets) {
    internal._setSize(size);
    // 和生成时画进同一种半精度目标，编出来的着色器才对得上
    const target = internal._allocateTargets();
    const warm = new THREE.Scene();
    warm.add(scene);
    // 要有 position，不然着色器的缓存键和真正生成时差一位
    const empty = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    for (const m of [internal._ggxMaterial, internal._blurMaterial]) if (m) warm.add(new THREE.Mesh(empty, m));
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(target);
    const compiled = gl.compileAsync(warm, new THREE.PerspectiveCamera());
    gl.setRenderTarget(previous);
    await compiled.catch(() => undefined);
    warm.remove(scene);
    target.dispose();
    empty.dispose();
  }
  // 保留 render target 的所有权；只 dispose texture 会泄漏 framebuffer。
  const env = pmrem.fromScene(scene, 0.04, 0.1, 100, { size });
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
