# DSH 兼容性工作总结与跨设备验证手册

> 项目：`dsh-xiaomi-tts`  
> 发布版本：`3.0.1-alpha`
> 基线提交：`d4e7351`（兼容改造）、`6df77d1`（固定 pnpm）、`319e3f0`（允许获取新发布的 DSH 包）  
> 最后更新：2026-09-04

## 1. 结论与支持范围

已验证的可靠环境组合如下。插件版本与 DSH 宿主必须按表配套，不能交叉安装：

| 插件版本 | DSH 版本 | 结果 | 已知表现 |
| --- | --- | --- | --- |
| `V3.0.0` | `0.1.1-rc.2` | 支持 | 设置菜单、播放按钮和播放均可用 |
| `V3.0.0` | `0.1.2-rc.1` | 不支持 | 无法显示播放按钮，无法播放 |
| `V3.0.1-alpha` | `0.1.1-rc.2` | 不支持 | 无法显示设置菜单 |
| `V3.0.1-alpha` | `0.1.2-rc.1` | 支持 | 已完成人工验证 |

`V3.0.1-alpha` 的 `package.json` 仅声明可靠宿主 `0.1.2-rc.1`：

```text
0.1.2-rc.1
```

CI 仍会用同一个 tarball 顺序执行两个 DSH 版本的结构化 smoke，确保 Host、namespace、bundle 层面不会回归；结构化 smoke 不把不支持的浏览器功能组合标记为支持。当前发布环境要求是 `V3.0.1-alpha` + `0.1.2-rc.1`。

## 2. 已完成的兼容性改造

### 2.1 会话与消息读取

DSH 两条版本线使用了不同的会话接口：

- `0.1.2` 优先读取 `useChat(...).legacy`。
- `0.1.1-rc.2` 没有 `useChat`，改为通过 `useSession(snapshot => snapshot)` 获取完整旧会话快照。
- slot owner 上的 `session` 只作为最后回退。
- 遇到未知或不完整结构时返回空会话和 `running: false`，不让插件客户端崩溃。

统一逻辑在 `src/client/conversation-state.ts`，接入点在 `src/client/conversation.tsx`。已覆盖新版优先级、旧版快照、owner 回退、空快照、最新消息、自动播放和会话切换相关行为。

### 2.2 新旧设置 API

设置安装兼容层位于 `src/settings-compat.ts`：

- 旧版使用模块级 `installSettingsSection()` 和 `settingsNamespace()`。
- 新版通过 Cordis 注入的 settings provider 调用 `settings.installSection()`。
- 两种 API 都不存在时给出明确的 `Unsupported DSH settings API` 错误。

现有设置结构、保存内容和公开服务接口没有变化。

### 2.3 移除已废弃的客户端 runtime 依赖

`@deepseek-ai/dsh-client-runtime` 在 `0.1.2` 中已不存在，因此已完成：

- 从 DSH client `inject` 中移除。
- 从 peer/dev dependencies 中移除。
- 移除所有来自该包的类型导入。
- 使用 Cordis `Context` 和 `src/client/dsh-compat.ts` 中的最小结构化类型描述 SettingsScope、client context 和 slots。

这样既不会在 `0.1.2` 下加载不存在的模块，也不会把声明文件绑定到某个 DSH 内部实现。

### 2.4 包元数据与构建基线

- 插件版本升级为预发布版本 `3.0.1-alpha`。
- peer 范围改为显式支持范围，并将由 DSH runtime 提供的 peers 标记为 optional，避免隔离 profile 安装时产生虚假的缺失 peer 报错。
- dev dependencies 固定在 `0.1.2-rc.1`，确保源码能针对当前新接口完成编译。
- CI 使用 Node.js 24 和 pnpm `11.22.0`；pnpm 10 不支持本项目要求的 `pnpm pack --dry-run`。
- `pnpm-workspace.yaml` 对 `@deepseek-ai/*` 排除 minimum release age 限制，避免 DSH 新发布版本在 CI 安装阶段被供应链等待策略拦截。

## 3. 已完成的自动验证

兼容改造完成时已在本地通过：

- `pnpm typecheck`
- `pnpm test`：55 项全部通过
- `pnpm pack --dry-run`
- `pnpm pack`
- `0.1.1-rc.2`、`0.1.2-rc.1` 隔离 profile smoke 已配置为同一 tarball 的结构化检查
- `git diff --check`

smoke 脚本是 `scripts/dsh-compat-smoke.mjs`，它会：

