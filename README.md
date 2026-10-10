![social](assets/social.webp)

# dsh-xiaomi-tts

[![npm version](https://img.shields.io/npm/v/dsh-xiaomi-tts.svg)](https://www.npmjs.com/package/dsh-xiaomi-tts)
[![npm downloads](https://img.shields.io/npm/dm/dsh-xiaomi-tts.svg)](https://www.npmjs.com/package/dsh-xiaomi-tts)
![Xiaomi MiMo](https://img.shields.io/badge/Xiaomi-MiMo-ff6900?logo=xiaomi&logoColor=white)
[![deepseek-harness](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

为 DSH 添加 Xiaomi MiMo TTS 语音朗读、浏览器本地语音兜底和可选 UI 音效。

> MiMo TTS 当前可能处于限时免费或调整计费阶段，请以 Xiaomi MiMo 官方平台的最新政策为准。

<p><a href="README.en.md"><strong>English README →</strong></a></p>

## 🎨 预览

- [在线预览设置页面](https://ppy-web.github.io/dsh-plugin-xiaomi-mimo-tts)
- QQ 交流群：`1104616387` 欢迎加入

![插件设置界面](assets/setting.png)

![功能简介](assets/image.webp)

## ✨ 功能

- 一键朗读：在助手消息操作栏中提供“朗读”按钮。
- 低延迟播放：`mimo-v2.5-tts` 支持 PCM 流式播放，并在必要时回退到完整音频或浏览器语音。
- 内置与自定义音色：支持官方内置音色，以及 `mimo-v2.5-tts-voicedesign` 音色描述。
- 浏览器本地语音：可选择 MiMo 优先、本地优先或仅使用 MiMo。
- 播放控制：支持 0.5×–2.0× 语速、语音音量、暂停、继续和停止。
- 文本清洗：朗读前移除网址、路径、代码块、表情符号和控制字符等不适合播报的内容。
- 可选音效：提供任务状态和语义化点击音效，默认关闭。
- 插件联动：向其他 DSH 插件暴露可选的 PCM 播放服务。
- 鲸鱼娘 Agent 预设：安装后自动添加鲸鱼娘 Agent 预设。对话、幽默、语境识别、表情包。

## 📋 环境要求

- `@deepseek-ai/dsh` `0.2.0-rc.2`（当前目标版本；兼容 `0.1.7-x` 至 `0.2.x` 版本）
- Node.js 22+
- 使用 MiMo 语音时需要 Xiaomi MiMo API Key
- [官方 TTS API 文档](https://mimo.mi.com/models/zh-CN/mimo-v2.5-tts)

## 🚀 安装

### 官方安装（desktop/web）（推荐）

打开桌面/web端，进入插件管理面板，搜索 `dsh-xiaomi-tts` 即可安装

### 从 npm 安装（web）

```bash
dsh plugin --profile web add dsh-xiaomi-tts@latest
```

### 从插件市场安装

 ![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg) [插件市场](https://awesome-dsh-plugin.com) 已收录本插件，如你已安装社区的插件市场，可在 **设置 → 插件市场** 中搜索 `xiaomi-mimo-tts`安装。

### 卸载（web）

```bash
dsh plugin --profile web remove dsh-xiaomi-tts
```

## 🐋 首次使用

新安装的默认行为：

- 朗读按钮安装即用（浏览器本地语音）；
- **自动播报默认关闭**；
- **UI 音效默认关闭**；

推荐配置顺序：

1. [获取 Xiaomi MiMo API Key](https://platform.xiaomimimo.com/console/api-keys)。
2. 在插件设置中输入 Key。
3. 打开“调音台”，选择模型和音色。
4. 在“演播厅”试听。
5. 按需开启自动播报和 UI 音效。
6. 点击底部 **保存**

## ⚙️ 配置说明

### 官方内置音色

`mimo-v2.5-tts` 当前提供：

- 中文女声：`冰糖`、`茉莉`
- 中文男声：`苏打`、`白桦`
- 英文女声：`Mia`、`Chloe`
- 英文男声：`Milo`、`Dean`

### 自定义音色

`mimo-v2.5-tts-voicedesign` 支持从音色描述生成声音。设置面板包含预设模板，也可以手动编辑：

### 浏览器本地语音

- **MiMo 优先**：MiMo 在首段音频开始前失败时，尝试浏览器语音。
- **本地优先**：先使用浏览器语音，失败后尝试 MiMo。
- **关闭本地语音**：只使用 MiMo，不进行本地兜底。

浏览器音色来自 Web Speech API。是否离线、可用语言和实际声音取决于浏览器、操作系统及其语音服务。

### 朗读范围

- **智能模式**：自动播报优先朗读首个语义段；未读内容较多时可能补一句收尾提示。手动朗读播放全文。
- **全文模式**：自动播报和手动朗读都播放全文。
- **首段模式**：自动播报和手动朗读都只播放首个语义段。

## 🔌 三方插件联动

![whale-girls](assets/whale-girls.webp)

本插件向其他dsh插件提供可选 PCM 流式播放能力：

```ts
ctx.get('xiaomiMimoTts')?.play('欢迎回来')
```

建议通过 `ctx.get()` 动态获取，不要声明为必需注入。插件未安装、未就绪或已关闭时，调用会安全跳过；新播放会中断当前朗读，`stop()` 可主动停止。

需要 TypeScript 类型时：

```ts
import type { XiaomiMimoTtsService } from 'dsh-xiaomi-tts/client-api'

const tts = ctx.get('xiaomiMimoTts') as XiaomiMimoTtsService | undefined
tts?.play('欢迎回来')
```

## 🐳 鲸鱼娘 Agent 预设

安装本插件后，新建会话时可以在 Agent 预设列表选择“鲸鱼娘”。
默认带一点傲娇、米饭、尾巴和摸鱼梗，也会结合当前语境低频发送本地表情包，并保留 CDN 直链兼容。
人设和表情包关键词参考了社区维护的 [DeepSeek-chan Meme Pack](https://github.com/the-beating-light-of-the-nail/deepseek-chan-meme-pack)。
插件另附 44 张本地表情包。 [素材清单](skills/whale-girl/memes.json) 记录各图的使用语境。

## 🔒 隐私与网络访问

- API Key 由 DSH Host 保存，浏览器只读取“是否已配置/格式是否识别”的状态，不读取密钥正文。
- 浏览器本地语音由 Web Speech API 提供；标记为在线的音色可能把文本交给浏览器、操作系统或其网络语音服务。
- MiMo 生成的音频自动保存在浏览器的 IndexedDB 中。点击设置底部「音频历史」可查看音频历史；最多保留最近 100 条 / 100 MB，支持试听、下载；
- 流式 PCM 保存为 24 kHz 单声道 WAV；仅保留成功完成的生成请求。Web Speech API 本地语音没有可导出的音频文件。
- 音效核心移植自 [uisfx 0.4.0](https://github.com/romainsimon/uisfx)，遵循 MIT License，详见 `NOTICE`。

## 🛠️ 开发

启动本地 UI Lab 直接渲染 `src/client/settings/card.tsx`：

```bash
pnpm install
pnpm dev
```

常用检查：

```bash
pnpm typecheck
pnpm test
pnpm dev:build
pnpm pack:check
```

- `pnpm build`：正常构建。
- `pnpm build:debug`：启用 PCM 链路调试日志的构建。
- `pnpm profile:check`：验证本机 DSH Web profile 中的安装状态。

Windows 从本地开发链接切换到 npm 包前，请先停止 DSH Web，避免运行中的 Node 进程占用 Junction：

```powershell
.\start\dsh-plugin-reinstall.bat 3.0.9
```

如果是 DSH Desktop profile，只需要卸载残留的本地链接，可在退出 Desktop 后运行：

```powershell
.\start\dsh-plugin-uninstall-local-link.bat desktop
```

## 🤝 推荐

- [dsh-deep-whale](https://github.com/Small-tailqwq/dsh-deep-whale#readme) · 鲸鱼娘主题皮肤系列。
- [dsh-whale-musume](https://github.com/Sutera-Diffusus/dsh-whale-musume#readme) · 元气鲸鱼娘桌宠（已支持联动，推荐安装）。
- [dsh-plugin-uisfx](https://github.com/XanthanL/dsh-plugin-uisfx#readme) · 语义化 UI 音效。
- [dsh-dream-skin](https://github.com/RevolutionLA/dsh-dream-skin#readme) · 原生换肤、背景壁纸、强调色和主题包。
- [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) · 一个为 dsh-TUI 生态打造的插件
