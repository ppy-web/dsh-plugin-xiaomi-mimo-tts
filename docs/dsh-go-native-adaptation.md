# DSH Go 原生适配进度

> 2026-11-04 · 分支 `dsh-go-native-adapter` · 基线提交 `b214a36`
> 相关提交：`50bfafd`（原生半侧）、`ddd3b59`（版本 5.0.0-alpha.4 测试包）

## 1. 目标与结论

目标是让本插件在 **DSH Go（Android 客户端）不打开网页版**的情况下也能正常使用。DSH Go 的原生界面不执行插件的网页代码，只认 `package.json` 里的 `dshGo` 清单和宿主侧通过 `ctx.dshGo` 提供的 JSON 视图，因此新增了一个独立的宿主半侧模块，而不是改造现有 React 客户端。

已经完成并验证的内容：

- 长按助手回复「朗读」，音频由宿主现有 TTS 合成，App 原生播放。
- 开口即停（App 负责停声音，插件收 `voice.speechStart` 后停字幕）。
- 朗读期间浮动字幕，随进度更新。
- 原生「朗读设置」面板：启用开关、服务商、音色、API Key、朗读范围、音量、语速。
- 输入框上方状态条显示「服务商 · 朗读就绪 / 待填密钥」，点开进入设置。
- 旧版 App 能力不足时退回只读提示，不会出现坏占位。

网页版保持原样；原生与网页两侧共用同一份配置。

## 2. 架构

```
DSH Go App
  ├─ message.actions「朗读」 ──invoke──▶ ctx.dshGo.on('read')
  │                                        └─ 返回 audio.play + voice.start + overlay.show
  ├─ 媒体路由 ──▶ ctx.dshGo.media('speech') ──▶ ctx.speechSynthesis.synthesize()
  ├─ 字幕通道 ◀── ctx.dshGo.micro('caption') ◀── 100ms 定时器
  └─ 设置面板 ◀── ctx.dshGo.panel('settings') ──▶ ctx.settings.mutate()
```

要点：

- `ctx.inject(['dshGo'])` 只在装有 dsh-go 桥接的主机执行；普通 DSH Web 上该行空转，不影响原插件。
- `on('read')` 必须在 3 秒内返回，所以只负责记录文本并返回效果；慢的合成放在 `media`（30 秒预算）。
- 设置写入走 `ctx.settings.mutate()`。DSH 的通用配置表单不能写 `role('secret')` 字段，这是原生侧能填 API Key 的关键。
- 原生半侧通过新增的 `xiaomiTtsSettings` 服务读取实时配置（仅宿主本地，包含密钥），并订阅 `loader/volatile-update` 刷新界面。

## 3. 能力矩阵

| 能力 | 原生界面 | 网页版 |
|---|---|---|
| 长按朗读 / 开口即停 / 浮动字幕 | ✅ | ✅ |
| 服务商、音色、API Key、音量、语速、朗读范围 | ✅（精简面板） | ✅（完整） |
| 自动朗读、播报来源、UI 音效、试听、音频历史、QQBot | ❌ | ✅ |
| 工具卡 | 通用工具行（未加 `presentationMeta`） | 原样式 |

主机覆盖：手机本机引擎全功能；SSH 主机目前只有工具卡（桥接二期）；中转主机没有原生插槽。App 缺少 `audio` 能力时不显示「朗读」按钮。

## 4. 文件改动

| 文件 | 作用 |
|---|---|
| `package.json` | 新增 `dshGo` 清单（v1、菜单、媒体、字幕、悬浮字幕、面板、状态条）；新增 `./dsh-go` 导出与打包条目 |
| `src/dsh-go.ts`（新增） | 原生半侧：文本提取、朗读记录与字幕时间线、媒体合成、设置面板视图与保存 |
| `src/index.ts` | 提供 `xiaomiTtsSettings` 服务（`ctx.provide`，带测试上下文兼容判断） |
| `src/host-api.ts` | 增加 `TtsSettingsAccess` 接口与 Cordis 上下文声明 |
| `cordis.patch.yml` | 新增 `xiaomi-mimo-tts-dsh-go` 行，指向 `dsh-xiaomi-tts/dsh-go` |
| `tsdown.config.ts` | 增加 `dsh-go` 构建入口 |
| `handbook.md` | 新增「DSH Go 原生界面」一节 |
| `test/dsh-go.test.mjs`（新增） | 13 项原生半侧测试 |

## 5. 关键实现细节

### 5.1 朗读文本

