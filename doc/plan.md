# MiMo V2.5 ASR 单次录音转写方案

## Summary

- 新增独立的“语音识别”设置，默认开启，与 TTS 播报及自动播报开关互不影响。
- 录音按钮注册到 `conversation.input.right`，位于发送操作之前，不修改宿主 DOM。
- 点击开始录音；再次点击或达到 120 秒后停止，随后调用一次 `mimo-v2.5-asr`。
- 录音期间不出文字；停止后通过同一次请求的 SSE 增量响应回填输入框，不自动发送。
- 采用 16 kHz、单声道、PCM16 WAV。120 秒音频 Base64 后约 5.12 MB，满足官方 10 MB 上限。[MiMo ASR 文档](https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/Speech-Recognition)

## Implementation Changes

### 设置与接口

- 在现有 `TtsSettings`、解析默认值、Schemastery `Config` 和 `cordis.patch.yml` 中增加 `asrEnabled: boolean = true`。
- 设置卡增加独立的简洁开关；关闭后隐藏录音按钮，但 API Key 仍保持常驻并与 TTS 主开关无关。
- 继续复用现有 API Key、Base URL 和请求超时；语言固定为 `auto`，不增加模型或语言选择器。
- 新增内部同源路由 `/plugins/xiaomi-mimo-tts/transcribe-stream`，不新增公开 Cordis Service 或第三方插件 API。

### 录音与单次调用

- 浏览器通过 `getUserMedia` 和 `AudioWorklet` 采集音频，实时降混为单声道并重采样到 16 kHz；内存中累计 PCM，停止后封装为 WAV。
- 使用实际采样帧数执行 120 秒硬停止；权限失败、会话切换或组件卸载时释放 MediaStream、AudioContext、Worklet 和缓冲区，并且不调用 ASR。
- Host 接收原始 `audio/wav`，校验 RIFF/WAVE、PCM16、单声道、16 kHz、最大 120 秒和约 4 MiB 文件上限，再转换为 Base64。
- Host 只发起一次 `/chat/completions` 请求：
  - `model: "mimo-v2.5-asr"`
  - 单条 `input_audio` Data URL
  - `asr_options.language: "auto"`
  - `stream: true`
- Host 沿用现有 SSE 代理模式，转发 `choices[0].delta.content`；断连时中止上游。为严格满足“一次调用”，不做自动重试。
- 转写完成后追加到输入框现有草稿；草稿非空时用一个换行分隔。SSE 更新使用“插件最后写入值”保护，检测到用户同期编辑后不覆盖其内容，而在结果完成时追加完整转写。

### 按钮与音波晕染

- 空闲态仅显示简洁麦克风图标；录音态再次点击即停止并开始转写；转写态显示轻量环形加载且暂时不可重复触发。
- 录音态使用两层不占布局空间的晕染：
  - 外层蓝紫红渐变缓慢旋转，形成流动光晕。
  - 内层使用错误色红色径向光晕，表达正在录音。
- AudioWorklet 每约 50 ms 上报一次 RMS 音量，归一化到 `0–1`；通过 GSAP `quickTo()` 平滑映射到光晕 `scale: 1.04–1.32`、`opacity: 0.30–0.85`，安静时轻微呼吸，音量越大扩散越强。
- 动画只更新 transform、opacity 和 CSS 变量，按钮尺寸及工具栏布局保持不变；只在录音态设置 `will-change`。
- 使用 `@gsap/react` 的作用域化 `useGSAP()` 管理动画并自动清理；将 `gsap`、`@gsap/react` 作为插件运行依赖打入客户端 bundle。
- `prefers-reduced-motion` 下关闭旋转、呼吸及音量驱动缩放，仅保留稳定红色录音环和可访问状态文案。
- 录音、转写、权限拒绝、无 API Key、超时、上游错误均提供 tooltip、`aria-label` 和非打扰式状态提示。

## Test Plan

- 单元测试：重采样、PCM16/WAV 头、120 秒采样上限、音量归一化、SSE 分片与 `[DONE]`、空响应和草稿合并保护。
- Host 测试：方法及 Content-Type 校验、无 Key、超时、客户端断连、非法 WAV、超长音频，以及一次录音严格只产生一次上游请求。
- UI 测试：`asrEnabled` 默认开启且独立于 TTS；按钮位于 `conversation.input.right`；关闭后隐藏；录音、转写和错误状态可访问。
- 浏览器 E2E：麦克风允许/拒绝、手动停止、模拟 120 秒自动停止、切换会话清理、已有草稿追加及同期编辑保护。
- 最终执行 `pnpm run typecheck`、`pnpm test`、`pnpm run pack:check` 和 `git diff --check`。

## Assumptions and Defaults

- “发送按钮左侧”按 DSH 正式的 `conversation.input.right` slot 实现，不通过 CSS 定位侵入宿主发送按钮。
- 最长录音固定为 120 秒，不暴露为高级设置。
- 停止录音会立即触发一次转写；转写结果只写入草稿，不自动提交消息。
- 不保存或记录原始音频、Base64 内容及 API Key。
- 保持现有包名、公开 TTS 服务和 DSH 0.1.1/0.1.2 兼容范围不变；本功能开发不包含版本发布、提交或推送。
