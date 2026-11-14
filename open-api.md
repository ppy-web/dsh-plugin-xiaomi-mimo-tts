# 开放能力接口

本文件维护 `dsh-xiaomi-tts` 的对外契约。接口变更时应同时更新本文、公开 TypeScript 类型和行为测试。日常配置见[用户手册](https://ppy-web.github.io/dsh-plugin-xiaomi-mimo-tts/#manual)。

## 选择接入方式

| 调用方 | 接口 | 音频如何交付 |
| --- | --- | --- |
| DSH Agent | `synthesize_speech`、`speak`、`speech_mode` | 宿主文件或会话交付适配器 |
| DSH 宿主插件 | `ctx.speechSynthesis`，类型入口 `dsh-xiaomi-tts/host-api` | Buffer、托管文件或自定义交付渠道 |
| DSH 浏览器插件 | `ctx.xiaomiMimoTts`，类型入口 `dsh-xiaomi-tts/client-api` | 在当前浏览器播放 |
| 独立程序、手机或硬件 | HTTP 能力查询、导出接口与限时下载 URL | 下载 MP3 / WAV / SILK 文件 |

默认入口 `dsh-xiaomi-tts` 提供宿主服务与 Web 路由。无 Web 的 profile 可使用 `dsh-xiaomi-tts/host`，只提供宿主服务；两种入口在同一服务作用域二选一。Agent 工具需要在预设中另行挂载 `dsh-xiaomi-tts/speech-agent`。

## 宿主插件接口

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'dsh-xiaomi-tts/host-api'

export const inject = ['speechSynthesis']

export async function apply(ctx: Context) {
  const capabilities = ctx.speechSynthesis.capabilities()
  const audio = await ctx.speechSynthesis.synthesize({
    text: '欢迎回来。',
    format: 'wav',
  })
  // audio.data 是 Buffer，可交给自己的上传、存储或播放逻辑。
  ctx.logger.info(`${capabilities.provider}: ${audio.data.length} bytes`)
}
```

| 方法 | 契约 |
| --- | --- |
| `capabilities()` | 读取当前保存的供应商、模型、音色及功能支持情况，不发起上游请求。返回结构见下方能力查询。 |
| `currentProvider()` | 返回当前有效供应商 ID；外部接管优先，内置配置不变。 |
| `supportsAudioTags()` | 当前供应商与模型是否支持正文内音频标签。 |
| `synthesize(request)` | 返回 `SpeechAudio`：`data: Buffer`、`text`、`provider`、`format`、`contentType`、可选 `durationMs`。不写文件。 |
| `exportAudio(request)` | 返回 `SpeechArtifact`：`path`、`size`、`format`、`contentType`、可选 `durationMs` 与幂等的 `remove()`。不会自动生成下载 URL。 |
| `registerDelivery(adapter)` | 注册 `{ id, format, check?, send }`，返回注销函数。`file` 是保留 ID。 |
| `deliver(request, id, context)` | 合成并通过指定适配器交付。`context` 包含 `agent`、`signal`、可选 `automatic`。 |
| `hasDelivery(id)` / `setDeliveryEnabled(id, enabled)` | 查询交付是否可用，或启停渠道。停用会取消该渠道的待处理任务。 |
| `isAutomaticDeliveryEnabled(id)` / `setAutomaticDeliveryEnabled(id, enabled)` | 查询或控制自动交付；关闭只取消自动任务，保留显式请求。 |

`SpeechRequest` 的通用字段：

| 字段 | 类型与含义 |
| --- | --- |
| `text` | 必填字符串，按所选供应商规则清理后合成。 |
| `provider` | 可选 `xiaomi` / `doubao` / `breeze` / 已注册的 `external:*` ID；省略时使用当前有效引擎，外部接管优先。显式指定内置供应商时使用其保存配置。 |
| `engineRevision` | 可选引擎状态版本。浏览器请求携带此值；过期返回 `speech-engine-changed`，不会改用其他引擎执行。 |
| `model` / `voice` | 可选模型或音色覆盖；省略时使用所选供应商保存的值。Breeze 固定为 `breeze-tts-2`。 |
| `speechInstruction` | 本次语气、情绪、方言等自然语言指令，不写回设置；豆包复刻模型不支持。空字符串清除本次请求的默认指令。 |
| `voiceDesignPrompt` | 小米 VoiceDesign 的本次声音描述。 |
| `voiceRate` | 豆包、Breeze 的服务端语速，范围 0.5–2；小米无该服务端参数。 |
| `format` | `mp3` / `wav` / `silk`。省略时，宿主格式为 WAV 则输出 WAV，否则输出 MP3。 |
| `maxDurationMs` | 可选正数，要求 WAV / SILK；在交付前检查真实时长，超限拒绝，不截断。 |
| `signal` | 宿主插件传入的 `AbortSignal`，用于取消。 |
| `splitLongText` | 仅渠道 `deliver()` 使用；设为 `true` 后按供应商单次限制分段，依次合成并发送。不合并成一个文件。 |

请求不接受供应商密钥、上游地址或输出路径。单次覆盖不改变保存的配置。托管文件位于宿主用户目录下的 `.dsh-xiaomi-tts/audio`，超过 24 小时后由启动及每小时清理任务删除；应及时取走需要长期保留的文件。

适配器的 `check(context)` 在合成前检查渠道前提，`send(audio, context)` 负责会话路由、权限及发送后的临时文件清理。用 `ctx.effect(() => ctx.speechSynthesis.registerDelivery(adapter))` 绑定注销。遵守取消信号，发送失败、部分成功或结果不明时不要自动重发。

Agent 集成还会发出 `speech/delivered` 和 `speech/failed` 事件，载荷包含 `agent`、交付结果或错误码、`automatic`。直接调用 `synthesize()` / `exportAudio()` 不会发出这些会话事件。

## HTTP 接入与鉴权

以下新增接口使用同一组前缀：`/plugins/xiaomi-mimo-tts`。若 DSH 部署在 `/dsh/` 等子路径，需在前面加部署前缀。

在默认 Web 插件条目的宿主配置中设置 `openApiToken`，重载或保存配置后生效。例如，在已有条目的 `config` 中补充：

```yaml
openApiToken: '替换为自行生成的长随机访问令牌'
```

该字段目前通过宿主 profile 配置，不在自定义设置页面提供输入框。它独立于供应商 API Key，默认空值表示 HTTP 能力查询和音频导出接口关闭；宿主插件接口不受影响。

能力查询和导出请求都必须携带 `Authorization: Bearer <openApiToken>`，包括同源浏览器请求。来自其他 Origin 的浏览器请求会被拒绝，接口不提供跨域 CORS。无 Origin 的独立程序可携带令牌调用。接口沿用 DSH Web 的监听地址和部署访问控制，不会另开端口；远程设备需要能够访问该地址。通过网络传输令牌时使用 HTTPS。

下载 URL 自带随机访问凭据，不需要再附加此 Bearer 令牌。知道完整 URL 的人可在有效期内下载，宿主或反向代理自己的登录控制仍然适用。

### 查询能力

```http
GET /plugins/xiaomi-mimo-tts/capabilities
Authorization: Bearer <openApiToken>
```

返回 JSON，状态码 `200`。宿主 `capabilities()` 也返回同样的基础字段，HTTP 额外返回 `http`：

| 字段 | 含义 |
| --- | --- |
| `provider` | 保存的当前供应商。 |
| `formats` | 当前有效引擎支持的完整音频格式，以及由 WAV 转换的 `silk`。 |
| `providers[]` | 各供应商的本地配置与模型能力。 |
| `providers[].id` | `xiaomi` / `doubao` / `breeze`，以及当前已注册的 `external:*`。 |
| `providers[].configured` | 是否保存了非空密钥。 |
| `providers[].ready` | 当前保存的密钥格式、音色等是否通过本地校验。 |
| `providers[].unavailableReason` | 未就绪时的稳定错误码，例如 `api-key-not-configured`、`api-key-rejected`、`voice-required`。 |
| `providers[].selectedModel` / `selectedVoice` | 该供应商保存的模型与音色 ID。 |
| `providers[].maxTextLength` | 清理后单次文本上限；Breeze 还会取插件上限与 1000 的较小值。 |
| `providers[].models[]` | 模型能力清单，结构见下表。 |
| `http.formats` | 当前引擎完整二进制 `/synthesize` 支持的格式。内置为 MP3 / WAV，外部必需 WAV、可选 MP3。 |
| `http.exportFormats` | 当前引擎可导出的格式，包含其完整音频格式及基于 WAV 转换的 SILK。 |
| `http.downloadTtlMs` | 下载 URL 的有效期，当前为 86400000 毫秒（24 小时）。 |

每个模型对象包含：

| 字段 | 含义 |
| --- | --- |
| `id` | 模型 ID。 |
| `voices[]` | 插件内置的推荐音色，每项包含 `id`、`name`。不是上游账户的完整授权音色列表。 |
| `customVoice` | 是否支持传入自定义或复刻音色 ID。豆包复刻模型的清单为空，需使用自己的复刻 ID。 |
| `voiceDesign` | 是否支持声音描述生成。 |
| `speechInstruction` | 是否支持自然语言语音指令。 |
| `audioTags` | 是否支持正文内供应商特定的音频标签。 |
| `voiceRate` | 是否支持服务端语速参数。 |
| `streaming` | 现有 Web SSE 接口是否支持该模型的流式输出。 |
| `duplex` | 现有 WebSocket 接口是否支持持续输入文字，目前仅豆包。 |

查询不消耗合成请求，不返回密钥、上游地址或保存的声音描述与指令。`ready` 不代表已验证上游账户、额度或音色权限，也不代表浏览器自动朗读已开启。豆包、Breeze 的 UI 显示开关不限制宿主显式调用。浏览器本地语音和 MOSS 不属于这个三供应商宿主服务。

小米的 `selectedModel` 可能是用于浏览器策略的 `browser-local-fallback`；它不是独立云端模型，不列入 `models`。宿主完整合成会按现有逻辑使用 MiMo 预置模型，调用方也可显式选择清单中的模型。

### 导出音频并获取下载 URL

```http
POST /plugins/xiaomi-mimo-tts/export-audio
Authorization: Bearer <openApiToken>
Content-Type: application/json

{"text":"欢迎回来。","format":"wav"}
```

接受前述请求字段中的 `text`、`provider`、`model`、`voice`、`voiceDesignPrompt`、`speechInstruction`、`voiceRate`、`format`、`maxDurationMs`。其他字段拒绝；不接受文件路径、密钥、上游地址、`signal` 或 `splitLongText`。正文上限为 128 KiB，文本另受供应商单次限制。客户端断开会取消待处理合成。

成功返回 `201`，以下为结构示例：

```json
{
  "audioId": "<随机不透明标识>",
  "url": "audio/<随机不透明标识>",
  "expiresAt": "<ISO 8601 到期时间>",
  "size": 48044,
  "format": "wav",
  "contentType": "audio/wav",
  "durationMs": 1000
}
```

`durationMs` 可能省略；MP3 通常不提供时长。返回结果没有本地路径。**`url` 相对于导出响应 URL 解析**，不能直接拼接到站点根路径；这样可保留反向代理子路径：

```js
const response = await fetch(`${dshBaseUrl}/plugins/xiaomi-mimo-tts/export-audio`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${openApiToken}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ text: '欢迎回来。', format: 'wav' }),
})
const result = await response.json()
if (!response.ok) throw new Error(result.error)
const downloadUrl = new URL(result.url, response.url)
// 将 downloadUrl.href 交给自己的下载器或目标设备。
```

### 下载音频

```http
GET /plugins/xiaomi-mimo-tts/audio/<audioId>
```

支持 `GET` 和 `HEAD`。成功返回 `200`、相应音频 Content-Type、Content-Length 和附件文件名；`GET` 返回音频二进制。当前不提供 Range 分段下载。未知、过期或文件已删除的 URL 返回 `404`，不会按请求路径读取任意文件。

URL 最长有效 24 小时。过期后立即拒绝下载，文件由定期任务清理；插件卸载、重载或宿主重启会提前使既有 URL 失效。下载多次不会重复合成。下载 URL 是临时交付凭据，不应放进公开日志或长期存储。

### 错误

新增管理接口的错误响应为 `{ "error": "稳定错误码" }`，不暴露供应商原始错误正文。

| 状态码 | 常见错误码 |
| --- | --- |
| `400` | `invalid-request`、`invalid-json`、`unknown-request-field`、`text-required`、`invalid-provider`、`invalid-model`、`invalid-audio-format`、`invalid-duration-limit` |
| `401` | `open-api-unauthorized`：缺少或错误的 Bearer 令牌。 |
| `403` | `cross-origin-denied`：跨域浏览器请求。 |
| `404` | `audio-not-found`：下载不存在或已过期。 |
| `405` | `method-not-allowed`。 |
| `409` | `api-key-not-configured`。 |
| `413` | `request-body-too-large`、`text-too-long`、`speech-too-long`。 |
| `415` | `json-required`。 |
| `503` | `open-api-disabled`：尚未设置访问令牌。 |
| `5xx` | 合成、上游、超时或存储失败；依据 `error` 判断。 |

供应商错误码可能随能力增加而扩展。取消、发送受限、部分交付或发送结果不明时不要自动重发。

## 现有 Web 音频路由

以下是插件自身 Web 客户端使用的路由，沿用原有宿主访问策略，**不由 `openApiToken` 新增鉴权保护**。对独立程序，优先使用上面的管理接口。发布 DSH 到外网时，访问控制需覆盖整个宿主。

| 路由（同一前缀） | 能力 |
| --- | --- |
| `POST /synthesize` | 返回完整 MP3 / WAV 二进制，参数为通用合成选择字段。 |
| `POST /synthesize-stream` | SSE 流，每个音频事件的 Base64 数据位于 `choices[0].delta.audio.data`；消费端按 24 kHz、单声道 PCM16 播放。 |
| WebSocket `/synthesize-duplex` | 仅豆包；必须发送匹配宿主的 Origin。依次发送 `start`（可带 `selection`）、等待 `ready`、发送多条 `text`、发送 `finish`；二进制消息为 PCM，`done` 表示完成，`cancel` 取消。 |
| `GET /api-key-status?provider=...` | 查询供应商密钥配置状态，不返回密钥。 |
| `POST /moss/probe`、`POST /moss/synthesize` | 探测本地 MOSS 服务、合成 WAV，详见用户手册。 |

## Agent 工具

| 工具 | 行为与返回 |
| --- | --- |
| `synthesize_speech` | 生成 MP3 / WAV / SILK，返回 `{ path, format, size }`，不会自行发送到聊天，也不会生成下载 URL。 |
| `speak` | 在已接入传声筒的 QQ 回合中发送语音，其他会话按预设配置交付。返回 `{ adapter, path?, messageId?, target? }`，默认 `file` 适配器导出 WAV。 |
| `speech_mode` | `mode` 为 `manual` / `auto` / `status`，控制当前会话的通用自动语音。QQ 自动发送使用宿主的 QQ Bot 来源开关。 |

QQ 的 `speak` 只接受 `text`、可选 `provider` 与 `speechInstruction`；其他会话的工具允许更多模型、音色参数。切换供应商重试需使用另一供应商已保存的凭据，不能借导出接口绕过渠道权限。

## 宿主会话语音能力

插件通过 Cordis 的 `speechSynthesis` 服务发现会话语音能力。传声筒启用后注册 `qqbot` 适配器，格式为 `silk`。宿主预设选入 QQ 会话后，传声筒会在正常 QQ 回合上接入按需和自动交付。

```ts
import type {} from 'dsh-xiaomi-tts/host-api'

