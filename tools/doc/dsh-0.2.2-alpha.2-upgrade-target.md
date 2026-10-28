# DSH 宿主升级目标：0.2.1-rc.3 → 0.2.2-alpha.2

> 面向对象：执行本次宿主升级的 AI agent（下称「执行者」）。
> 仓库：`dsh-plugin-xiaomi-mimo-tts`（DSH Web 语音朗读插件，Host 路由 + Client 半）。
> 生成时间：2026-10-28（Asia/Shanghai）。事实采样见 §1，执行前必须自行复核。
> 目标宿主版本：`dsh-v0.2.2-alpha.2`（GitHub Release，见 §9）。
> 目标宿主源码：已拉取到本机 `E:\personal\Dsh\deepseek-harness`。
> 当前仓库版本：`4.2.4`（`package.json`）。
> 文档性质：升级目标与验收规格（spec），不是变更记录。执行者按 §4 工作包推进，按 §5 回归，§6 为可选跟进。

---

## 0. 使用规则（执行者必读）

1. **先复核事实**：执行前按 §1 的命令重新采样；若与本文不符（尤其宿主实际版本），**停止并记录差异**，不要按假设继续。
2. **一次只做一个工作包（WP）**：按 WP 顺序执行，每个 WP 有独立验收标准。未通过验收不得进入下一个。
3. **不要凭猜测改版本**：任何 `@deepseek-ai/*` 版本号必须来自真实发布物（`npm view` 或已安装产物），不得手写臆测。
4. **不弱化测试**：遵循 [AGENTS.md](../../AGENTS.md) 的「傻逼断言」条款——测试因产品变化失效时，重写围绕真实行为的断言，不得为过 CI 而恢复死兼容。
5. **保持双语同步**：任何新增/修改 UI 文案必须同时更新 `locale/zh.json` 与 `locale/en.json`；whale-girl 预设文案同时更新 `locale/whale-girl/{zh,en}.json`。
6. **写作用域**：本任务主要改动 `package.json`、`README.md`、必要的 `src/**`、`test/**`、`locale/**`、本 `tools/doc/**`。不新增运行时依赖，除非有明确理由并记录。
7. **失败如实上报**：遇到被上游发布物缺失、网络、签名等阻塞时，记录到 §10 并在最终回复中列出，不要用「兼容旧行为」的临时代码掩盖。

---

## 1. 事实基线（执行前复核）

### 1.1 环境快照（2026-10-28 采样）

| 项 | 采样值 | 复核命令 |
|---|---|---|
| 宿主实际版本（dsh CLI / desktop runtime） | `0.2.1-rc.3` | 见 1.2 |
| desktop 外壳版本 | `0.2.1-rc.3`（exe ProductVersion `0.2.1.0`） | `(Get-Item "D:\tools\DshDesktop\*.exe").VersionInfo.ProductVersion` |
| Node.js | `v24.18.0` | `node -v` |
| 运行 profile | `desktop` | `$env:DSH_PROFILE` |
| profile 目录 | `C:\Users\89243\.dsh\profiles\desktop` | `$env:DSH_PROFILE_DIR` |
| Web GUI | `http://127.0.0.1:5913`（后一次快照为 `8038`，以当前 `$env:DSH_WEB_URL` 为准） | `$env:DSH_WEB_URL` |
| 插件在本 profile 的安装方式 | `link:E:/personal/Dsh/dsh-plugin-xiaomi-mimo-tts` | `Get-Content "$env:DSH_PROFILE_DIR\package.json" -Raw` |

> **关键结论**：采样时刻**本机实际运行的宿主是 `0.2.1-rc.3`，不是 `0.2.2-alpha.2`**。`0.2.2-alpha.2` 是升级目标。执行者若发现宿主已是 `0.2.2-alpha.2`，则以实际为准；若仍为 `0.2.1-rc.3`，需先确认升级渠道（desktop nightly 尚未提供该版本时属于外部阻塞，见 §8）。

### 1.2 从已安装产物读取宿主版本

