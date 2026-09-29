'use client';

/**
 * 入口页的主角：一颗剖切演示锁。
 *
 * 像锁匠用的教学锁那样，实心金属锁体的侧面铣掉一个窗口，露出里面的弹子：
 * - 锁体是枪灰色的钢，外表面拉丝，剖面是刚铣出来的亮面，带刀纹；
 * - 锁芯是黄铜，正面长着一层铜绿（品牌色的来历），中间被钥匙磨得发亮；
 * - 五组弹子：黄铜下弹子、淬火钢上弹子（其中两颗是防撬的线轴弹子）、弹簧钢弹簧。
 *
 * 交互：每完成一项输入，一颗下弹子被顶到剪切线上；打字时随机挑动一颗没归位的；
 * 登录成功，锁芯连同剖面一起转过 90° 定住；失败，弹子全部落回、锁身摇一下。
 * 静止时锁芯偶尔犹豫：转一点—停—回来。
 *
 * 剖切用三个局部裁剪面（clipIntersection）挖出窗口，剖面本身是单独建的平面几何。
 * 锁芯的裁剪面跟着锁芯转，所以转动时看到的是一颗真正被剖开的锁芯在转。
 */

/* eslint-disable react-hooks/immutability -- three.js 的场景、相机、材质本来就是可变对象，R3F 的惯用法就是直接改它们 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { contactShadowTexture, createTextures, loadStagePixels, studioEnvironment } from './materials';
import type { StagePixels } from './pixels';
import { resolvePose, stepSpring, type Spring, type StageStatus } from './motion';

export type { StageStatus } from './motion';

export interface StageProps {
  /** 已归位的弹子数 0–5 */
  progress: number;
  /** 每次键入加一：挑动一颗弹子 */
  pulse: number;
  status: StageStatus;
  /** 表单填完了：弹子全部归位，锁芯转开。鼠标停在锁上也会转开 */
  open?: boolean;
  /** 手机上：不开阴影和后期，纹理减半、降低曲面细分 */
  lite?: boolean;
  reducedMotion?: boolean;
}

// ------------------------------------------------------------------ 尺寸（锁体坐标，x 是锁的长度方向）

const LENGTH = 4.6;
const BEVEL = 0.04;
const R = 1.04; // 锁体下半圆
const HALF = 0.5; // 弹子塔半宽
const TOP = 2.24;
const CORNER = 0.34;
const BORE_R = 0.9; // 锁芯孔
const PLUG_R = 0.86; // 锁芯；与孔之间的缝就是剪切线
const SHEAR = PLUG_R;
const CH_R = 0.15; // 弹子孔
const PIN_R = 0.13;
const CH_TOP = 2.02;
const TIP = 0.09; // 钻头留下的锥尖
const X0 = -1.98; // 铣开窗口的前后边界
const X1 = 1.96;
const FACE = LENGTH / 2 + BEVEL + 0.06; // 锁芯正面略微凸出锁体
const KW_TOP = 0.1; // 钥匙槽
const KW_BOT = -0.52;
const KW_W = 0.075;

const PIN_X = [-1.52, -0.76, 0, 0.76, 1.52];
const KEY_LEN = [0.64, 0.8, 0.56, 0.72, 0.66];
const REST_DROP = [0.26, 0.2, 0.32, 0.22, 0.28];
const SPOOL = [false, true, false, true, false];
const DRIVER_LEN = 0.5;

const VERDIGRIS = new THREE.Color('#39a790');

// ------------------------------------------------------------------ 几何

/** 锁体横截面：下面一个圆，上面一截圆角的塔 */
function outline(path: THREE.Shape, r: number, half: number, top: number, corner: number) {
  const a0 = Math.asin(half / r);
  path.moveTo(half, Math.cos(a0) * r);
  path.lineTo(half, top - corner);
  path.quadraticCurveTo(half, top, half - corner, top);
  path.lineTo(-half + corner, top);
  path.quadraticCurveTo(-half, top, -half, top - corner);
  path.lineTo(-half, Math.cos(a0) * r);
  path.absarc(0, 0, r, Math.PI / 2 + a0, Math.PI / 2 - a0 + Math.PI * 2, false);
}

function housingGeometry(curve: number) {
  // 倒角会让外轮廓外扩、孔内缩，所以形状先各自让出 BEVEL
  const shape = new THREE.Shape();
  outline(shape, R - BEVEL, HALF - BEVEL, TOP - BEVEL, CORNER - BEVEL);
  const bore = new THREE.Path();
  bore.absarc(0, 0, BORE_R + BEVEL, 0, Math.PI * 2, true);
  shape.holes.push(bore);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: LENGTH,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 4,
    curveSegments: curve,
  });
  geo.translate(0, 0, -LENGTH / 2);
  geo.rotateY(Math.PI / 2);
  // 挤出体每个面各算各的法线，圆角上会一格一格的；按折角重算成平滑的。
  // toCreasedNormals 按 0.01 量化顶点，先放大再缩回，免得倒角上的细分被并掉
  geo.scale(10, 10, 10);
  toCreasedNormals(geo, 0.6);
  geo.scale(0.1, 0.1, 0.1);
  return geo;
}