// ctx 为注入了 speechSynthesis 的 Cordis 上下文。
const delivery = ctx.speechSynthesis.conversationDelivery?.('qqbot')
const automatic = delivery?.automatic === true
```

`conversationDelivery(id)` 在组件停用、适配器不可用或未声明会话能力时返回 `undefined`。`policy.supports(agent, signal)` 检查当前 Agent 的发送前提，`policy.limits()` 读取实时字数与时长限制。实际发送仍经过 `qqbot_send_file` 的目标解析和宿主工具权限。

## 浏览器播放服务

```ts
import type { XiaomiMimoTtsService } from 'dsh-xiaomi-tts/client-api'

const tts = ctx.get('xiaomiMimoTts') as XiaomiMimoTtsService | undefined
tts?.play('欢迎回来')
// tts?.stop()
```

动态获取可选服务，插件未安装或未就绪时跳过。`play(text)` 尽力播放并立即返回，不向调用方抛错；新的播放会中断当前朗读。播放使用当前保存的供应商、模型和音色，小米音色设计模型通过完整音频合成，较长文本分段播放。播放受插件启用状态及鲸鱼娘桌宠播报来源开关控制。`stop()` 幂等停止此服务的播放。两者都不返回音频或播放结果；需要音频内容时使用宿主合成或 HTTP 导出接口。

## 外部供应商插件接管

供应商插件负责配置和调用上游，本插件负责播放、历史、下载、取消和渠道交付。

外部插件注入 `speechSynthesis`，仅在用户打开其接管开关时注册；默认关闭。`registerProvider(adapter)` 返回幂等注销函数，用 `ctx.effect()` 绑定生命周期。注册即接管，注销恢复本插件保存的内置选择；不覆盖或迁移内置配置。仅允许一个外部注册者，冲突返回 `external-provider-conflict`。已注册但未就绪时保持接管，不静默切回内置云端服务。

```ts
import type { ExternalSpeechProvider } from 'dsh-xiaomi-tts/host-api'
import { TtsProviderError } from 'dsh-xiaomi-tts/host-api'

