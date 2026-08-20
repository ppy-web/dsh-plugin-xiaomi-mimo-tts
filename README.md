# dsh-plugin-xiaomi-mimo-tts

[简体中文](README.zh-CN.md)

Xiaomi MiMo text-to-speech controls for finalized assistant messages in DeepSeek Harness Web.

## Features

- Adds a read-aloud button to the assistant message action strip.
- Uses Xiaomi MiMo's official `mimo-v2.5-tts` Chat Completions-compatible API.
- Configures the API key, autoplay, built-in voice, MP3/WAV format, and reading instruction under **Settings → Plugins → Plugin configuration**.
- Keeps the API key on the DSH Host. The browser sends only the response text to a same-origin plugin route.
- Supports pause, resume, regeneration, request errors, and browser autoplay rejection.

Official Xiaomi MiMo TTS reference: <https://mimo.mi.com/static/docs/api/audio/tts.md>

## Install

Local checkout:

```bash
dsh plugin --profile web add ./dsh-plugin-xiaomi-mimo-tts
```

GitHub:

```bash
dsh plugin --profile web add github:ppy-web/dsh-plugin-xiaomi-mimo-tts
```

npm:

```bash
dsh plugin --profile web add dsh-plugin-xiaomi-mimo-tts
```

Restart `dsh web`, then open **Settings → Plugins → Plugin configuration** and save a Xiaomi MiMo API key.

Git installs run `prepare`. If pnpm blocks dependency builds, add the exact package key printed by DSH to the profile's `pnpm-workspace.yaml` `allowBuilds`, then reinstall.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm pack:check
```

If you rename the npm package, also update `cordis.patch.yml` and `PACKAGE_ID` in `tsdown.config.ts`.

The response text is sent to Xiaomi MiMo when speech is generated. Review Xiaomi's privacy and data-handling terms before using the plugin with sensitive content.

## License

MIT