/** 锁体在 z=0 处的剖面（窗口范围内）：下面一条、上面一块带五个弹子孔 */
function cutGeometry(shapes: THREE.Shape | THREE.Shape[]) {
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: 0.018, bevelEnabled: true, bevelSize: 0.009,
    bevelThickness: 0.009, bevelSegments: 2, curveSegments: 1,
  });
  geometry.translate(0, 0, -0.027);
  return geometry;
}

function housingSection() {
  const lower = new THREE.Shape();
  lower.moveTo(X0, -R);
  lower.lineTo(X1, -R);
  lower.lineTo(X1, -BORE_R);
  lower.lineTo(X0, -BORE_R);
  lower.closePath();

  const upper = new THREE.Shape();
  upper.moveTo(X0, BORE_R);
  for (const x of PIN_X) {
    upper.lineTo(x - CH_R, BORE_R);
    upper.lineTo(x - CH_R, CH_TOP);
    upper.lineTo(x, CH_TOP + TIP);
    upper.lineTo(x + CH_R, CH_TOP);
    upper.lineTo(x + CH_R, BORE_R);
  }
  upper.lineTo(X1, BORE_R);
  upper.lineTo(X1, TOP);
  upper.lineTo(X0, TOP);
  upper.closePath();
  return cutGeometry([lower, upper]);
}

/** 窗口两端的台阶面：半个锁体截面减去半个锁芯孔（u = z, v = y） */
function housingEnd(curve: number) {
  const a0 = Math.asin(HALF / R);
  const s = new THREE.Shape();
  s.moveTo(0, TOP);
  s.lineTo(HALF - CORNER, TOP);
  s.quadraticCurveTo(HALF, TOP, HALF, TOP - CORNER);
  s.lineTo(HALF, Math.cos(a0) * R);
  s.absarc(0, 0, R, Math.PI / 2 - a0, -Math.PI / 2, true);
  s.lineTo(0, -BORE_R);
  s.absarc(0, 0, BORE_R, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(0, TOP);
  const geo = new THREE.ShapeGeometry(s, curve);
  geo.rotateY(-Math.PI / 2);
  return geo;
}

/** 锁芯在 z=0 处的剖面：钥匙槽以下一整条，以上被弹子孔隔成几块 */
function plugSection() {
  const rect = (a: number, b: number, y0: number, y1: number) => {
    const s = new THREE.Shape();
    s.moveTo(a, y0);
    s.lineTo(b, y0);
    s.lineTo(b, y1);
    s.lineTo(a, y1);
    s.closePath();
    return s;
  };
  const shapes = [rect(X0, X1, -PLUG_R, KW_BOT)];
  const edges = [X0, ...PIN_X.flatMap((x) => [x - CH_R, x + CH_R]), X1];
  for (let i = 0; i < edges.length; i += 2) shapes.push(rect(edges[i], edges[i + 1], KW_TOP, PLUG_R));
  return cutGeometry(shapes);
}

/** 锁芯窗口两端：半圆减去钥匙槽的一半 */
function plugEnd(curve: number) {
  const s = new THREE.Shape();
  s.moveTo(0, PLUG_R);
  s.absarc(0, 0, PLUG_R, Math.PI / 2, -Math.PI / 2, true);
  s.lineTo(0, KW_BOT);
  s.lineTo(KW_W, KW_BOT);
  s.lineTo(KW_W, KW_TOP);
  s.lineTo(0, KW_TOP);
  s.lineTo(0, PLUG_R);
  const geo = new THREE.ShapeGeometry(s, curve);
  geo.rotateY(-Math.PI / 2);
  return geo;
}

/** 后半个圆柱内壁（z ≤ 0 那一半），用于弹子孔、钻头锥尖 */
function halfTube(rTop: number, rBottom: number, height: number, segments: number) {
  return new THREE.CylinderGeometry(rTop, rBottom, height, segments, 1, true, Math.PI / 2, Math.PI);
}

function lathe(points: [number, number][], segments: number) {
  return new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    segments,
  );
}

/** 锁芯正面：中间平、一道沟槽、外圈倒角，然后往里伸进锁芯孔。v 从中心走到外圈 */
const FACE_PROFILE: [number, number][] = [
  [0.62, 0],
  [0.648, -0.016],
  [0.662, -0.03],
  [0.7, -0.03],
  [0.714, -0.016],
  [0.742, -0.004],
  [0.8, -0.004],
  [0.842, -0.03],
  [PLUG_R, -0.064],
  [PLUG_R, -0.36],
];
/** 容易长铜绿的地方，按半径 / 锁芯半径算：沟槽一圈、外圈倒角 */
const PATINA_RINGS: [number, number][] = [
  [0.745, 0.835],
  [0.93, 1],
];