export const inject = ['speechSynthesis']

// adapter 在外部插件中实现，并读取该插件自己的配置。
ctx.effect(() => ctx.speechSynthesis.registerProvider(adapter))
```

`ExternalSpeechProvider` 接口：

| 字段或方法 | 契约 |
| --- | --- |
| `apiVersion` | 固定 `1`。 |
| `id` | 稳定的 `external:<plugin-id>`；后缀由小写字母、数字、点、下划线和连字符组成，最长 120 字符。 |
| `getSnapshot()` | 返回 `{ name, ready, formats, maxTextLength, unavailableReason?, modelName?, voiceName? }`。名称必填；单次文本上限是正整数；支持可选 `models`、`selection`、`configurationId`、`configurations`、`managementPath`、`managementBundle`，详见下方目录契约。凭据和地址留在外部插件。 |
| `subscribe(listener)` | 配置、就绪状态或能力变化时通知监听者，返回注销函数；每次通知使主插件推进状态版本并取消旧任务。 |
| `synthesize({ text, format, signal })` | 返回 `Promise<{ data: Uint8Array, format: 'wav' \| 'mp3' }>`。每次请求固定本次配置；响应必须符合请求格式。 |
| `streamPcm?({ text, signal })` | 可选 `AsyncIterable<Uint8Array>`，仅输出 24 kHz 单声道有符号小端 PCM16，不带 WAV 头。不实现时使用完整音频分段播放。 |

`formats` 必须包含 `wav`，可额外包含 `mp3`。WAV 必须是有效的未压缩 PCM，允许有效采样率及 8/16/24/32 位采样。SILK 由本插件基于 WAV 转换，外部插件无需实现。默认合成有 MP3 则使用 MP3，否则使用 WAV；显式请求不支持的格式返回 `audio-format-unsupported`。

声明模型目录及当前选择的适配器支持本次 `model`、`voice`、`speechInstruction` 覆盖；模型和音色必须存在且匹配，指令必须符合模型能力及可选枚举。无目录的旧适配器仍拒绝这些覆盖。`voiceDesignPrompt`、`voiceRate` 始终返回 `external-option-unsupported`；音量与播放语速在播放端应用。单次覆盖不写回配置。默认 Agent 调用应省略覆盖及 `provider`；显式内置供应商保持原契约。

外部插件可抛出公开的 `TtsProviderError('external-auth-failed', undefined, 401)` 等稳定错误。外部错误只透传合法错误码及状态码，不透传错误说明、请求 ID、上游正文或任意异常内容。取消信号应传入网络请求并终止读取；主插件同时约束超时和音频大小。

### 当前有效引擎和浏览器同步

宿主新增 `engineState()`、`subscribeEngine(listener)` 和 `resolveProvider(request)`。状态字段为 `provider`、`revision`、`name`、`ready`、`formats`、`maxTextLength`、`streaming` 及可选展示名称和未就绪错误码；引擎 ID 使用公开的 `SpeechProviderId`，原内置 `TtsProvider` 配置不变。接管期间 `capabilities().engine` 提供同一状态，`provider`、`formats` 及音频结果反映实际引擎。

Web 客户端通过同源 `GET /plugins/xiaomi-mimo-tts/engine-state` 读取状态，通过 `GET /plugins/xiaomi-mimo-tts/engine-events` 订阅初始及后续状态。SSE 的每条 `data` 是完整状态 JSON。沿用宿主 Web 访问控制，无需管理令牌；跨域请求拒绝，无 CORS。独立管理客户端继续使用带令牌的 `/capabilities`。

浏览器合成请求携带 `engineRevision`。版本过期返回 `speech-engine-changed`，禁止把旧任务转交给新引擎。浏览器状态断线时停止当前播放并暂停新的默认合成；重连读取新状态，不重播旧回复。宿主 `streamPcm(request, consume)` 提供外部 PCM 消费接口；Web 路由将其包装为原有 SSE 音频结构，外部首版不扩展豆包双工协议。

注销、配置变化和主插件卸载都会取消受影响的任务。已开始播放的音频或结果不明的渠道发送不会自动重试；本地回退仍遵循本插件原有策略。

新增错误码包括 `external-provider-invalid`、`external-provider-conflict`、`external-provider-unavailable`、`external-provider-not-ready`、`external-option-unsupported`、`external-synthesis-failed`、`audio-format-unsupported`、`speech-engine-changed`。

### 外部模型目录与选择持久化

接口保持 `apiVersion: 1`，以下字段和方法为可选扩展；只提供音频的旧适配器无需修改。

```ts
interface ExternalSpeechSelection {
  model: string
  voice: string
  speechInstruction?: string
}

