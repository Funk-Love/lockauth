# 首页剖切锁

舞台仍接收原有 `StageProps`。表单、入口文案和弹子进度映射未修改。

## 结构与材质

- 不透明枪灰钢锁体，细拉丝、粗糙度变化；切面使用独立铣削纹理与窄倒角。
- 暖黄铜锁芯，正面保留车削沟槽、局部铜绿，钥匙槽为贯穿面板的实体孔。
- 下弹子随锁芯转动，上弹子和弹簧留在锁体中；关闭时先回正再落弹子。
- 柔光箱反射、单次 AgX 色调映射，使用原生 MSAA。没有 Bloom 或屏幕空间后期。
- 所有模型、贴图和环境在本地程序生成，外部 3D 资源下载为 **0 B**。JavaScript 引擎包和运行时显存不计入此数值。

## 状态

| 输入 | 行为 |
| --- | --- |
| progress 0–5 | 依次归位，脉冲只挑动尚未归位的弹子 |
| open / 鼠标悬停 | 先归位，约 300 ms 后转开 90°；离开锁体延迟 160 ms 关闭 |
| working | 覆盖 open / hover，锁芯按节奏小幅试拧 |
| error | 覆盖进度、open 和 hover；全部落下、回正、轻摇，1050 ms 后恢复 idle |
| success | 归位后转开并保持；剪切线和槽底短暂增亮 |
| reducedMotion | 直接到终点，取消跳动、摇晃、指针倾斜和闪烁；按需渲染 |
| lite | 关闭实时阴影与后期、纹理各边减半、降低细分，不触发悬停 |

地面不参与射线检测。已裁掉的锁体、锁芯表面也不会触发悬停。

## 加载

- 页面空闲后才开始加载 3D，不和表单抢首屏。
- 拉丝、铣削、铜绿纹理的像素在 Worker 里算（`pixels.ts`、`textures.worker.ts`），主线程只上传。
- PMREM 环境贴图和场景的着色器都先用 `compileAsync` 在后台编好，编完才开始画第一帧。
  阴影类型必须写 `PCFShadowMap`：three 0.186 起 `PCFSoftShadowMap` 会在渲染时退回 PCF，预编译的着色器就全对不上了。
- 在这之前显示纯 CSS 的占位：一条剪切线和五颗弹子，跟着表单进度归位；3D 第一帧出来后交叉淡入。
  没有 WebGL 2、上下文丢失或场景初始化失败时一直显示占位。
- 2026-09-29 实测（RTX 5070 Ti，Chrome，生产构建）：3D 加载期间没有超过 50 ms 的长任务。
  改之前是 414 ms + 783 ms 两段卡顿，主要是着色器同步链接（首帧约 730 ms、PMREM 约 370 ms）和纹理计算（约 280 ms）。

## 自动检查

本机 Windows，使用已有 `lockauth` conda 环境、项目现有 Node 依赖。无需安装。

```powershell
cd auth-service
conda run -n lockauth --no-capture-output node scripts/verify-stage.mjs
conda run -n lockauth --no-capture-output node node_modules/typescript/bin/tsc --noEmit
conda run -n lockauth --no-capture-output npm run lint
conda run -n lockauth --no-capture-output npm run build
```

短测试覆盖全部进度与状态优先级、30/60/120 Hz 弹簧收敛，以及实际生成几何的有效性与面数。含所有实例的三角面：桌面 **38,588**，手机 **16,516**，手机低于 60,000 上限。测试加载 Three 的 CommonJS 分发会出现弃用提示；产品代码使用 ESM 导入。

## 浏览器验收

2026-09-29 已看过 1440×900、390 宽的加载占位和 3D 构图，以及 WebGL 不可用时的占位。还没实测：

- 锁芯打开至截面朝上时的亮度、材质细节和遮挡。
- 逐项交互、减弱动态效果。
- 集显笔记本的持续 60 fps、显存释放和上下文恢复路径。

本机预览：

```powershell
conda run -n lockauth --no-capture-output npm run dev -- --hostname 127.0.0.1 --port 3100
```

截图统一放在 `_qa/stage-rendering/`。测试失败与成功状态时使用本地模拟响应或舞台 props，不请求真实登录接口。直接以 `status="success"` 挂载已可播放成功状态，无需更改 `successAt` 初值。