function plugFaceGeometry(segments: number) {
  const geo = lathe(FACE_PROFILE, segments);
  geo.rotateZ(-Math.PI / 2);
  // 车削体默认的 uv 沿轮廓分布，平的正面会被拉出放射纹；改成正对轴线的平面投影
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getZ(i) / (2 * PLUG_R), 0.5 + pos.getY(i) / (2 * PLUG_R));
  uv.needsUpdate = true;
  return geo;
}

/** 面板穿透的曲折钥匙槽；内壁有厚度，底部有低亮度铜绿反光。 */
function keywayFaceGeometry(segments: number) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 0.622, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.moveTo(-0.085, 0.29);
  hole.lineTo(0.075, 0.29);
  hole.lineTo(0.075, 0.07);
  hole.lineTo(0.015, 0.07);
  hole.lineTo(0.015, -0.06);
  hole.lineTo(0.1, -0.06);
  hole.lineTo(0.1, -0.42);
  hole.lineTo(-0.065, -0.42);
  hole.lineTo(-0.065, -0.19);
  hole.lineTo(-0.12, -0.19);
  hole.lineTo(-0.12, 0.02);
  hole.lineTo(-0.085, 0.02);
  hole.closePath();
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.13, bevelEnabled: true, bevelThickness: 0.008,
    bevelSize: 0.008, bevelSegments: 2, curveSegments: segments / 4,
  });
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 - pos.getX(i) / (2 * PLUG_R), 0.5 + pos.getY(i) / (2 * PLUG_R));
  geo.translate(0, 0, -0.138);
  geo.rotateY(Math.PI / 2);
  return geo;
}

/** 下弹子：原点在顶面，向下长，底部圆锥尖 */
function keyPinGeometry(len: number, segments: number) {
  return lathe(
    [
      [0, -len],
      [0.03, -len + 0.01],
      [0.095, -len + 0.075],
      [0.126, -len + 0.14],
      [PIN_R, -len + 0.16],
      [PIN_R, -0.022],
      [PIN_R - 0.014, 0],
      [0, 0],
    ],
    segments,
  );
}

/** 上弹子：原点在底面，向上长；线轴弹子中间有一圈细腰 */
function driverPinGeometry(spool: boolean, segments: number) {
  const L = DRIVER_LEN;
  const pts: [number, number][] = spool
    ? [
        [0, 0],
        [PIN_R - 0.014, 0],
        [PIN_R, 0.02],
        [PIN_R, 0.1],
        [0.092, 0.14],
        [0.092, L - 0.14],
        [PIN_R, L - 0.1],
        [PIN_R, L - 0.02],
        [PIN_R - 0.014, L],
        [0, L],
      ]
    : [
        [0, 0],
        [PIN_R - 0.014, 0],
        [PIN_R, 0.02],
        [PIN_R, L - 0.02],
        [PIN_R - 0.014, L],
        [0, L],
      ];
  return lathe(pts, segments);
}

/** 弹簧：单位高度，两端各有两圈并紧的平圈 */
function springGeometry(lite: boolean) {
  const turns = 9;
  const steps = turns * (lite ? 16 : 28);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    // 两端压紧：前后各 1.5 圈几乎不升高
    const closed = 1.5 / turns;
    const y = t < closed ? t * 0.25 : t > 1 - closed ? 1 - (1 - t) * 0.25 : closed * 0.25 + ((t - closed) / (1 - 2 * closed)) * (1 - closed * 0.5);
    pts.push(new THREE.Vector3(Math.cos(a) * 0.104, y, Math.sin(a) * 0.104));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, 0.013, lite ? 5 : 8, false);
}

// ------------------------------------------------------------------ 弹簧阻尼

// ------------------------------------------------------------------ 裁剪面

/** 局部坐标里的窗口：z > 0 且 X0 < x < X1 的部分被挖掉（三个面同时在负侧才裁） */
const LOCAL_PLANES = [
  new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),
  new THREE.Plane(new THREE.Vector3(1, 0, 0), -X1),
  new THREE.Plane(new THREE.Vector3(-1, 0, 0), X0),
];

function syncPlanes(target: THREE.Plane[], object: THREE.Object3D) {
  target.forEach((p, i) => p.copy(LOCAL_PLANES[i]).applyMatrix4(object.matrixWorld));
}

// ------------------------------------------------------------------ 场景

function Environment({ lite = false, onReady }: { lite?: boolean; onReady: () => void }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    let alive = true;
    let env: THREE.WebGLRenderTarget | null = null;
    studioEnvironment(gl, lite).then((target) => {
      if (!alive) {
        target.dispose();
        return;
      }
      env = target;
      scene.environment = target.texture;
      scene.environmentIntensity = 0.85;
      onReady();
    });
    return () => {
      alive = false;
      scene.environment = null;
      env?.dispose();
    };
  }, [gl, scene, lite, onReady]);
  return null;
}