复用现有 `src/text/` 管线：`prepareTtsText()` 去掉 Markdown、代码块、路径和符号，再按 `readScope` 取全文或首段；超过 `maxTextLength` 时在句末截断并补一句「后面还有内容，请查看文字回复」。

### 5.2 音频与字幕

- 文本不超过 1800 字请求 WAV（可从音频头拿到准确时长，字幕更准）；更长请求 MP3（避免超过 16 MiB 媒体上限）。
- 合成失败时 WAV 自动回退 MP3，取消信号会传递到上游请求。
- 字幕按句切分，用文本长度估算时间线；拿到真实时长后按比例缩放。每 100ms 推送一次 `{ text, progress }`，单帧文字限制 240 字。
- `audio.ended / audio.stopped / audio.error / voice.speechStart` 任一到达即停止字幕。

### 5.3 设置面板

面板 `settings` 只保留手机上真正需要的字段，避开 48 个完整配置项。保存时：

1. 校验服务商、音色、API Key 格式（小米要求 `sk-` / `tp-` 前缀）、音量 0–1、语速 0.5–2。
2. 只提交真正变化的字段；切换服务商没填音色时自动补该服务商默认音色。
3. 调用 `ctx.settings.mutate('xiaomi-mimo-tts', ops)` 写入 volatile 配置，随后 `ctx.dshGo.refresh('settings')`。
4. 密钥字段永远不进入视图数据，面板数据里 `apiKey` 始终为空字符串。

## 6. 验证记录

| 项目 | 命令 / 方式 | 结果 |
|---|---|---|
| 类型检查 | `pnpm typecheck` | 通过 |
| 全量测试 | `pnpm test` | 505 项全部通过（含新增 13 项） |
| 官方清单检查 | `node sdk/plugin-kit/bin/check.mjs <插件目录>` | `原生界面能显示（菜单 1 · 状态条 1 · 面板 1）` |
| 协议宿主校验 | dsh-go `createTestHost` | contributions `ready: true`；中英文视图各 12 节点 / 约 1.3 KiB，无问题；`read` 返回三件套效果；`media` 返回音频 |
| 配置写入链路 | 隔离 profile + 探针插件 | `describe` 能看到条目（`applies: live`）；`mutate` 写 `apiKey`、`voiceRate` 成功；`xiaomiTtsSettings.current()` 立即读到新值，密钥显示已设置 |
| 打包产物 | `pnpm pack` + 隔离 profile 安装 | `dsh plugin --profile web add <tgz>` 成功，启动正常，插件路由与客户端 bundle 均 200 |

测试包：`output/dsh-go-test/dsh-xiaomi-tts-5.0.0-alpha.4.tgz`（1.5 MB，本地测试用，未发布到 npm）。

## 7. 已知限制与风险

1. **尚未真机验收**：音频出声、麦克风开口检测、字幕观感、后台/锁屏行为只能在 Android 上确认。
2. **密钥明文输入**：App 没有密码输入组件，输入过程中可见；保存后只写不读。
3. **自动朗读等仍是网页专属**：原生插槽没有自动播报通道，音效和历史页也只能在网页版使用。
4. **宿主必须装有 dsh-go 桥接**：SSH 主机目前拿不到桥接；中转主机不放行 `/dsh-go/*`。
5. **通用配置页仍会列出较多字段**：插件注册了 `configure({ auto: false })`，但 App 会画出能画的字段；手机上建议用原生「朗读设置」面板。
6. **打包脚本会临时重写 `package.json`**：`pnpm pack` 的 prepack 会删除 `scripts` 再恢复，恢复的是格式化后的 JSON；打包后需 `git checkout -- package.json` 保持工作区干净。

## 8. 真机验收清单

- [ ] 长按回复出现「朗读」，点击后从手机出声。
- [ ] 朗读时顶部出现浮动字幕，随进度滚动。
- [ ] 开口说话立即停播，字幕同步停止。
- [ ] 锁屏 / 切后台后按预期停止。
- [ ] 状态条显示「朗读就绪 / 待填密钥」，点击进入设置。
- [ ] 设置面板输入 API Key 保存后状态变为「已就绪」，再次进入不显示密钥。
- [ ] 切换服务商后音色自动补默认值，保存后可朗读。

## 9. 后续计划

1. 真机验收后修问题，再决定是否发布正式版。
2. Phase C：给 `speak` / `synthesize_speech` 工具加 `presentationMeta` 原生工具卡；按真机反馈扩展设置面板（模型、豆包复刻音色等）。
3. 等 dsh-go 桥接支持 SSH 主机后，补远程主机的原生插槽验证。
