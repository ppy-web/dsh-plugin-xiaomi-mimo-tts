import { defineConfig } from 'tsdown'
import { createClientConfig } from './tsdown.config.ts'

export function createBuildConfig(debugLogs = false) {
  return defineConfig([{
    name: debugLogs ? 'dsh-xiaomi-tts/debug' : 'dsh-xiaomi-tts',
    entry: {
      index: 'src/index.ts',
      'client-api': 'src/client-api.ts',
      'conversation-state': 'src/client/conversation-state.ts',
      'pcm-stream': 'src/pcm-stream.ts',
      'settings-compat': 'src/settings-compat.ts',
      shared: 'src/shared.ts',
    },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: true,
    define: {
      'process.env.MIMO_TTS_DEBUG': JSON.stringify(String(debugLogs)),
    },
  }, createClientConfig(debugLogs)])
}

export default createBuildConfig()
