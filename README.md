![dsh-xiaomi-tts](assets/social.webp)

<h1 align="center">音色工坊 · dsh-xiaomi-tts</h1>

<p align="center">
  <a href="https://awesome-dsh-plugin.com"><img src="https://awesome-dsh-plugin.com/badge.svg" alt="awesome · DSH plugin"></a>
  <a href="https://www.npmjs.com/package/dsh-xiaomi-tts"><img src="https://img.shields.io/npm/v/dsh-xiaomi-tts.svg" alt="npm version"></a>
  <img src="https://img.shields.io/badge/Xiaomi-MiMo-ff6900?logo=xiaomi&amp;logoColor=white" alt="Xiaomi MiMo">
  <img src="https://img.shields.io/badge/Doubao-Seed_TTS-3B73FF" alt="Doubao Seed TTS">
  <img src="https://img.shields.io/badge/Breeze-Blue_TTS-10B5A0" alt="Breeze Blue TTS">
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&amp;logo=deepseek&amp;logoColor=white" alt="deepseek-harness"></a>
</p>

> 小米MIMO、豆包语音、BreezeBlue、浏览器语音 - 音色随心配，支持连接10＋供应商或本地语音模型，文本过滤、实时流式朗读、音频下载、音效、桌宠联动及 QQ Bot、AI Passport 联动

## 🎨 [在线预览](https://ppy-web.github.io/dsh-plugin-xiaomi-mimo-tts)

<p align="center">
  <a href="https://ppy-web.github.io/dsh-plugin-xiaomi-mimo-tts"><img src="assets/preview-button-zh.svg" alt="在线预览插件效果" width="300" height="64"></a>
</p>

> QQ 群 交流·建议：
>
> ```text
> 1104616387
> ```

## ✨ 功能

- 一键朗读、自动播报；
- 自动过滤网址、代码等内容，减少资源消耗，体验更好；
- 内置 小米 MiMo `免费`、豆包语音、BreezeBlue、DeepSeek。自由选择和定义音色；
- 支持 浏览器、MOSS本地模型兜底。还能通过外部适配器接入供应商...
- 可选 UI 音效、宿主事件播报；
- 语速、音量、朗读范围调节，音频历史试听和下载；
- 支持多种插件联动，dsh-pet桌宠、 QQ Bot、AI Passport...

## 🚀 安装与使用

需要 DSH `0.2.2` 以上、Node.js 24.9+，当前适配目标为 DSH `0.2.2-rc.5`。

- 直接在 DSH 插件管理面板搜索 `dsh-xiaomi-tts` 安装；

