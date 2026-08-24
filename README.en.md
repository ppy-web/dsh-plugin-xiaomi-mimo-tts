# dsh-xiaomi-tts

<p><a href="README.md"><strong>中文说明 →</strong></a></p>

Xiaomi MiMo text-to-speech controls for finalized assistant messages in DeepSeek Harness Web.

## Preview

![Xiaomi MiMo settings menu](assets/menu.png)

![Preset](assets/preset.png)

![Button](assets/image.png)

## Features

- Adds an optional read-aloud button to the assistant message action strip; it is enabled by default.
- Uses Xiaomi MiMo's official `mimo-v2.5-tts` and `mimo-v2.5-tts-voicedesign` Chat Completions-compatible APIs; preset-voice autoplay uses streaming PCM16, while manual playback uses MP3 or WAV.
- Switches between preset voices and custom voice design, and configures the API key, autoplay, built-in voice, voice description, and MP3/WAV format under **Settings → Plugins → Plugin configuration**. The voice-design selector defaults to **Custom**; custom text can be edited and saved, then restored after switching to another template.
- Keeps the API key on the DSH Host. The browser sends only the response text to a same-origin plugin route.
- Supports pause, resume, regeneration, request errors, and browser autoplay rejection. Automatic playback only applies to the latest reply completed by the live run; opening messages from history does not play them.
- Cleans speech text before sending it to TTS: URLs, file paths, code blocks, emoji, icons, and control characters are removed, and common Chinese punctuation is converted to ASCII punctuation.

Official Xiaomi MiMo TTS reference: <https://mimo.mi.com/static/docs/api/audio/tts.md>

## Install

```bash
dsh plugin --profile web add dsh-xiaomi-tts
```

Restart `dsh web`, then open **Settings → Plugins → Plugin configuration** and save a Xiaomi MiMo API key.

When updating or switching from the local development link to the npm package, stop DSH Web before changing the profile dependencies. This prevents a running Node process from holding the Windows Junction that pnpm needs to replace:

```powershell
.\start\dsh-plugin-reinstall.bat 2.2.0
```

The script stops DSH Web, removes the plugin from the `web` profile, installs the requested npm version, and starts DSH Web again. If you run the steps manually, keep the same order:

```powershell
.\start\dsh-web-stop.bat
dsh plugin --profile web remove dsh-xiaomi-tts
dsh plugin --profile web add dsh-xiaomi-tts@2.2.0
.\start\dsh-web-start.bat
```

When `mimo-v2.5-tts-voicedesign` is selected, the plugin omits `audio.voice`, sends only the custom voice description as the upstream `user` message, and sends the reply text as the `assistant` message. No preset-voice or general read-aloud style prompt is added. Describe the voice itself in one or two sentences, including age/gender, texture, pace, and emotional baseline; avoid scenes or actions.

The settings card also provides common voice-description templates from the reference page; every template remains editable after selection.

Preset voices also receive `presetStylePrompt` as a style instruction. It is sent only with `mimo-v2.5-tts` and does not affect Voice Design. The default favors clear, natural Mandarin, a subtle Hunan inflection, and a cool, restrained delivery.

The settings include the API key, read-aloud button, automatic read-aloud, model, voice, custom voice description, and audio format. Both switches are enabled by default; disabling the read-aloud button also disables automatic read-aloud, while enabling automatic read-aloud enables the button.

Browsers may block autoplay. If that happens, click the read-aloud button below a response.

### Speech text preprocessing

Read-aloud uses cleaned text and does not modify the assistant reply shown in the chat. Markdown links keep their readable labels while their targets are removed; URLs, file paths, complete code blocks, emoji, icons, zero-width characters, and control characters are not sent to Xiaomi MiMo. Parentheses, brackets, book-title marks, quotation marks, and other non-boundary punctuation are removed; retained boundary punctuation is converted to ASCII. Streaming playback accumulates at least 20 spoken characters, then sends any remaining shorter text when the reply ends.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm pack:check
```

## Privacy

- The API key stays on the DSH Host and is never sent to the browser.
- Response text is sent to Xiaomi MiMo when speech is generated.
- Audio is played through a temporary Blob URL and is not persisted to disk.

## License

MIT
