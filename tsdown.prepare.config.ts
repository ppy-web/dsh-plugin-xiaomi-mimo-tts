import { defineConfig } from 'tsdown'
import clientConfig from './tsdown.config.ts'

export default defineConfig([{
  name: 'dsh-plugin-xiaomi-mimo-tts',
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
}, clientConfig])