1. 创建临时、隔离的 `DSH_HOME`。
2. 安装指定 DSH 和当前插件 tarball。
3. 执行 `pnpm peers check`。
4. 在随机本地端口启动 `dsh web --no-open`，最多等待 180 秒。
5. 验证 API Key 状态、settings namespace 和客户端 bundle 返回成功。
6. 检查 bundle 确实注册了 `dsh-xiaomi-tts`，兼容新旧设置 RPC 路径。
7. 检查日志中没有 peer 冲突、缺失 runtime、client compose、inject/contribution 或设置 API 错误。
8. 终止 DSH 并删除临时目录。

它只能证明安装、依赖组合、Host、静态客户端 bundle 和基础接口正常，**不能代替浏览器交互、真实 MiMo 请求和音频播放验证**。

## 4. 在另一台设备上准备环境

建议使用与 CI 一致的环境：

- Git
- Node.js 24
- pnpm `11.22.0`
- 支持 Web Speech API 的桌面浏览器（推荐 Chrome 或 Edge）
- 用于真实语音测试的 Xiaomi MiMo API Key

拉取代码并确认版本：

```bash
git clone https://github.com/ppy-web/dsh-plugin-xiaomi-mimo-tts.git
cd dsh-plugin-xiaomi-mimo-tts
git switch main
git pull --ff-only
git log -3 --oneline
node --version
pnpm --version
```

预期最近三个兼容相关提交包括：

```text
319e3f0 ci: allow fresh DSH releases
6df77d1 ci: pin pnpm version
d4e7351 fix: support current DSH release lines
```

若 pnpm 版本不同，可用 Corepack 准备指定版本：

```bash
corepack enable
corepack prepare pnpm@11.22.0 --activate
```