```powershell
# 读取 app.asar 内 dsh CLI 版本（只读）
$code = @'
const fs=require('fs');const b=fs.readFileSync('D:/tools/DshDesktop/resources/app.asar');
const sz=b.readUInt32LE(12);const hdr=JSON.parse(b.slice(16,16+sz).toString('utf8'));
const f=hdr.files.dsh.files.node_modules.files['@deepseek-ai'].files.dsh.files['package.json'];
const off=Number(f.offset)+16+sz;const d=b.slice(off,off+f.size).toString('utf8');
const m=d.match(/"version"\s*:\s*"([^"]+)"/);console.log(m && m[1]);
'@
$code | Set-Content -Encoding utf8 "$env:TEMP\v.js"; node "$env:TEMP\v.js"
```

### 1.3 上游目标版本关键事实（已从 dsh-v0.2.2-alpha.2 标签核验）

| 事实 | 值 | 影响 |
|---|---|---|
| 根 `engines.node` | `>=24.9.0` | 本插件必须提高 engines 与文档 |
| 包管理器 | `pnpm@11.28.5` | 与仓库 AGENTS 的 11.22.0 记录需对齐 |
| 根 TypeScript devDep | `^6.0.3` | 类型兼容风险点 |
| `@deepseek-ai/cordis` | `4.0.6-alpha.1`（`vendor/cordis`） | peer `~4.0.4` 的 semver 语义问题，见 §4 WP-2 |
| `@deepseek-ai/schemastery` | `3.18.6-alpha.1`（`vendor/schemastery`） | peer `~3.18.4` 允许稳定段，但需注意 prerelease 解析 |
| 上游升级指南目录 | `docs/upgrade-guide/v<ver>/<item>/guide.md` | **0.2.2-alpha.2 尚无逐项指南**（最新仅到 `v0.2.1-rc.4`），迁移依据以 Release Chores + 包 README 为准 |

---

## 2. 升级目标与完成定义（DoD）

**目标**：在宿主升级到 `0.2.2-alpha.2` 后，本插件**可安装、可构建、可通过现有测试**，且在 0.2.2 的 UI/行为变更下**功能不回归**；同时把发现的兼容缺口修好，不引入新的死兼容。

**DoD（全部满足才算完成）**：

- [ ] `package.json` 的 `engines.node` 为 `>=24.9.0`，`engines.dsh` 仍覆盖 `0.2.2-alpha.2`。
- [ ] 所有 `@deepseek-ai/*` devDeps 对齐到 `0.2.2-alpha.2` 生态的真实发布版本（或记录缺失阻塞）。
- [ ] `pnpm install --frozen-lockfile`（或更新 lockfile 后 `pnpm install`）成功。
- [ ] `pnpm typecheck` 通过。
- [ ] `pnpm build` 通过，`pnpm test` 全绿。
- [ ] `pnpm dev:build`（预览构建）通过。
- [ ] 在宿主 `0.2.2-alpha.2` 上安装本插件并启动无报错（`pnpm profile:check` 或宿主日志）。
- [ ] §5 回归矩阵全部通过，或未通过项已在 §10 记录并有人工结论。
- [ ] `README.md` 的目标版本/Node 版本描述已更新。

**非目标（本次不做）**：§6 的功能跟进（原生更新、富文本详情、激活引导等）不属于 DoD，只在回归通过后按需排期。

---

## 3. 破坏性变更裁决表（以本插件代码为准）

裁决含义：**必改**＝不改会构建/运行失败；**验证**＝不改也应工作，但必须实测；**无关**＝已确认不涉及本插件。

