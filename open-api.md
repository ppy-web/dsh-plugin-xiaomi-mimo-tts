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
| `currentProvider()` | 返回宿主保存的当前供应商。 |
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
| `provider` | 可选 `xiaomi` / `doubao` / `breeze`，省略时使用保存的供应商。 |
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
| `formats` | 宿主合成及文件导出支持的格式：`mp3`、`wav`、`silk`。 |
| `providers[]` | 各供应商的本地配置与模型能力。 |
| `providers[].id` | `xiaomi` / `doubao` / `breeze`。 |
| `providers[].configured` | 是否保存了非空密钥。 |
| `providers[].ready` | 当前保存的密钥格式、音色等是否通过本地校验。 |
| `providers[].unavailableReason` | 未就绪时的稳定错误码，例如 `api-key-not-configured`、`api-key-rejected`、`voice-required`。 |
| `providers[].selectedModel` / `selectedVoice` | 该供应商保存的模型与音色 ID。 |
| `providers[].maxTextLength` | 清理后单次文本上限；Breeze 还会取插件上限与 1000 的较小值。 |
| `providers[].models[]` | 模型能力清单，结构见下表。 |
| `http.formats` | 完整二进制 `/synthesize` 路由支持的格式：MP3 / WAV。 |
| `http.exportFormats` | `/export-audio` 支持的格式：MP3 / WAV / SILK。 |
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
| `speak` | 按预设配置的适配器合成并交付，返回 `{ adapter, path?, messageId?, target? }`。默认 `file` 适配器导出 WAV；不是浏览器播放指令。成功后不要重复发送。 |
| `speech_mode` | `mode` 为 `manual` / `auto` / `status`，只控制当前会话自动语音，不改浏览器自动朗读设置。QQ 预设不注册此工具，使用宿主 QQ 来源开关。 |

QQ 的 `speak` 只接受 `text`、可选 `provider` 与 `speechInstruction`；其他会话的工具允许更多模型、音色参数。切换供应商重试需使用另一供应商已保存的凭据，不能借导出接口绕过渠道权限。

## 浏览器播放服务

```ts
import type { XiaomiMimoTtsService } from 'dsh-xiaomi-tts/client-api'

const tts = ctx.get('xiaomiMimoTts') as XiaomiMimoTtsService | undefined
tts?.play('欢迎回来')
// tts?.stop()
```

动态获取可选服务，插件未安装或未就绪时跳过。`play(text)` 尽力播放并立即返回，不向调用方抛错；新的播放会中断当前朗读。播放受插件启用状态及鲸鱼娘桌宠播报来源开关控制。`stop()` 幂等停止此服务的播放。两者都不返回音频或播放结果；需要音频内容时使用宿主合成或 HTTP 导出接口。