interface ExternalSpeechModel {
  id: string
  name: string
  voices: { id: string; name: string }[]
  streaming?: boolean
  speechInstruction?: boolean
  instructions?: { id: string; name: string }[]
  audioTags?: { value: string; name: string }[]
}

// 可选添加到 getSnapshot() 返回值
const catalog = {
  configurationId: 'senseaudio-profile',
  models: [{
    id: 'sensenova-tts-2.0', name: 'SenseNova TTS 2.0', streaming: true,
    voices: [{ id: 'female_0033_b', name: 'female_0033_b' }],
    audioTags: [{ value: '<break time=500>', name: 'Pause 500 ms' }],
  }],
  selection: { model: 'sensenova-tts-2.0', voice: 'female_0033_b' },
  managementPath: '/plugins/speech-provider-adapter',
  managementBundle: 'dsh-speech-provider-adapter',
}

// 可选添加到 ExternalSpeechProvider；成功持久化后通知 subscribe() 监听者
async function configure(selection: ExternalSpeechSelection, { signal }: { signal: AbortSignal }): Promise<void> {
  await saveInAdapter(selection, signal)
  notifySubscribers()
}
```

目录由适配器提供，本插件不直接访问上游目录。`models` 最多 200 项，每个模型音色最多 2000 项；ID、显示名最多 200 字符，不能重复。`selection` 必须指向目录中存在的模型、音色。`configurationId` 标识当前供应商配置；在 供应商适配器 切换供应商时更换该值，防止 音色工坊 把另一套配置的草稿写入当前供应商。`managementBundle` 为已安装插件的 npm 包名，音色工坊通过 DSH 内部插件导航打开其设置，不新建标签页；未声明该字段的插件仍可提供 `managementPath`。`managementPath` 只接受同源 `/plugins/` 路径，不得放入上游地址、查询参数或密钥。

音色工坊 从 `configure` 方法是否存在派生 `configurable`。有目录和配置能力时，复用原模型、音色及语音指令控件；变更先作为草稿，点击保存后调用 `configure`。适配器负责验证、持久化、更新快照并通知，失败必须抛出稳定错误。语音朗读设置页的外部模型、音色也使用保存/放弃操作，其他播放设置保持原行为。内置配置和未保存内置草稿独立保留。音色工坊 和 供应商适配器 的配置分别保存，外部保存失败不会继续提交本次其他设置；若外部保存成功后本插件设置保存失败，已保存的外部选择会保留，可重试其余设置。

`speechInstruction: true` 表示支持指令；有 `instructions` 时只接受其中的值及空字符串，例如 MiniMax 的情绪。没有枚举时允许最长 4096 字符的自由文本。`audioTags` 是精确匹配的可插入标签：通用文本清理只保留当前模型声明的标签，不套用内置供应商标签规则。代码块中的标签仍被移除，本地回退移除外部标签。实际流式能力要求同时实现 `streamPcm` 且当前模型声明支持流式。

`synthesize` / `streamPcm` 请求可以收到经验证的可选 `model`、`voice`、`speechInstruction` 单次覆盖。适配器必须在调用开始时固定配置。省略时使用 供应商适配器 保存的选择，单次请求不得写回默认值。`capabilities().providers` 返回外部模型、音色目录、当前 ID 和能力；`engineState()` / SSE 同步目录与当前选择。

宿主插件可调用 `configureProvider({ provider, engineRevision, selection, signal? })`；`engineRevision` 必须为当前版本。主插件浏览器使用同源 `POST /plugins/xiaomi-mimo-tts/engine-selection`，JSON 为 `{ provider, engineRevision, selection }`，成功返回最新引擎状态。此浏览器端点要求同源 Origin 和 JSON Content-Type，沿用宿主访问控制，不使用开放接口令牌。旧版本返回 `speech-engine-changed`，不把草稿写入另一个引擎。新的稳定错误包括 `external-selection-invalid`、`external-configuration-busy`。

完整管理页与协议适配实现见独立插件“供应商适配器”（`dsh-speech-provider-adapter`）的 `usage.md`。

### 接收开关与供应商卡片切换

宿主配置 `acceptExternalProviders` 默认 `true`，对应「播报台 → 更多 → 宿主适配 → 接收外部供应商」。保存为 `false` 后，已注册的外部适配器仍保留注册和配置，但不参与默认合成、显式外部请求、能力查询或浏览器引擎状态；正在运行的外部任务取消，恢复内置供应商。重新开启后直接使用现有注册，无需适配器重载。

多供应商适配器可在快照中添加 `configurations: { id: string; name: string }[]`，并用 `configurationId` 标识当前项。列表最多 200 项，ID 和名称最长 200 字符；浏览器只接收这两个字段，不接收凭据、地址或供应商配置。提供可选方法 `selectConfiguration(configurationId, { signal }): Promise<void>`，在适配器中保存当前供应商并通知订阅者；供应商各自的模型、音色和密钥应保持不变。Host 根据方法是否存在派生 `configurationSwitchable`。

当适配器声明至少两项且支持切换时，顶部卡片按列表顺序循环切换。切换立即保存到适配器，更新引擎版本并取消旧任务；失败保留当前显示并提示重试。旧适配器或单项列表保持只读。现有模型、音色、指令仍使用草稿与保存机制。

切换复用 `configureProvider({ provider, engineRevision, configurationId, signal? })` 与同源 `POST /plugins/xiaomi-mimo-tts/engine-selection`；JSON 为 `{ provider, engineRevision, configurationId }`，不能同时提供 `selection`。原有同源校验、过期版本拒绝、超时和取消规则保持生效。