const noRaycast = () => undefined;

function clippedRaycast(this: THREE.Mesh, raycaster: THREE.Raycaster, hits: THREE.Intersection[]) {
  const candidates: THREE.Intersection[] = [];
  THREE.Mesh.prototype.raycast.call(this, raycaster, candidates);
  for (const hit of candidates) {
    const material = Array.isArray(this.material) ? this.material[hit.face?.materialIndex ?? 0] : this.material;
    if (!material.clippingPlanes?.every((plane) => plane.distanceToPoint(hit.point) < 0)) hits.push(hit);
  }
}

export function createLockGeometry(lite: boolean) {
    const seg = lite ? 40 : 96;
    const small = lite ? 20 : 36;
    return {
      housing: housingGeometry(lite ? 32 : 72),
      housingSection: housingSection(),
      housingEnd: housingEnd(lite ? 16 : 32),
      chamber: halfTube(CH_R, CH_R, CH_TOP - BORE_R, small),
      chamberTip: halfTube(0, CH_R, TIP, small),
      plugBody: new THREE.CylinderGeometry(PLUG_R, PLUG_R, FACE - 0.36 + LENGTH / 2, seg, 1, true),
      plugFace: plugFaceGeometry(seg),
      faceInset: keywayFaceGeometry(seg),
      plugSection: plugSection(),
      plugEnd: plugEnd(lite ? 16 : 32),
      pinHole: halfTube(CH_R, CH_R, PLUG_R - KW_TOP, small),
      keywayWall: new THREE.PlaneGeometry(X1 - X0, KW_TOP - KW_BOT),
      keywayFloor: new THREE.PlaneGeometry(X1 - X0, KW_W),
      shear: new THREE.PlaneGeometry(X1 - X0, BORE_R - PLUG_R),
      slot: new THREE.BoxGeometry(0.012, 0.76, 0.27),
      slotLight: new THREE.BoxGeometry(0.014, 0.48, 0.016),
      keyPins: KEY_LEN.map((len) => keyPinGeometry(len, small)),
      drivers: SPOOL.map((s) => driverPinGeometry(s, small)),
      spring: springGeometry(lite),
      floor: new THREE.PlaneGeometry(16, 16),
      contact: new THREE.PlaneGeometry(1, 1),
      rearCap: new THREE.CircleGeometry(PLUG_R, seg),
    };
}

