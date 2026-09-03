import { defineConfig } from 'tsdown'
import clientConfig from './tsdown.config.ts'

export default defineConfig([{
  name: 'dsh-xiaomi-tts',
  entry: {
    index: 'src/index.ts',
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
}, clientConfig])
