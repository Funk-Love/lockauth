/** 在 Worker 里算锁芯的纹理像素，算完整块转交回主线程（不复制） */

import { stagePixels } from './pixels';

addEventListener('message', (event: MessageEvent<{ lite: boolean; rings: [number, number][] }>) => {
  const set = stagePixels(event.data.lite, event.data.rings);
  postMessage(set, { transfer: Object.values(set).map((p) => p.data.buffer) });
});