安装并执行基础检查：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm pack --dry-run
pnpm pack
```

最后一条命令应生成类似 `dsh-xiaomi-tts-3.0.1-alpha.tgz` 的文件。后续兼容测试应安装这个 tarball，而不是直接引用源码目录，以便验证最终发布包内容。

## 5. 运行自动兼容 smoke

`V3.0.1-alpha` 的发布目标是 `0.1.2-rc.1`：

```bash
node scripts/dsh-compat-smoke.mjs dsh-xiaomi-tts-3.0.1-alpha.tgz
```

成功时最后会输出：

```text
DSH 0.1.2-rc.1 compatibility smoke passed
```

脚本支持通过环境变量临时检查其他可安装版本。这适合快速排查，但不改变 CI 策略，也不能替代下一节的人工测试。

Linux/macOS：

```bash
DSH_COMPAT_VERSION=0.1.2-rc.1 node scripts/dsh-compat-smoke.mjs dsh-xiaomi-tts-3.0.1-alpha.tgz
```

Windows PowerShell：

```powershell
$env:DSH_COMPAT_VERSION = '0.1.2-rc.1'
node scripts/dsh-compat-smoke.mjs dsh-xiaomi-tts-3.0.1-alpha.tgz
Remove-Item Env:DSH_COMPAT_VERSION
```

## 6. 发布前人工验证

发布前人工验证以下可靠组合：

1. `V3.0.0` + `0.1.1-rc.2`：旧宿主基线。
2. `V3.0.1-alpha` + `0.1.2-rc.1`：当前发布组合。

每个版本必须使用独立且全新的 `DSH_HOME`，不要复用日常 profile。以下示例中的目录可替换为本机的绝对路径。

### 6.1 Linux/macOS 示例

```bash
export DSH_VERSION=0.1.1-rc.2
export DSH_HOME=/tmp/dsh-xiaomi-tts-compat/0.1.1-rc.2
pnpm dlx @deepseek-ai/dsh@$DSH_VERSION plugin --profile web add "$PWD/dsh-xiaomi-tts-3.0.1-alpha.tgz"
pnpm --dir "$DSH_HOME/profiles/web" peers check
pnpm dlx @deepseek-ai/dsh@$DSH_VERSION web --no-open --host 127.0.0.1 --port 3112
```

停止进程后，分别把 `DSH_VERSION`、`DSH_HOME` 和端口替换为：

| DSH_VERSION | DSH_HOME 末级目录 | 建议端口 |
| --- | --- | --- |
| `0.1.1-rc.2` | `0.1.1-rc.2` | `3112` |
| `0.1.2-rc.1` | `0.1.2-rc.1` | `3211` |

### 6.2 Windows PowerShell 示例

```powershell
$env:DSH_VERSION = '0.1.1-rc.2'
$env:DSH_HOME = 'C:\dsh-compat\xiaomi-tts\0.1.1-rc.2'
$tarball = (Resolve-Path '.\dsh-xiaomi-tts-3.0.1-alpha.tgz').Path
pnpm dlx "@deepseek-ai/dsh@$env:DSH_VERSION" plugin --profile web add $tarball
pnpm --dir "$env:DSH_HOME\profiles\web" peers check
pnpm dlx "@deepseek-ai/dsh@$env:DSH_VERSION" web --no-open --host 127.0.0.1 --port 3112
```

浏览器打开命令输出的地址。每轮完成后按 `Ctrl+C` 停止进程；确认没有需要保留的配置和日志后，再手动删除该版本的隔离目录。

### 6.3 每个版本的验收清单

每个代表版本都必须完成下面各项：

- [ ] DSH 启动成功，首页可打开，浏览器控制台没有插件加载错误。
- [ ] 启动日志没有 `Cannot find ... dsh-client-runtime`、peer 冲突、client compose、inject 或 settings API 错误。
- [ ] “语音朗读(Xiaomi MiMo)”设置卡片可见，字段和默认值正常。
- [ ] 修改并保存设置，重启同一 profile 后配置仍然存在。
- [ ] API Key 未配置时提示正确；配置 `sk-` 或 `tp-` Key 后状态正常，浏览器请求中不出现完整 Key。
- [ ] 已完成的历史 assistant 消息显示朗读按钮，点击后能朗读正确文本。
- [ ] 发送新消息后，仅最新完成回复触发自动播放；加载历史消息不应批量自动播放。
- [ ] 回复生成期间和完成后的按钮状态正确，不会把旧会话消息误判为当前最新消息。
- [ ] 切换会话时旧会话的朗读立即停止，新会话状态不会继承旧播放状态。
- [ ] 再次播放另一条消息会打断当前朗读。
- [ ] MP3 和 WAV 模式可以播放、暂停并继续。
- [ ] PCM 能流式播放并可停止；PCM 当前设计不支持暂停/续播，不能按 MP3/WAV 标准判失败。
- [ ] 预置音色和 Voice Design 均可发起朗读；Voice Design 在完整回复后自动播放。
- [ ] “MiMo 优先”“本地优先”“关闭本地语音”三种策略行为符合设置。
- [ ] MiMo 请求失败时，“MiMo 优先”能回退浏览器语音；“关闭本地语音”不会回退。
- [ ] 浏览器本地语音不可用或被拒绝时有明确提示，插件和 DSH 不崩溃。

如果无法使用真实 API Key，至少完成安装、启动、设置保存、历史按钮、会话切换和无 Key 错误提示；真实音频和回退项必须记录为“未测试”，不能记录为“通过”。

## 7. 验证结果记录表

复制下面表格到测试记录中。建议每台设备各保留一份，附上日志路径和截图。

| 设备/系统 | Node / pnpm | DSH | 插件 tarball | 基础检查 | smoke | 设置保存 | 历史朗读 | 自动播放 | 暂停/继续 | 会话切换 | 本地回退 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  | `0.1.1-rc.2` | `3.0.0` |  |  |  |  |  |  |  |  |  |
|  |  | `0.1.2-rc.1` | `3.0.1-alpha` |  |  |  |  |  |  |  |  |  |

结论只使用：`通过`、`失败`、`未测试`。不要用“基本正常”掩盖未覆盖项目。

## 8. 失败时收集的信息

提交兼容问题时至少附上：

```text
操作系统及版本：
浏览器及版本：
Node.js 版本：
pnpm 版本：
DSH 版本：
dsh-xiaomi-tts 版本或 tarball 名称：
是否使用全新 DSH_HOME：
失败的验收项：
最短复现步骤：
预期行为：
实际行为：
终端完整错误：
浏览器 Console 错误：
相关 Network 请求状态（注意删除 API Key）：
截图或录屏：
```

优先搜索以下特征：

```text
ERR_PNPM_PEER_DEP_ISSUES
@deepseek-ai/dsh-client-runtime
client-modules: ... failed to compose
Unsupported DSH settings API
dsh-xiaomi-tts: ... injection disabled
dsh-xiaomi-tts: ... contribution disabled
```

报告日志前必须删除 API Key、Authorization header、Cookie 和其他凭据。

## 9. 发布门槛

满足以下全部条件才能发布：

- `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test` 和 `pnpm pack --dry-run` 全部通过。
- CI 中两个 DSH 版本的结构化 smoke 通过。
- `V3.0.1-alpha` + `0.1.2-rc.1` 的浏览器设置、播放按钮和音频人工验收通过。
- `V3.0.0` + `0.1.1-rc.2` 的旧宿主基线人工验收通过。
- 没有把 unsupported 版本误标为支持，也没有把“未测试”项目视为通过。
- 最终测试对象是 `pnpm pack` 生成的 tarball。

基础测试、rc.2 smoke 或三版本人工验证任一失败，均不得发布。