| # | 0.2.2-alpha.2 变更（Chores/Release） | 本插件使用点 | 裁决 | 证据/说明 |
|---|---|---|---|---|
| B1 | 最低 Node.js 提高到 **24.9** | `package.json` L80 `node:">=22.13.0"`；`README.md` L44 | **必改** | 上游根 `engines.node >=24.9.0`；本机 Node 24.18 可运行，但声明必须上调 |
| B2 | 自定义插件迁移到**异步会话投影句柄**（`ctx.sessionProjections`），旧注册释放函数与按 key 读取保留兼容+弃用提示 | 本插件**未在宿主侧注册任何 session projection**；Client 仅读 `sessions.list` 快照与订阅 | **无关（后续迁移项）** | [host-source.ts](../../src/client/announcements/host-source.ts) L38–52；发布说明明示兼容保留 |
| B3 | **Cordis Timer** 同步上游，返回值变化 | 代码仅用全局/`window.setTimeout`，无 `ctx` timer | **无关** | [synthesis-routes.ts](../../src/host/synthesis-routes.ts) L48、L128；[duplex-pcm.ts](../../src/client/playback/duplex-pcm.ts) L108 |
| B4 | **Cordis Fiber** 统一原始/候选/生效配置访问，设置编辑与热更新同源 | `settings.configure({ auto: false }, ctx.fiber)` | **验证** | [index.ts](../../src/index.ts) L146–148；0.2.2 `dsh-settings` README 仍写该模式 |
| B5 | `tools.resolve/executable`、按步启用、`tools.mode`、`DSH_TOOLS_MODE` 迁移 | 本插件无工具注册 | **无关** | `src` 无 tool 注册 |
| B6 | Agent 固定本步模型，`agent/request` 不再改路由 | 未挂 `agent/request` | **无关** | — |
| B7 | `@deepseek-ai/dsh-official-bundles` 接管官方组合包列表，原 app-boot 导入需更新 | 无 app-boot / official-bundles 导入 | **无关** | `src` 仅 `createRequire` 读自身 package.json |
| B8 | PTC Node 通道改 birpc；SSH 协议 2→3 | 不涉及 | **无关** | — |
| B9 | `webServer.register` / `registerUpgrade` | 静态资源路由、合成路由、双工 PCM upgrade | **验证** | [synthesis-routes.ts](../../src/host/synthesis-routes.ts) L25、L114；0.2.2 README 确认二者仍返回 disposer |
| B10 | Web 静态资源 ETag、远程 WebSocket 默认压缩 | 语音双工 `registerUpgrade` 链路 | **验证** | 自有 upgrade 通道理论上不受客户端 WS 压缩影响，但必须实测 |
| B11 | 插件管理页改版：富文本详情 + 布局/导航重排 | `plugins.bundle.config` 配置页（`SettingsCard`） | **验证** | 0.2.2 中 bundle 详情文档渲染在配置页上方、配置在「描述与行之间」；[card.tsx](../../src/client/settings/card.tsx) |
| B12 | 「自定义插件市场」更名「自定义插件索引」 | `README.md` L58 提到社区市场 `awesome-dsh-plugin.com`（第三方，非宿主该功能） | **验证** | 仅需确认文案/导航名与宿主一致，非代码 |
| B13 | 「工作步骤收起保留全部助手文字回复，可切仅最终回答」 | 自动朗读可能读到被折叠的过程文字 | **验证/跟进** | 见 §5 R2、§6 F7 |
| B14 | 「消息在宿主确认接收后才显示；发送期输入框只读」 | 公告/自动朗读触发时机 | **验证** | 见 §5 R3 |
| B15 | 「普通会话分支独立运行，不再误判为子智能体」 | 依赖 `retainedBy.mainView` 识别当前会话 | **验证** | [host-source.ts](../../src/client/announcements/host-source.ts) L43；[task-watcher.ts](../../src/client/sound-effects/task-watcher.ts) L39 |
| B16 | Session API 新增独立快照/订阅接口（additive） | `ISessions`、`SessionSnapshot`、`useSession` | **验证** | 见 §5 R6；类型层可能漂移，WP-3 处理 |
| B17 | 主题/DPR 按钮描边、会话列表插件图标等纯 UI 细节 | 插件自带样式与 icon | **验证** | 见 §5 R7 |

> 未列入上表但 Release 中出现的其余条目（移动端输入、窄屏设置、搜索摘要、Word 编辑、桌面安装器、macOS 权限等）经与本插件代码比对，**不涉及**，可跳过。

---

## 4. 工作包（按序执行）

### WP-1 — 工具链与 engines 对齐

**前置**：§1 复核通过。

**动作**：
1. `package.json`：
   - `engines.node` 改为 `">=24.9.0"`。
   - `engines.dsh` 保持 `">=0.1.7-0 <0.3.0-0"`（已覆盖 `0.2.2-alpha.2`，无需改；若类型要求回退则记录原因）。
