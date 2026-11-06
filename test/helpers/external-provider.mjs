// Minimal in-memory audio for host contract tests; no plugin registration or upstream calls.
export function createTestWav() {
  const data = Buffer.alloc(44 + 24000)
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(24000, 24); data.writeUInt32LE(48000, 28)
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34)
  data.write('data', 36); data.writeUInt32LE(data.length - 44, 40)
  return data
}

export function createTestProvider({ streaming = false } = {}) {
  return {
    apiVersion: 1,
    id: 'external:test-provider',
    getSnapshot: () => ({ name: 'Test provider', ready: true, formats: ['wav'], maxTextLength: 1000 }),
    subscribe: () => () => {},
    async synthesize({ format, signal }) {
      signal.throwIfAborted()
      if (format !== 'wav') throw new Error('Unsupported test format')
      return { format: 'wav', data: createTestWav() }
    },
    ...(streaming ? { async *streamPcm({ signal }) {
      for (let i = 0; i < 10; i++) {
        signal.throwIfAborted()
        yield Buffer.alloc(2400)
      }
    } } : {}),
  }
}
