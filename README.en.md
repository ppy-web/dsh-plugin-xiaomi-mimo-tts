# dsh-xiaomi-tts

[中文说明](README.md)

Xiaomi MiMo text-to-speech controls for finalized assistant messages in DeepSeek Harness Web.

## Screenshots

![Xiaomi MiMo settings menu](assets/menu.png)

![Read aloud button](assets/play.png)

![Pause button](assets/pause.png)

## Features

- Adds an optional read-aloud button to the assistant message action strip; it is disabled by default.
- Uses Xiaomi MiMo's official `mimo-v2.5-tts` Chat Completions-compatible API.
- Configures whether to show the read-aloud button, the API key, autoplay, built-in voice, MP3/WAV format, and reading instruction under **Settings → Plugins → Plugin configuration**.
- Keeps the API key on the DSH Host. The browser sends only the response text to a same-origin plugin route.
- Supports pause, resume, regeneration, request errors, and browser autoplay rejection.
- The settings card is collapsed by default and expands on click.

Official Xiaomi MiMo TTS reference: <https://mimo.mi.com/static/docs/api/audio/tts.md>

## Install

```bash
dsh plugin --profile web add dsh-xiaomi-tts
```

Restart `dsh web`, then open **Settings → Plugins → Plugin configuration** and save a Xiaomi MiMo API key.

Enable **Show read-aloud button** in the plugin settings before using message actions. It is off by default; when disabled, the button is hidden and autoplay is not triggered.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm pack:check
```

The response text is sent to Xiaomi MiMo when speech is generated. Review Xiaomi's privacy and data-handling terms before using the plugin with sensitive content.

## License

MIT
