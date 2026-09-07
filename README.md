![social](assets/social.png)

# dsh-xiaomi-tts

[![npm version](https://img.shields.io/npm/v/dsh-xiaomi-tts.svg)](https://www.npmjs.com/package/dsh-xiaomi-tts)
[![GitHub stars](https://img.shields.io/github/stars/ppy-web/dsh-plugin-xiaomi-mimo-tts.svg)](https://github.com/ppy-web/dsh-plugin-xiaomi-mimo-tts)

为 DSH Web 添加 Xiaomi MiMo TTS 语音朗读。

> 基于 Xiaomi MiMo TTS，将文字转为流畅、清晰的自然语音。MiMo TTS 当前为限时免费服务，具体政策请关注官方平台。

<p><a href="README.en.md"><strong>English README →</strong></a></p>

## 预览
| 预置音色 | 自定义音色 |
|:---:|:---:|
| ![Xiaomi MiMo 设置菜单](assets/menu.png) | ![自定义音色](assets/preset.png) |
| 设置界面 | UI示例 |
| ![UI](assets/setting.png) | ![UI](assets/image.png) |

## 功能

- 一键播报：在对话操作栏中显示“朗读”按钮（默认开启）。
- 内置音色：使用 `mimo-v2.5-tts` 输出流畅、清晰的音频；支持 PCM 流式播放。
- 自定义音色：使用 `mimo-v2.5-tts-voicedesign` 通过文字描述创造你想要的声音。
- 浏览器本地音色：使用浏览器宿主提供的离线或在线音色。
- 自动清洗文本：移除网址、文件路径、代码块、表情符号、图标和控制字符等。

## 环境要求

- `@deepseek-ai/dsh` `0.1.1-rc.2` 或 `0.1.2-rc.1`
- Node.js 22+
- Xiaomi MiMo API Key
- [官方 TTS API 文档](https://mimo.mi.com/models/zh-CN/mimo-v2.5-tts)

## 安装与使用

- 从 npm 安装 **（推荐）**：

```bash
dsh plugin --profile web add dsh-xiaomi-tts
```

- 从 [DSH 插件市场](https://github.com/dsh-market/dsh-market) 安装 **（推荐）**：

打开 **设置 → 插件市场**，搜索 `xiaomi-mimo-tts` 并点击安装。

- 让 DSH 或 任意AI Agent 帮你装——把下面这段提示词发给AI

```text
帮我给此电脑上的dsh安装 dsh-xiaomi-tts 插件。
1. 优先通过命令安装 dsh plugin --profile web add dsh-xiaomi-tts@latest
2. 如果失败，请尝试源码 https://github.com/ppy-web/dsh-plugin-xiaomi-mimo-tts
```

- 从 GitHub 安装：

```bash
dsh plugin --profile web add github:ppy-web/dsh-plugin-xiaomi-mimo-tts
```

安装后重启 `dsh web`，打开 **设置 → 插件 → 插件配置 → 语音朗读(Xiaomi MiMo)**
[获取并填写 API Key](https://platform.xiaomimimo.com/console/api-keys) 。支持标准API Key / Token Plan 专属 API key

修改任意设置后需要点击 **保存** 生效。

## 配置

**官方内置音色（`mimo-v2.5-tts`）**：

- 中文女声：`冰糖`、`茉莉`
- 中文男声：`苏打`、`白桦`
- 英文女声：`Mia`、`Chloe`
- 英文男声：`Milo`、`Dean`

预置模型默认选择 `PCM（流式播放）`：会在音频分片到达时立即开始播放，等待时间更短。
选择 `MP3（完整音频）` 或 `WAV（完整音频）` 时，会等待完整文件生成后播放。MP3 体积更小，WAV 保留无损音频但体积更大。

**自定义音色（`mimo-v2.5-tts-voicedesign`）**

暂不支持PCM，待官方上线后可适配。
提供了常用音色描述模板；用户可以直接修改并保存描述。
```text
青年女性，声线清亮、亲切自然，吐字清楚，语速适中，情绪温柔克制。
```

**浏览器本地兜底语音**

支持三种策略：“MiMo 优先”在 MiMo 失败时改用浏览器语音；“本地优先”优先使用浏览器语音；“关闭本地语音”仅使用 MiMo。
可选音色来自浏览器 Web Speech API，是否离线及实际可用范围取决于浏览器、操作系统和网络服务。

## 三方插件联动

我们对外暴露了PCM流式播放能力。
Web 插件可以直接调用本插件的服务进行流式播放。可直接在需要播放的位置写一行：

```ts
ctx.get('xiaomiMimoTts')?.play('欢迎回来')
```

建议通过 `ctx.get()` 动态获取这项能力，不必声明为必需的 `inject` 服务。插件未安装或未就绪时调用会安全跳过；`play()` 使用用户已保存的 MiMo 设置播放 PCM 流，`stop()` 可主动停止。新播放会自动打断当前朗读。

需要 TypeScript 类型提示时可仅导入类型：

```ts
import type { XiaomiMimoTtsService } from 'dsh-xiaomi-tts/client-api'

const tts = ctx.get('xiaomiMimoTts') as XiaomiMimoTtsService | undefined
tts?.play('欢迎回来')
```

## 隐私

- API Key 保存在 DSH Host，不会发送给浏览器。
- 生成语音时，正文会被发送给 Xiaomi MiMo 服务。
- 音频在浏览器内存中通过 Web Audio 或临时 Blob URL 播放，不会持久化到磁盘。

## 架构

- **共享层**：统一配置、文本清理、分段和 SSE 契约。
- **Host 插件**：管理设置与静态资源，并代理 MiMo 完整音频和 PCM 流式请求。
- **Web Client**：提供设置与朗读入口，负责播放状态、浏览器语音兜底和第三方播放服务。

```mermaid
flowchart LR
    DSH["DSH Web"] --> CLIENT["Web Client<br/>设置与播放"]
    THIRD["第三方 Web 插件"] -. "ctx.get('xiaomiMimoTts')" .-> CLIENT
    CLIENT -->|"完整音频 / PCM 流"| HOST["Host 插件<br/>设置与 API 代理"]
    HOST --> MIMO["Xiaomi MiMo API"]
    CLIENT -->|"本地语音兜底"| SPEECH["浏览器 Web Speech API"]
    SHARED["共享层<br/>配置、文本处理、SSE"] -.-> CLIENT
    SHARED -.-> HOST
```

## 开发

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm pack:check
```

日常构建使用 `pnpm build`。
排查 PCM 流式链路时使用 `pnpm build:debug`。

> windows用户从本地开发版切换到 npm 版时，请先停止 DSH Web，避免 Windows Junction 被运行中的 Node 进程占用：

```powershell
.\start\dsh-plugin-reinstall.bat 3.0.1
```

## 推荐配合插件一起使用

- [dsh-whale-musume](https://github.com/Sutera-Diffusus/dsh-whale-musume#readme)：元气鲸鱼娘桌宠。
- [dsh-plugin-uisfx](https://github.com/XanthanL/dsh-plugin-uisfx#readme)：语义化 UI 音效。
- [dsh-dream-skin](https://github.com/RevolutionLA/dsh-dream-skin#readme)：原生换肤、背景壁纸、强调色、主题包 。