function Lock({ progress, pulse, status, open = false, lite = false, reducedMotion, pixels }: StageProps & { pixels: StagePixels }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const plug = useRef<THREE.Group>(null);
  const keyPins = useRef<(THREE.Mesh | null)[]>([]);
  const drivers = useRef<(THREE.Mesh | null)[]>([]);
  const springs = useRef<(THREE.Mesh | null)[]>([]);

  const pins = useRef<Spring[]>(PIN_X.map(() => ({ x: 0, v: 0 })));
  const turn = useRef<Spring>({ x: 0, v: 0 });
  const shake = useRef<Spring>({ x: 0, v: 0 });
  const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const live = useRef({ progress, status, open, successAt: -1, previous: '' as string });
  // 开锁：先等弹子归位，再转锁芯
  const hover = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opened = useRef({ on: false, at: 0 });
  const invalidate = useThree((s) => s.invalidate);
  const lastPulse = useRef(pulse);

  const housingPlanes = useMemo(() => LOCAL_PLANES.map((p) => p.clone()), []);
  const plugPlanes = useMemo(() => LOCAL_PLANES.map((p) => p.clone()), []);

  // --------------------------------------------------------------- 资源
  const geo = useMemo(() => createLockGeometry(lite), [lite]);

  const tex = useMemo(() => createTextures(lite, pixels), [lite, pixels]);
  const contactTex = useMemo(() => contactShadowTexture(lite), [lite]);

  const mat = useMemo(() => {
    const clip = (m: THREE.Material, planes: THREE.Plane[]) => {
      m.clippingPlanes = planes;
      m.clipIntersection = true;
      m.clipShadows = true;
      return m;
    };
    const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ metalness: 1, ...p });
    return {
      // 锁体外表面：枪灰钢，沿长度方向拉丝
      gunmetal: clip(
        std({ color: '#5c5952', roughness: 0.9, roughnessMap: tex.brushed, bumpMap: tex.brushed, bumpScale: 0.018 }),
        housingPlanes,
      ),
      // 锁体前后端面：更亮一点的缎面钢
      faceSteel: clip(std({ color: '#858078', roughness: 0.78, roughnessMap: tex.brushed, bumpMap: tex.brushed, bumpScale: 0.014 }), housingPlanes),
      // 铣出来的剖面：亮、细刀纹
      milled: std({ color: '#aaa296', roughness: 0.82, roughnessMap: tex.milled, bumpMap: tex.milled, bumpScale: 0.022, side: THREE.DoubleSide }),
      // 孔壁：钻出来的，暗一点
      bore: std({ color: '#55524d', roughness: 0.5, side: THREE.BackSide }),
      // 锁芯外圆柱：黄铜
      plugBrass: clip(std({ color: '#9c7950', roughness: 0.72, roughnessMap: tex.brushed, bumpMap: tex.brushed, bumpScale: 0.012 }), plugPlanes),
      // 锁芯剖面：刚切开的黄铜，更亮
      brassCut: std({ color: '#b38d5e', roughness: 0.8, roughnessMap: tex.milledBrass, bumpMap: tex.milledBrass, bumpScale: 0.018, side: THREE.DoubleSide }),
      brassBore: std({ color: '#7a5c33', roughness: 0.5, side: THREE.BackSide }),
      keyway: std({ color: '#5e4729', roughness: 0.5 }),
      // 锁芯正面：黄铜 + 铜绿
      plugFace: std({
        color: '#ffffff',
        map: tex.patinaColor,
        roughness: 1,
        roughnessMap: tex.patinaOrm,
        metalnessMap: tex.patinaOrm,
        side: THREE.DoubleSide,
      }),
      keyPin: std({ color: '#c39e6a', roughness: 0.52, roughnessMap: tex.brushed, bumpMap: tex.brushed, bumpScale: 0.006 }),
      driver: std({ color: '#a6a7a5', roughness: 0.48, roughnessMap: tex.brushed }),
      spring: std({ color: '#777b78', roughness: 0.38 }),
      slotDark: new THREE.MeshBasicMaterial({ color: '#050404' }),
      slotGlow: new THREE.MeshStandardMaterial({ color: '#0b1512', emissive: VERDIGRIS, emissiveIntensity: 0.9, roughness: 0.5 }),
      shear: new THREE.MeshStandardMaterial({ color: '#000000', emissive: VERDIGRIS, emissiveIntensity: 0, roughness: 1, metalness: 0 }),
      floor: new THREE.ShadowMaterial({ opacity: 0.5 }),
      contact: new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, opacity: 0.9 }),
    };
  }, [tex, contactTex, housingPlanes, plugPlanes]);

  useEffect(() => () => {
    Object.values(geo).forEach((g) => (Array.isArray(g) ? g.forEach((x) => x.dispose()) : g.dispose()));
  }, [geo]);
  useEffect(() => () => Object.values(mat).forEach((m) => m.dispose()), [mat]);
  useEffect(() => () => tex.dispose(), [tex]);
  useEffect(() => () => contactTex.dispose(), [contactTex]);
  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  // --------------------------------------------------------------- 输入
  useEffect(() => {
    const prev = live.current.previous;
    live.current.progress = progress;
    if (prev !== status) live.current.status = status;
    live.current.open = open;
    live.current.previous = status;
    if (status === 'success' && prev !== 'success') live.current.successAt = performance.now();
    if (status === 'error' && prev !== 'error' && !reducedMotion) {
      pins.current.forEach((p) => (p.v -= 2.4));
      shake.current.v += 9;
    }
    invalidate();
  }, [progress, status, open, reducedMotion, invalidate]);

  useEffect(() => {
    if (status !== 'error') return;
    const timer = setTimeout(() => {
      live.current.status = 'idle';
      invalidate();
    }, 1050);
    return () => clearTimeout(timer);
  }, [status, invalidate]);

  useEffect(() => {
    if (pulse === lastPulse.current) return;
    lastPulse.current = pulse;
    if (reducedMotion || live.current.status !== 'idle' || live.current.open || hover.current) return;
    const unset = pins.current.map((_, i) => i).filter((i) => i >= live.current.progress);
    if (!unset.length) return;
    const i = unset[Math.floor(Math.random() * unset.length)];
    pins.current[i].v += 1.1 + Math.random() * 0.4;
  }, [pulse, reducedMotion]);

  useEffect(() => {
    if (lite) {
      hover.current = false;
      pointer.current = { x: 0, y: 0, tx: 0, ty: 0 };
      invalidate();
    }
    if (reducedMotion || lite) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pointer.current.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [reducedMotion, lite, invalidate]);

  // --------------------------------------------------------------- 每帧
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const { progress: prog, status: st, successAt } = live.current;
    const pose = resolvePose(st, prog, live.current.open, hover.current);
    const isOpen = pose.unlocked;
    if (isOpen !== opened.current.on) opened.current = { on: isOpen, at: t };
    // 弹子归位约 0.3 秒，之后锁芯才转得动
    const turning = isOpen && (reducedMotion || t - opened.current.at >= 0.3);

    // 弹子：目标是 1（顶到剪切线）或 0（落下）
    pins.current.forEach((p, i) => {
      // 关锁时先回正，再让弹子落进孔，避免横向穿过锁芯。
      const returning = st !== 'error' && !reducedMotion && Math.abs(turn.current.x) > 0.12;
      const target = i < pose.count || returning ? 1 : 0;
      if (reducedMotion || turning) {
        p.x = target;
        p.v = 0;
      } else {
        stepSpring(p, target, dt, 220, 28);
      }
      const keyTop = SHEAR - REST_DROP[i] * (1 - p.x);
      const kp = keyPins.current[i];
      const dp = drivers.current[i];
      const sp = springs.current[i];
      if (kp) kp.position.y = keyTop;
      if (dp) dp.position.y = keyTop;
      if (sp) {
        const bottom = keyTop + DRIVER_LEN;
        sp.position.y = bottom;
        sp.scale.y = Math.max(0.05, CH_TOP - bottom);
      }
    });

    // 锁芯转动
    let turnTarget = 0;
    if (turning) {
      turnTarget = -Math.PI / 2;
    } else if (isOpen) {
      turnTarget = 0;
    } else if (st === 'working' && !reducedMotion) {
      // 试着拧：小幅、有节奏
      const beat = (t * 2.4) % 2;
      turnTarget = beat < 1 ? -0.08 : beat < 1.35 ? 0.015 : 0;
    } else if (st === 'idle' && !reducedMotion) {
      // 犹豫：大约每 5 秒一次，转一点—停—回来—停
      const cycle = t % 5.2;
      turnTarget = cycle > 3.6 && cycle < 4.15 ? -0.035 : cycle > 4.5 && cycle < 4.75 ? -0.015 : 0;
    }
    if (reducedMotion) { turn.current.x = turnTarget; turn.current.v = 0; }
    else if (st === 'success') stepSpring(turn.current, turnTarget, dt, 240, 25);
    else if (turning) stepSpring(turn.current, turnTarget, dt, 150, 19);
    else stepSpring(turn.current, turnTarget, dt, 220, 22);
    if (plug.current) plug.current.rotation.x = turn.current.x;

    // 失败时摇头
    if (reducedMotion) { shake.current.x = 0; shake.current.v = 0; }
    else stepSpring(shake.current, 0, dt, 320, 12);

    // 指针：像拿在手里轻轻转一下看，不漂浮
    const pt = pointer.current;
    pt.x += (pt.tx - pt.x) * Math.min(1, dt * 2.2);
    pt.y += (pt.ty - pt.y) * Math.min(1, dt * 2.2);
    if (root.current) {
      root.current.rotation.y = reducedMotion ? 0 : pt.x * 0.09 + shake.current.x * 0.05;
      root.current.rotation.x = reducedMotion ? 0 : pt.y * 0.018;
      root.current.rotation.z = shake.current.x * 0.012;
      root.current.updateMatrixWorld(true);
    }
    if (body.current) syncPlanes(housingPlanes, body.current);
    if (plug.current) syncPlanes(plugPlanes, plug.current);

    // 剪切线：弹子越齐越亮一点；开锁那一下亮起来再回落
    const since = successAt > 0 && st === 'success' ? (performance.now() - successAt) / 1000 : 99;
    const flash = !reducedMotion && since < 2 ? Math.exp(-since * 3) : 0;
    mat.shear.emissiveIntensity = st === 'error' ? 0 : 0.025 + (pose.count / 5) * 0.26 + flash * 0.85;
    mat.slotGlow.emissiveIntensity = (st === 'error' ? 0.08 : 0.5) + flash * 1.2;
  });

  const shadow = !lite;
  const chamberY = (BORE_R + CH_TOP) / 2;
  const pinHoleY = (KW_TOP + PLUG_R) / 2;
  const kwY = (KW_TOP + KW_BOT) / 2;
  const windowX = (X0 + X1) / 2;

  return (
    <>
    {/* 地面留在世界坐标中，指针转动不会让影子跟着抬起。 */}
    {!lite && <mesh dispose={null} geometry={geo.floor} material={mat.floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, -R - 0.3, 0]} receiveShadow raycast={noRaycast} />}
    <mesh dispose={null} geometry={geo.contact} material={mat.contact} rotation={[-Math.PI / 2, 0, 0]} position={[0.05, -R - 0.298, 0]} scale={[6.2, 2.9, 1]} raycast={noRaycast} />
    <group
      ref={root}
      position={[0, -R - 0.3, 0]}
      dispose={null}
      onPointerOver={(e) => {
        if (e.pointerType !== 'mouse' || lite) return;
        e.stopPropagation();
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hover.current = true;
        invalidate();
      }}
      onPointerOut={() => {
        // 指针在零件之间的缝里滑过时不要来回开合
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => {
          hover.current = false;
          invalidate();
        }, 160);
      }}
    >
      <group ref={body} position={[0, R, 0]}>

        {/* 锁体 */}
        <mesh geometry={geo.housing} material={[mat.faceSteel, mat.gunmetal]} castShadow={shadow} receiveShadow={shadow} raycast={clippedRaycast} />
        <mesh geometry={geo.housingSection} material={mat.milled} castShadow={shadow} receiveShadow={shadow} />
        <mesh geometry={geo.housingEnd} material={mat.milled} position={[X1, 0, 0]} castShadow={shadow} receiveShadow={shadow} />
        <mesh geometry={geo.housingEnd} material={mat.milled} position={[X0, 0, 0]} castShadow={shadow} receiveShadow={shadow} />
        {PIN_X.map((x) => (
          <group key={`c${x}`} position={[x, 0, 0]}>
            <mesh geometry={geo.chamber} material={mat.bore} position={[0, chamberY, 0]} receiveShadow={shadow} />
            <mesh geometry={geo.chamberTip} material={mat.bore} position={[0, CH_TOP + TIP / 2, 0]} receiveShadow={shadow} />
          </group>
        ))}
        {/* 剪切线上的一道缝 */}
        <mesh geometry={geo.shear} material={mat.shear} position={[windowX, (PLUG_R + BORE_R) / 2, 0.002]} />
        <mesh geometry={geo.shear} material={mat.shear} position={[windowX, -(PLUG_R + BORE_R) / 2, 0.002]} />

        {/* 锁芯：成功时连同剖面、下弹子一起转 */}
        <group ref={plug}>
          <mesh geometry={geo.rearCap} material={mat.plugBrass} position={[-LENGTH / 2, 0, 0]} rotation={[0, -Math.PI / 2, 0]} castShadow={shadow} receiveShadow={shadow} />
          <mesh
            geometry={geo.plugBody}
            material={mat.plugBrass}
            rotation={[0, 0, Math.PI / 2]}
            position={[(FACE - 0.36 - LENGTH / 2) / 2, 0, 0]}
            castShadow={shadow}
            receiveShadow={shadow}
            raycast={clippedRaycast}
          />
          <mesh geometry={geo.plugFace} material={mat.plugFace} position={[FACE, 0, 0]} castShadow={shadow} receiveShadow={shadow} />
          <mesh geometry={geo.faceInset} material={mat.plugFace} position={[FACE, 0, 0]} castShadow={shadow} receiveShadow={shadow} />
          <mesh geometry={geo.plugSection} material={mat.brassCut} castShadow={shadow} receiveShadow={shadow} />
          <mesh geometry={geo.plugEnd} material={mat.brassCut} position={[X1, 0, 0]} castShadow={shadow} receiveShadow={shadow} />
          <mesh geometry={geo.plugEnd} material={mat.brassCut} position={[X0, 0, 0]} castShadow={shadow} receiveShadow={shadow} />
          <mesh geometry={geo.keywayWall} material={mat.keyway} position={[windowX, kwY, -KW_W]} receiveShadow={shadow} />
          <mesh geometry={geo.keywayFloor} material={mat.keyway} rotation={[-Math.PI / 2, 0, 0]} position={[windowX, KW_BOT, -KW_W / 2]} receiveShadow={shadow} />
          {PIN_X.map((x) => (
            <mesh key={`h${x}`} geometry={geo.pinHole} material={mat.brassBore} position={[x, pinHoleY, 0]} receiveShadow={shadow} />
          ))}
          <mesh geometry={geo.slot} material={mat.slotDark} position={[FACE - 0.15, -0.07, 0]} />
          <mesh geometry={geo.slotLight} material={mat.slotGlow} position={[FACE - 0.143, -0.12, 0.042]} />
          {PIN_X.map((x, i) => (
            <mesh
              key={`k${x}`}
              ref={(m) => {
                keyPins.current[i] = m;
              }}
              geometry={geo.keyPins[i]}
              material={mat.keyPin}
              position={[x, SHEAR - REST_DROP[i], 0]}
              castShadow={shadow}
              receiveShadow={shadow}
            />
          ))}
        </group>

        {/* 上弹子和弹簧：留在锁体里，不随锁芯转 */}
        {PIN_X.map((x, i) => (
          <group key={`d${x}`} position={[x, 0, 0]}>
            <mesh
              ref={(m) => {
                drivers.current[i] = m;
              }}
              geometry={geo.drivers[i]}
              material={mat.driver}
              position={[0, SHEAR - REST_DROP[i], 0]}
              castShadow={shadow}
              receiveShadow={shadow}
            />
            <mesh
              ref={(m) => {
                springs.current[i] = m;
              }}
              geometry={geo.spring}
              material={mat.spring}
              position={[0, SHEAR, 0]}
              castShadow={shadow}
              receiveShadow={shadow}
            />
          </group>
        ))}
      </group>
    </group>
    </>
  );
}

