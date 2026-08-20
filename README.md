# dsh-xiaomi-tts

为 DeepSeek Harness Web 的助手回复添加 Xiaomi MiMo TTS 语音朗读。

## 界面预览

设置菜单中的插件配置默认收起，点击标题即可展开；助手回复操作栏会显示朗读、暂停和继续按钮。

![Xiaomi MiMo 设置菜单](assets/menu.png)

![朗读按钮](assets/play.png)

![暂停按钮](assets/pause.png)

## 功能

- 在每条已完成助手回复正文下方的操作栏中添加“朗读”按钮。
- 调用 Xiaomi MiMo 官方 `mimo-v2.5-tts` 接口，把回复正文转成 MP3 或 WAV 并播放。
- 在 **设置 → 插件 → 插件配置** 中配置 API Key、自动播报、音色、格式和朗读指令。
- API Key 仅由 DSH Host 读取，浏览器只向同源 Host 路由提交回复正文。
- 支持暂停、继续、重新生成，以及浏览器自动播放被拦截时的提示。
- 设置卡片默认折叠，减少插件配置占用的页面空间。

> 当前版本聚焦官方内置音色模型 `mimo-v2.5-tts`，暂不提供 Voice Design 与 Voice Clone 配置。

## 环境要求

- `@deepseek-ai/dsh` `0.1.0-rc.7` 或兼容版本
- Node.js 22+
- Xiaomi MiMo API Key

官方 TTS API 文档：<https://mimo.mi.com/static/docs/api/audio/tts.md>

## 安装

从 npm 安装：

```bash
dsh plugin --profile web add dsh-xiaomi-tts
```

从本地目录安装：

```bash
dsh plugin --profile web add ./dsh-plugin-xiaomi-mimo-tts
```

从 GitHub 安装：

```bash
dsh plugin --profile web add github:ppy-web/dsh-plugin-xiaomi-mimo-tts
```

安装后重启 `dsh web`，打开 **设置 → 插件 → 插件配置 → Xiaomi MiMo 语音朗读**，填写 API Key 并保存。

## 配置

可用内置音色：

- 中文女声：`冰糖`、`茉莉`
- 中文男声：`苏打`、`白桦`
- 英文女声：`Mia`、`Chloe`
- 英文男声：`Milo`、`Dean`

设置卡片默认收起。点击“Xiaomi MiMo 语音朗读”标题后，可配置：

- API Key
- 是否自动播报新回复
- 内置音色
- MP3/WAV 输出格式
- 朗读风格指令

默认配置位于 `cordis.patch.yml`，用户设置会覆盖 composition 默认值。

## 自动播报说明

浏览器通常要求页面先发生一次用户交互，才允许带声音的自动播放。如果浏览器拒绝 `audio.play()`，插件不会绕过浏览器策略，点击回复下方的朗读按钮即可播放。

为避免刚启用插件或打开历史会话时批量朗读旧消息，自动播报只处理插件加载后短时间内新挂载的回复操作项。

## 安全设计

- `apiKey` 的 Schemastery schema 标记为 `role('secret')`。
- 设置描述通过 DSH wire 传到浏览器时会脱敏。
- Host 使用 API Key 请求 `https://api.xiaomimimo.com/v1/chat/completions`。
- 音频响应不会持久化到磁盘，浏览器使用临时 Blob URL 播放并在切换时释放。
- Host 路由限制请求体大小、正文长度和请求超时。

请注意：回复正文会发送给 Xiaomi MiMo 服务，请在使用前确认内容符合你的隐私与合规要求。

## 开发

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm pack:check
```

## 许可证

MIT