2. `README.md` L44：把「Node.js 22.13+」改为「Node.js 24.9+」，目标版本改为 `0.2.2-alpha.2`。
3. 确认本机 `node -v` ≥ 24.9；`pnpm -v` 与宿主 `11.28.5` 对齐（仓库 CI 记录 11.22.0，若无 CI 约束可升到 11.28.5）。

**验收**：
- `node -e "console.log(require('./package.json').engines)"` 输出 node `>=24.9.0`。
- `pnpm -v` 输出符合预期。

**失败处置**：若本机 Node < 24.9，先升级 Node，不得跳过。

---

### WP-2 — devDeps / peer 升级（含 prerelease semver 处理）

**前置**：WP-1 通过。

**动作**：
1. 枚举 `package.json` `devDependencies` 中所有 `@deepseek-ai/dsh-*`（当前约 19 个，L155–173）与 `@deepseek-ai/cordis`、`@deepseek-ai/schemastery`、`@deepseek-ai/dsh-agent-preset-registry`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-session`、`@deepseek-ai/dsh-session-projection`。
2. **逐个**确认目标版本真实存在：
   ```powershell
   npm view "@deepseek-ai/dsh-client-ui-settings@0.2.2-alpha.2" version
   npm view "@deepseek-ai/cordis@4.0.6-alpha.1" version
   npm view "@deepseek-ai/schemastery@3.18.6-alpha.1" version
   ```
   若某包在 `0.2.2-alpha.2` 不存在，记录为阻塞（§10），**不要猜版本**。
3. 把上述 devDeps 固定为**精确版本**（`0.2.2-alpha.2` / `4.0.6-alpha.1` / `3.18.6-alpha.1`），不要用 `^`/`~`。
4. **Prerelease semver 关键点**：
   - `peerDependencies` 里 `@deepseek-ai/cordis: "~4.0.4"` 与 `@deepseek-ai/schemastery: "~3.18.4"` 使用 `~x.y.z`，**默认不匹配 prerelease**（如 `4.0.6-alpha.1`、`3.18.6-alpha.1`）。
   - 若目标宿主使用 alpha 版 cordis/schemastery，需把 peer 改为 **prerelease-aware range**，例如：
     - `"@deepseek-ai/cordis": ">=4.0.6-0 <4.1.0-0"`
     - `"@deepseek-ai/schemastery": ">=3.18.6-0 <3.19.0-0"`
   - 执行前用 `npm view <pkg>@<version> peerDependencies` 核对宿主实际声明的 range，**以宿主声明为准**，本处仅给出形态。
5. 更新 lockfile：`pnpm install`。
6. 可选清理：profile 中残留的 `dsh-xiaomi-tts_tmp_28144_3` 目录（确认非当前使用后删除）。

**验收**：
- `pnpm list --depth 0` 中 `@deepseek-ai/*` 版本与目标一致。
- lockfile 无 `0.2.1-rc.3` 残留（`Select-String -Path pnpm-lock.yaml -Pattern "0.2.1-rc.3"` 应为空或仅出现在注释/历史）。

**失败处置**：版本缺失 → 记录阻塞；peer range 冲突 → 按宿主声明调整并在 §10 记录。

---

### WP-3 — 构建与类型修复

**前置**：WP-2 通过。

**动作**：
1. 跑 `pnpm typecheck`，逐条处理类型漂移。重点排查：
   - `@deepseek-ai/dsh-client-ui-slots` 的 `PropsRuntime<'settings.section'>`、`InjectFace` 形状；
   - `@deepseek-ai/dsh-client-ui-settings/client` 的 `ConfigForm`（`getSnapshot/subscribe/set/unset/mutate`）；
   - `@deepseek-ai/dsh-api-session-controller/client` 的 `ISessions`、`SessionSnapshot`（`list.getSnapshot().byId[].retainedBy.mainView`）；
   - `@deepseek-ai/dsh-client-ui-plugin-manager/client` 的 `plugins.bundle.config` 页面 props（是否新增必填 `view`）。
2. **只做兼容性修复**：不要因类型变化改写业务逻辑；若宿主新增可选字段，按需补齐默认值。
3. TypeScript 版本：宿主根 devDep 为 `^6.0.3`。若 `pnpm typecheck` 因宿主 `.d.ts` 使用新语法失败，把本仓库 `typescript` 升到 `^6.0.3` 并记录；否则保持现状。
4. `@types/node`：本仓库现为 `^26.6.1`，上游为 `^22.20.1`。仅当出现类型冲突时对齐，不要无理由降级。
5. React / `@types/react`：本仓库 devDeps 为 React `19.3.0` / types `~19.3.0`，宿主为 React `18.2.0` / types `~18.3.1`。这是**升级前既有的不一致**，本次**不主动改**；仅当 typecheck 明确报 React 版本错误时再评估，并在 §10 记录。

**验收**：
- `pnpm typecheck` 退出码 0。
- `pnpm build` 退出码 0。
- `pnpm test` 全绿（`node:test` + `node:assert/strict`）。
- `pnpm dev:build` 退出码 0。

**失败处置**：类型错误若源于上游真实 API 变更 → 修代码；若源于上游 bug → 记录并在 `pnpm typecheck` 局部跳过时说明理由，不得全局 `@ts-ignore`。

---

### WP-4 — 宿主安装与运行时冒烟

**前置**：WP-3 通过，且宿主已为 `0.2.2-alpha.2`。

**动作**：
1. 在 `desktop` profile 重新链接/安装本插件（`link:` 已存在则确保 build 产物最新）。
2. 启动宿主，打开 Web GUI。
3. 执行 `pnpm profile:check`（需设置 `DSH_HOME`、`DSH_PROFILE=desktop`、`DSH_WEB_PORT` 为当前端口）。
4. 观察宿主日志与浏览器控制台，确认插件加载无 `contribution disabled` / `injection disabled` 报错（[client/index.tsx](../../src/client/index.tsx) L52–72 有错误捕获日志）。

**验收**：
- `pnpm profile:check` 通过。
- 设置页出现「Voice reading」分区；插件页出现本插件配置卡。
- 浏览器 console 无插件相关 error。

---

## 5. 回归验证矩阵

> 每项须在宿主 `0.2.2-alpha.2` 真实 Web GUI 操作验证；记录「通过/失败/阻塞」。

| ID | 场景 | 步骤 | 期望 | 关联 |
|---|---|---|---|---|
| R1 | 插件页配置卡渲染 | 打开侧栏 Plugins → 本插件页 | 配置卡正常显示，不被上方 README 详情挤压/遮挡；样式与滚动正常；有自身保存按钮 | B11 |
| R2 | 自动朗读范围 | 生成含多段过程文字 + 最终回答的回复；开启自动朗读；切换「仅最终回答」偏好 | 朗读范围跟随偏好，不读被折叠的过程文字；切换后不重复朗读 | B13 |
| R3 | 公告/自动朗读时机 | 发送消息，观察公告与自动朗读触发 | 仅在宿主确认接收后触发；发送期输入框只读不误触发；草稿/引用/附件失败时保留 | B14 |
| R4 | 会话识别（分支/子代理） | 开普通会话分支、再开真正子代理；观察音效与公告 | 普通分支不被当成子代理；子代理关系仍正确；当前会话识别准确 | B15 |
| R5 | 设置热更新 | 在设置页改 provider/音量/语速/音色，保存 | 即时生效；无丢草稿；被覆盖写入被拒绝时有提示 | B4 |
| R6 | Session 快照/订阅 | 切换会话、生成新回复、打开/关闭标签 | 朗读状态与会话快照同步；无空引用或崩溃 | B16 |
| R7 | 主题/样式 | 深色主题 + 窄窗口（≤ 手机宽度） | 按钮细线、导航悬停、布局正常；无溢出/错位 | B17 |
| R8 | 静态资源 | 加载插件图标、语音头像、音效、Logo | 全部 200/304，无 404/损坏；ETag 命中后 304 | B10 |
| R9 | 双工 PCM 实时语音 | 使用实时/双工语音模式朗读长文本 | 音频连续、无中断、超时正确中断；连接压缩未破坏协议 | B9/B10 |
| R10 | 音频历史 | 朗读若干条后打开历史、回放、删除 | 记录正确、回放正常、操作可用 | — |
| R11 | 更新检查 | 设置卡查看「有更新」状态 | npm 安装用户应看到宿主原生 Versions/Update；`link:` 安装回退到自研检查且不报错 | B11/§6 F1 |
| R12 | whale-girl 预设 | 启用 `preset-whale-girl` 并开新会话 | 预设可加载（工具/压实配置生效）；无缺插件报错 | B5/预设 |

---

## 6. 功能跟进 backlog（可选，非本次 DoD）

> 宿主 0.2.2 新增能力，按投入产出排序。执行者**仅在工作包与回归全部通过后**，经人工确认再开工。

| ID | 宿主新能力 | 对本插件价值 | 最小实现 | 风险 |
|---|---|---|---|---|
| F1 | 插件页原生「Versions/Update」（第三方 registry 包） | 替代自研更新检查（[update-status.ts](../../src/client/settings/update-status.ts)、[index.ts](../../src/index.ts) L232–244 `TTS_UPDATE_ROUTE`） | npm 安装用户走原生更新；`link:`/本地安装保留自研兜底 | 需区分安装来源，避免双重提示 |
| F2 | 富文本插件详情（`meta.detail` → Markdown） | 插件页直接展示图文说明/截图/示例 | 在 `locale/*.json` 增加 `meta.detail` 指向 Markdown 文件 | 文档需与 README 去重 |
| F3 | `plugins.bundle.activation` 槽 | 首次启用后引导配置 API Key/试听 | 注册激活引导卡，提供「去配置」「试听」回调 | 只应在显式启用后出现 |
| F4 | `plugins.detail.actions` / `plugins.detail.badge` / `plugins.detail.section` | 详情页展示版本/更新/API Key 状态/打开音频历史 | 注册对应槽，复用现有状态 | 与设置卡信息重复 |
| F5 | `plugins.tab` / `plugins.item` | 把音频历史或语音配置提升为独立标签页 | 注册标签页组件 | 体量较大，需评估导航 |
| F6 | `ctx.pluginChanges.bundle(pkg)` | 插件变更时暂停/刷新查询，替代裸轮询 | 在更新检查/状态查询中订阅该源 | 生命周期清理 |
| F7 | 「仅最终回答」偏好（B13） | 自动朗读范围与宿主一致 | 读取该偏好并裁剪朗读文本 | 与既有 readScope 语义合并 |
| F8 | 新增 6 语言（ja/es/fr/de/ru/pt-BR） | 与宿主界面语言一致 | 扩充 `locale/` 与 `locale.register` 字典 | 翻译量大，需分批 |
| F9 | 聊天引用 + 历史复制 Markdown | 朗读引用块 / 导出整段对话音频 | 复用 `extractMarkdownPlainText` 处理 blockquote；加导出入口 | 文本归一化回归 |

**F1–F4 具体宿主契约（已核验 0.2.2 README）**：
- `plugins.bundle.config`：按 npm 包名 keyed，渲染在 bundle 页「描述与行之间」；页面会渲染 `view: 'page'`。
- `plugins.detail.actions` / `plugins.detail.badge` / `plugins.detail.section`：list 槽，item 收到 `subject: { kind, pkg/row/id }`。
- `plugins.bundle.activation`：启用后展示的引导占位，带 dismiss / 打开详情回调。
- `plugins.tab`：Plugins 页在「Installed」后追加标签，条目含 `label`、`order`；owner 提供 `install({spec,registry,title,version})` 与 `openPackage(name)`。
- 版本更新：registry 安装且 `updatable` 的 bundle 才有「Versions」区；`link:`/path/git/tarball/Official 无该区。

---

## 7. 护栏与禁止事项

- **禁止**为了通过编译而全局关闭类型检查（`// @ts-nocheck`、放宽 `tsconfig` strict、`skipLibCheck` 扩大化）。
- **禁止**修改 peer 下限去「兼容」更老宿主（`>=0.1.7-0` 保持，除非有发布策略依据）。
- **禁止**删除或弱化现有针对真实行为的测试；只在产品行为确有变化时重写断言（见 AGENTS.md）。
- **禁止**提交任何 API Key / profile 凭据。
- **禁止**打印或提交宿主的本地安装路径到对外文档（本文件仅记录采样事实）。
- **必须**保持 `cordis.patch.yml` 中插件 id 与包名不变（`xiaomi-mimo-tts` / `dsh-xiaomi-tts`），避免影响已安装用户的 profile 记录。

---

## 8. 待人工决策 / 外部阻塞

| 编号 | 问题 | 需人工确认 |
|---|---|---|
| Q1 | 升级渠道：本机 desktop nightly 当前最新仍为 `0.2.1-rc.3`，`0.2.2-alpha.2` 如何获取（源码宿主 / 其他机器 / 等待 nightly）？ | 是 |
| Q2 | 是否允许把仓库 `typescript` 升到 `^6.0.3` 以匹配宿主？ | 是 |
| Q3 | React 18（宿主）vs React 19（本仓库 devDeps）的不一致是否本次一并处理？ | 是 |
| Q4 | §6 功能跟进是否纳入同一次发版，还是仅做升级兼容？ | 是 |
| Q5 | `peerDependencies` 若需改为 prerelease-aware range，是否接受较宽的 `<4.1.0-0` 形态？ | 是 |

> 若 Q1 未解决（拿不到 `0.2.2-alpha.2` 宿主），WP-4 与 §5 无法完成；此时只交付 WP-1~WP-3 的静态结论，并在 §10 标注「运行时验证待宿主可得」。

---

## 9. 参考与已核实来源

- 发布页：https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-alpha.2
- Release API（含中英文正文）：`https://api.github.com/repos/deepseek-ai/deepseek-harness/releases/tags/dsh-v0.2.2-alpha.2`
- 根 `package.json`（`engines.node`、TS、pnpm）：`https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.2.2-alpha.2/package.json`
- `packages/settings/settings/README.zh.md`（`settings.configure({auto:false}, ctx.fiber)` 模式）
- `packages/client/ui-settings/README.md`（`configForms.get` / `settings.section`）
- `packages/client/ui-settings-plugins/README.md`（`settings.plugins.tab`）
- `packages/client/ui-plugin-manager/README.md`（`plugins.bundle.config`、`plugins.detail.*`、`plugins.bundle.activation`、`plugins.tab`、原生 Versions/Update）
- `packages/client/ui-slots/README.md`（槽注册/注入契约）
- `packages/host/webserver/README.md`（`register` / `registerUpgrade` 返回 disposer）
- `packages/session/README.md`（`ctx.sessionProjections`）
- `vendor/cordis/package.json` = `4.0.6-alpha.1`；`vendor/schemastery/package.json` = `3.18.6-alpha.1`
- 上游升级指南规范：`scripts/verify-upgrade-guides.ts` + `docs/upgrade-guide/`（0.2.2-alpha.2 暂无逐项 guide）

**本仓库已核实文件**：
- [package.json](../../package.json)（engines L79–81、devDeps L155–173）
- [README.md](../../README.md)（L44 版本/Node、L58 市场文案）
- [src/index.ts](../../src/index.ts)（L146–148 settings、L232–244 更新路由）
- [src/client/index.tsx](../../src/client/index.tsx)（L39–46 inject、L52–72 错误捕获、L210–248 槽注册）
- [src/client/settings/card.tsx](../../src/client/settings/card.tsx)（L44–53 `view` prop）
- [src/client/announcements/host-source.ts](../../src/client/announcements/host-source.ts)（L38–52）
- [src/client/sound-effects/task-watcher.ts](../../src/client/sound-effects/task-watcher.ts)（L39）
- [src/host/synthesis-routes.ts](../../src/host/synthesis-routes.ts)（L25、L114）
- [cordis.patch.yml](../../cordis.patch.yml)（L28–82 whale-girl 预设）

---

## 10. 执行记录（由执行者填写）

| 时间 | WP | 结果 | 命令/证据 | 备注 |
|---|---|---|---|---|
| 2026-10-28 14:57（Asia/Shanghai） | WP-1 | 通过 | `node -v` → `v24.18.0`；`pnpm -v` → `11.22.0`；读取 `package.json` 验证 engines 及 README 目标通过；`git diff --check` 通过 | Node 下限改为 `>=24.9.0`，README 目标改为 `0.2.2-alpha.2`；DSH engines 保持不变；按人工决定保留本机及 CI 的 pnpm `11.22.0`。宿主仍为 `0.2.1-rc.3`，运行验证渠道待确认。 |
| 2026-10-28 15:11（Asia/Shanghai） | WP-2 | 通过（保留既有 React peer 警告） | npm registry 核实 23 个精确版本；`pnpm install` 退出码 0，自动触发的 `prepare` 构建通过；`pnpm list --depth 0` 版本一致；lockfile 无 `0.2.1-rc.3`；`git diff --check` 通过 | 按人工批准将 19 个 DSH devDeps 固定为 `0.2.2-alpha.2`，Cordis / Schemastery 固定为 `4.0.6-alpha.1` / `3.18.6-alpha.1`，loader / include 固定为 `1.0.7-alpha.1` / `1.0.11-alpha.1`；peer 追加宿主实际范围，保留既有稳定版支持；semver 验证通过。非 DeepSeek 顶层依赖解析版本均未变化。 |
| 2026-10-28 15:16（Asia/Shanghai） | WP-3 初次检查 | 部分通过；当时测试修复待人工批准 | `pnpm typecheck` 退出码 0；`pnpm test` 构建通过，259 项中 257 通过、2 失败；`pnpm dev:build` 退出码 0；`pnpm pack:check` 退出码 0，源 package scripts 已恢复，无备份残留 | 此时未修改源码、测试、TypeScript 或 React。预览构建有 chunk 大小提示。失败原因与后续处理见 W3-1、W3-2。 |
| 2026-10-28 15:26（Asia/Shanghai） | WP-3 修复与复验 | 通过 | `pnpm install`（含自动构建）退出码 0；`node --test --test-reporter=spec test/package.test.mjs test/whale-girl-component.test.mjs` → 42/42 通过；`pnpm test`（含构建）→ 259/259 通过；Agent devDep 与 lockfile 一致；`git diff --check` 通过 | 按人工批准移除 README 精确标题断言，并将测试名称改为链接、开发命令及使用保证验证；新增精确 devDep `@deepseek-ai/dsh-agent@0.2.2-alpha.2`，为官方预设集成测试装载真实 Agent registry；保留全部预设行为断言。无需修改业务源码、TypeScript 或 React。 |

`pnpm peers check` 退出码 1：唯一警告为 `use-sync-external-store@1.2.0` 的 React peer 仅声明到 18，而仓库安装 React `19.3.0`。对比升级前后的 lockfile，双方版本与该 peer 声明完全相同，属于既有问题；本次未修改 React、未压制警告。DSH 的 engines 范围已按目标宿主 `packages/boot/app-boot/src/plugin-compatibility.ts` 的 `includePrerelease: true` 语义复核，可接受目标宿主。

**阻塞登记**：

| 编号 | 阻塞描述 | 尝试过的手段 | 需要的决策/资源 |
|---|---|---|---|
| W3-1（已解决） | README 回归测试绑定旧标题「隐私与网络访问」，现有文档标题已改为「隐私」 | 核对现有 README 与 `test/package.test.mjs`，隐私说明仍在；经人工批准移除标题文字断言，聚焦测试与全量测试通过 | 已保留本地链接、资源、命令、Web Speech API 和默认关闭保证的检查，未改回用户文档 |
| W3-2（已解决） | 官方 registry 新增必需注入 `agents`，原预设集成测试未装载该服务 | 核对真实发布物与上游测试 harness；经人工批准新增 `@deepseek-ai/dsh-agent@0.2.2-alpha.2` 为 devDep 并装载真实 Agent registry，聚焦测试与全量测试通过 | 保留默认禁用、启用注册、停用释放、重新启用等全部行为断言；未新增运行时依赖 |
| W4-1 | 已安装宿主仍为 `0.2.1-rc.3`，目标运行验证渠道待确认 | 已从安装产物核实宿主版本；本机另有目标标签源码 | 需人工选择目标 desktop 或源码宿主渠道，WP-4 与 R1～R12 尚未执行 |

**最终结论**（完成 / 部分完成 / 阻塞）：部分完成。WP-1～WP-3 已通过；类型检查、构建、259 项测试、预览构建和打包检查均通过。已安装宿主再次核实仍为 `0.2.1-rc.3`，WP-4 与 R1～R12 真实 GUI 回归待目标宿主渠道确认；不得据此宣称完整 DoD 已通过。保留既有 React peer 警告及预览 chunk 大小提示。