function Rig({ lite }: { lite?: boolean }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    // 竖屏时往后退一点，保证整把锁都在画面里
    const aspect = size.width / Math.max(1, size.height);
    const back = (aspect < 1 ? 1 + (1 - aspect) * 0.9 : 1) * (lite ? 0.8 : 1);
    cam.position.set(6.5 * back, 3.5 * back, 11 * back);
    cam.fov = lite ? 30 : 27;
    cam.lookAt(0.1, 0.25, 0);
    cam.updateProjectionMatrix();
  }, [camera, size, lite]);
  return null;
}

/** 场景搭好后先在后台编译着色器（浏览器支持时并行编译），编完再开始画，第一帧不会卡住页面 */
function Precompile({ onDone }: { onDone: () => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let alive = true;
    gl.compileAsync(scene, camera)
      .catch(() => undefined)
      .then(() => {
        if (alive) onDone();
      });
    return () => {
      alive = false;
    };
  }, [gl, scene, camera, onDone]);
  return null;
}

function FrameReady({ onReady, onUnavailable }: { onReady?: () => void; onUnavailable?: () => void }) {
  const gl = useThree((s) => s.gl);
  const ready = useRef(false);
  const pending = useRef(0);
  useFrame(() => {
    if (ready.current) return;
    ready.current = true;
    pending.current = requestAnimationFrame(() => onReady?.());
  });
  useEffect(() => {
    ready.current = false;
    const canvas = gl.domElement;
    const lost = () => onUnavailable?.();
    canvas.addEventListener('webglcontextlost', lost);
    return () => {
      cancelAnimationFrame(pending.current);
      canvas.removeEventListener('webglcontextlost', lost);
    };
  }, [gl, onUnavailable]);
  return null;
}