- 安装[插件市场](https://awesome-dsh-plugin.com)后搜索 `xiaomi-mimo-tts`。

-  Web 端可使用命令：

    ```bash
    dsh plugin --profile web add dsh-xiaomi-tts@latest
    ```

- 卸载：

  ```bash
  dsh plugin --profile web remove dsh-xiaomi-tts
  ```

快速设置：

1. 侧边栏插件-已安装插件-音色工坊-进入设置页，默认使用[小米 MiMo](https://platform.xiaomimimo.com?ref=GQDDDU)，可在右上角卡片切换[豆包 Key](https://console.volcengine.com/speech/new/setting/apikeys?projectName=default)、 [Breeze Key](https://breezeblue.ai/zh?code=JHKLSJ)或DeepSeek（在播报台开启）
2. 在“调音台”选择模型、音色，在“播报台”试听；服务商的密钥、音色与模型自独立保存，先保存，后试听。
3. 稳定使用 Breeze 需要科学上网，推荐 [✈️𝘾𝙤𝙠𝙚𝘾𝙡𝙤𝙪𝙙](https://vip.ih004.com/#/register?code=UHKslrCy)

## 📖 用户手册

配置要点与详细使用说明见[用户手册](https://ppy-web.github.io/dsh-plugin-xiaomi-mimo-tts/#manual)。

## 🔌 插件联动

本插件向外部提供查询和调用接口，完整接入方式见[开放能力接口文档](open-api.md)。

- **浏览器插件**：通过 `ctx.xiaomiMimoTts.play(text)` 在当前页面播放，使用 `stop()` 停止。
- **宿主插件**：注入 `speechSynthesis`，通过 `ctx.speechSynthesis` 查询能力、合成或导出音频，也可注册交付渠道或外部语音供应商。
- **DSH Agent**：挂载 `dsh-xiaomi-tts/speech-agent`，使用 `speak`、`synthesize_speech` 和 `speech_mode` 工具。
- **外部程序或设备**：配置 `openApiToken` 后，通过 HTTP 查询能力、导出音频并使用限时 URL 下载。

- [dsh-whale-musume · 元气鲸鱼娘桌宠](https://github.com/Sutera-Diffusus/dsh-whale-musume#readme) 支持互动气泡播报 `已联动`
- [dsh-pet · 蓝色大肥鱼桌宠](https://github.com/PC2005-cloud/dsh-pet#readme) 支持播报碎碎念，闲聊消息 `已联动`
- [dsh-qqbot · 腾讯官方QQ机器人](https://github.com/tencent-connect/dsh-qqbot#readme) 支持向 QQ 推送语音和表情包 `已联动`
- [dsh-novel · 小说阅读与听书](https://github.com/xrn1997/dsh-novel#readme) 使用本插件朗读里面的小说 `已联动`
- [dsh-music-panel · 音乐播放器](https://github.com/Aliboder/dsh-music-panel) 播报时可以自动降低播放器的音量 `已适配`
- [dsh-Go · dsh 移动端移植](https://github.com/ccch1mneyyy/dsh-Go) 在移动端也可使用本插件 `已适配`
- [dsh-audio-reactive · 音频响应](https://github.com/ppy-web/dsh-audio-reactive) 随流式播报显示跳动的频谱背景 `已适配`
- [dsh-speech-provider-adapter · 供应商适配器](https://github.com/ppy-web/dsh-speech-provider-adapter#readme) 接入你想要的语音供应商  `已适配`
- [WhaleTalk Passport · 鲸语通行证](https://github.com/ppy-web/whaletalk-passport#readme) AI Passport 硬件连接，和你的鲸鱼娘实时语音对话

一个简单的调用示例：

```ts
import type { XiaomiMimoTtsService } from 'dsh-xiaomi-tts/client-api'

const tts = ctx.get('xiaomiMimoTts') as XiaomiMimoTtsService | undefined
tts?.play('欢迎回来')
// tts?.stop()
```

## 🔒 隐私

- API Key 由 DSH Host 保存，浏览器只读取配置状态；三家服务商均由 Host 代理，文本和音色 ID 仅提交给所选服务商，费用按服务商政策计算。
- 本地语音使用 Web Speech API，音色与离线能力取决于浏览器和系统；在线音色可能向其语音服务发送文本。
- 云端音频存于浏览器 IndexedDB，最多 100 条 / 100 MB，可试听、下载；流式 PCM 保存为 24 kHz 单声道 WAV，本地语音无法导出。

## 🛠️ 开发

```bash
pnpm install --frozen-lockfile
pnpm dev          # 设置预览
pnpm build        # 构建插件
pnpm typecheck
pnpm test
pnpm dev:build    # 构建预览
pnpm pack:check   # 检查打包内容
```

<a href="https://www.star-history.com/?repos=ppy-web%2Fdsh-plugin-xiaomi-mimo-tts&type=timeline&logscale=&legend=bottom-right">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=ppy-web/dsh-plugin-xiaomi-mimo-tts&type=timeline&theme=dark&legend=bottom-right" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=ppy-web/dsh-plugin-xiaomi-mimo-tts&type=timeline&legend=bottom-right" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=ppy-web/dsh-plugin-xiaomi-mimo-tts&type=timeline&legend=bottom-right" />
 </picture>
</a>
