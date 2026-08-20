# dsh-xiaomi-tts

为 DeepSeek Harness Web 的助手回复添加 Xiaomi MiMo TTS 语音朗读。

## 功能

- 在每条已完成助手回复正文下方的操作栏中添加“朗读”按钮。
- 调用 Xiaomi MiMo 官方 `mimo-v2.5-tts` 接口，把回复正文转成 MP3 或 WAV 并播放。
- 在 **设置 → 插件 → 插件配置** 中配置：
  - Xiaomi MiMo API Key
  - 是否自动播报新回复
  - 内置音色
  - MP3/WAV 输出格式
  - 朗读风格指令
- API Key 仅由 DSH Host 读取，请求 Xiaomi MiMo 也从 Host 发出；Key 不会交给浏览器代码。
- 支持暂停、继续、重新生成，以及浏览器自动播放被拦截时的提示。

> 当前版本聚焦官方内置音色模型 `mimo-v2.5-tts`，暂不提供 Voice Design 与 Voice Clone 配置。

## 环境要求

- `@deepseek-ai/dsh` `0.1.0-rc.7` 或兼容版本
- Node.js 22+（建议使用 DSH 当前支持的 Node.js 版本）
- Xiaomi MiMo API Key

官方 TTS API 文档：<https://mimo.mi.com/static/docs/api/audio/tts.md>

## 从本地目录安装

在插件仓库父目录执行：

```bash
dsh plugin --profile web add ./dsh-plugin-xiaomi-mimo-tts
```

然后重启 `dsh web`。插件属于 Web profile 的 composition layer，安装命令会自动把声明了 `dsh.bundle` 的包加入 profile bundles。

开发过程中修改源码后：

```bash
cd dsh-plugin-xiaomi-mimo-tts
pnpm install
pnpm build
```

之后重启当前 `dsh web`，或在使用支持插件 HMR 的源码开发环境时触发相应重载。

## 从 GitHub 安装

发布仓库后可执行：

```bash
dsh plugin --profile web add github:ppy-web/dsh-plugin-xiaomi-mimo-tts
```

Git 安装会运行 `prepare` 生成 `lib/`。如果 pnpm 阻止依赖构建，请根据 DSH 输出，把本包加入该 profile 的 `pnpm-workspace.yaml` `allowBuilds`，再重新安装。

## 从 npm 安装

```bash
dsh plugin --profile web add dsh-xiaomi-tts
```

## 配置

打开：

```text
设置 → 插件 → 插件配置 → Xiaomi MiMo 语音朗读
```

填写 API Key，选择音色与格式，再保存。为避免从浏览器读取或显示敏感信息，设置卡不会回显当前密钥；输入新值并保存才会替换已有密钥。

可用内置音色：

- 中文女声：`冰糖`、`茉莉`
- 中文男声：`苏打`、`白桦`
- 英文女声：`Mia`、`Chloe`
- 英文男声：`Milo`、`Dean`

默认配置位于 `cordis.patch.yml`：

```yaml
config:
  apiKey: ''
  baseURL: 'https://api.xiaomimimo.com/v1'
  model: 'mimo-v2.5-tts'
  voice: '冰糖'
  format: 'mp3'
  autoPlay: false
  instruction: '请用自然、清晰、语速适中的语气朗读。'
  maxTextLength: 12000
  requestTimeoutMs: 120000
```

用户设置层会覆盖这些 composition 默认值。

## 自动播报说明

浏览器通常要求页面先发生一次用户交互，才允许带声音的自动播放。因此：

- 开启自动播报后，新完成的回复会尝试生成并播放语音；
- 如果浏览器拒绝 `audio.play()`，插件不会绕过浏览器策略；
- 用户点击该回复下方的朗读按钮即可播放。

为避免刚启用插件或刚打开历史会话时批量朗读旧消息，自动播报仅在插件加载后的短时间窗口中尝试处理新挂载的回复操作项。

## 安全设计

- `apiKey` 的 Schemastery schema 标记为 `role('secret')`。
- 设置描述通过 DSH wire 传到浏览器时会脱敏。
- 浏览器只向同源 Host 路由提交需要朗读的正文。
- Host 使用 API Key 请求 `https://api.xiaomimimo.com/v1/chat/completions`。
- 音频响应不会持久化到磁盘；Host 直接把音频字节返回浏览器，浏览器使用临时 Blob URL 播放并在切换时释放。
- Host 路由限制请求体大小、正文长度和请求超时。

请注意：回复正文会发送给 Xiaomi MiMo 服务。请在使用前确认内容符合你的隐私与合规要求。

## 开发

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm pack:check
```

项目结构：

```text
src/index.ts          Host：settings namespace、MiMo 请求、同源音频路由
src/client/index.tsx  Web Client：消息操作按钮、设置卡片、音频播放
cordis.patch.yml      DSH bundle patch
```

## 发布到 GitHub / npm 前

1. 确认包名在 npm 可用，或改为你自己的 scope，例如 `@your-name/dsh-xiaomi-tts`。
2. 同步修改：
   - `package.json.name`
   - `cordis.patch.yml` 中的 row `name`
   - `tsdown.config.ts` 中的 `PACKAGE_ID`
3. 执行 `pnpm test && pnpm pack:check`。
4. 提交 `src/`、构建配置、文档；npm 发布包会包含构建后的 `lib/`。

## 许可证

MIT