export default function CylinderScene({ onReady, onUnavailable, ...props }: StageProps & { onReady?: () => void; onUnavailable?: () => void }) {
  const { lite, reducedMotion } = props;
  const invalidateRef = useRef<(() => void) | null>(null);
  // 纹理在 Worker 里算，环境贴图和着色器在后台编译；都好了才开始画
  const [pixels, setPixels] = useState<StagePixels | null>(null);
  const [envReady, setEnvReady] = useState(false);
  const [compiled, setCompiled] = useState(false);
  const onEnvReady = useCallback(() => setEnvReady(true), []);
  const onCompiled = useCallback(() => setCompiled(true), []);

  useEffect(() => {
    let alive = true;
    loadStagePixels(!!lite, PATINA_RINGS).then((p) => {
      if (alive) setPixels(p);
    });
    return () => {
      alive = false;
    };
  }, [lite]);

  // 减少动态效果时只在状态变化时重画
  useEffect(() => {
    if (reducedMotion) invalidateRef.current?.();
  }, [props.progress, props.status, props.open, reducedMotion, compiled]);

  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={lite ? [1, 1.25] : [1, 1.5]}
        frameloop={!compiled ? 'never' : reducedMotion ? 'demand' : 'always'}
        // three 0.186 起没有 PCFSoftShadowMap 了（会退回 PCF），直接写 PCF，预编译的着色器才对得上
        shadows={lite ? false : { type: THREE.PCFShadowMap }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 27, near: 0.1, far: 60, position: [6.6, 3.6, 10.2] }}
        onCreated={({ gl, invalidate }) => {
          gl.toneMapping = THREE.AgXToneMapping;
          gl.toneMappingExposure = 1;
          gl.localClippingEnabled = true;
          gl.setClearColor(0x000000, 0);
          invalidateRef.current = invalidate;
        }}
      >
        <Rig lite={lite} />
        <Environment lite={lite} onReady={onEnvReady} />
        <hemisphereLight args={['#efe6d8', '#15110e', 0.18]} />
        {/* 主光：左上前方的柔光，投影 */}
        <directionalLight
          position={[-3.2, 7.5, 5.5]}
          intensity={1.6}
          color="#ffe8cf"
          castShadow={!lite}
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0003}
          shadow-normalBias={0.025}
          shadow-camera-left={-4.5}
          shadow-camera-right={4.5}
          shadow-camera-top={4.5}
          shadow-camera-bottom={-4.5}
          shadow-camera-near={1}
          shadow-camera-far={22}
        />
        {/* 轮廓光：右后方，冷一点 */}
        <directionalLight position={[5, 3, -5.5]} intensity={0.8} color="#e0e7ec" />
        {/* 给剖面一点正面补光 */}
        <directionalLight position={[3, 1.2, 8]} intensity={0.45} color="#fff1e0" />
        {pixels && <Lock {...props} pixels={pixels} />}
        {pixels && envReady && !compiled && <Precompile onDone={onCompiled} />}
        <FrameReady onReady={onReady} onUnavailable={onUnavailable} />
      </Canvas>
    </div>
  );
}
