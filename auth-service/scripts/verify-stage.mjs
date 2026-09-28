// 本地短测试：读取生产代码，不启动后端、不发送网络请求。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename);
  const nativeRequire = createRequire(filename);
  const localRequire = (specifier) => {
    if (specifier.startsWith('./')) return load(path.resolve(path.dirname(filename), `${specifier}.ts`));
    return nativeRequire(specifier);
  };
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  });
  const compiled = { exports: {} };
  runInThisContext(`(function(require,module,exports){${outputText}\n})`, { filename })(localRequire, compiled, compiled.exports);
  cache.set(filename, compiled.exports);
  return compiled.exports;
}

const { resolvePose, stepSpring } = load('components/stage/motion.ts');
for (let progress = 0; progress <= 5; progress++) {
  assert.deepEqual(resolvePose('idle', progress, false, false), { count: progress, unlocked: false });
  assert.deepEqual(resolvePose('idle', progress, true, false), { count: 5, unlocked: true });
  assert.deepEqual(resolvePose('idle', progress, false, true), { count: 5, unlocked: true });
  assert.deepEqual(resolvePose('error', progress, true, true), { count: 0, unlocked: false });
  assert.deepEqual(resolvePose('working', progress, true, true), { count: progress, unlocked: false });
  assert.deepEqual(resolvePose('success', progress, false, false), { count: 5, unlocked: true });
}
console.log('PASS: progress 0–5, hover/open, working/error priority, success');
for (const fps of [30, 60, 120]) {
  const turn = { x: 0, v: 0 };
  for (let frame = 0; frame < fps; frame++) stepSpring(turn, -Math.PI / 2, 1 / fps, 150, 19);
  assert.ok(Math.abs(turn.x + Math.PI / 2) < 0.002, `${fps} Hz opening`);
  for (let frame = 0; frame < fps; frame++) stepSpring(turn, 0, 1 / fps, 220, 22);
  assert.ok(Math.abs(turn.x) < 0.002, `${fps} Hz closing`);
}
console.log('PASS: 30/60/120 Hz opening and closing settle at their endpoint');

const { createLockGeometry } = load('components/stage/CylinderScene.tsx');
for (const lite of [false, true]) {
  const geometries = createLockGeometry(lite);
  let triangles = 0;
  const instances = { housingEnd: 2, plugEnd: 2, chamber: 5, chamberTip: 5, pinHole: 5, spring: 5, shear: 2 };
  for (const [name, item] of Object.entries(geometries)) {
    for (const geometry of Array.isArray(item) ? item : [item]) {
      const position = geometry.getAttribute('position');
      assert.ok(Array.from(position.array).every(Number.isFinite), `${name} contains invalid vertices`);
      triangles += (geometry.index ? geometry.index.count : position.count) / 3 * (instances[name] ?? 1);
      geometry.dispose();
    }
  }
  if (lite) assert.ok(triangles <= 60000, `mobile triangle budget: ${triangles}`);
  console.log(`PASS: ${lite ? 'mobile' : 'desktop'} geometry: ${triangles.toLocaleString('en-US')} triangles (all instances counted)`);
}
