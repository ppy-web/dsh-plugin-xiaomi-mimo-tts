import assert from 'node:assert/strict'
import { once } from 'node:events'
import WebSocket, { WebSocketServer } from 'ws'

export async function withDeepseekServer(run, { terminal = 'success', pcm = Buffer.alloc(4800, 1), verifyClient } = {}) {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1', ...(verifyClient ? { verifyClient } : {}) })
  await once(server, 'listening')
  const sessions = []
  server.on('connection', (socket, request) => {
    const session = { url: request.url, commands: [], authorization: request.headers.authorization }
    sessions.push(session)
    socket.on('message', payload => {
      const command = JSON.parse(payload.toString())
      session.commands.push(command)
      if (command.event === 'text') {
        // Split one sample across actual upstream messages.
        socket.send(pcm.subarray(0, 1))
        if (pcm.length > 1) socket.send(pcm.subarray(1))
      }
      if (command.event === 'finish_text') {
        if (terminal === 'close') socket.close()
        else if (terminal !== null) socket.send(JSON.stringify({ event: 'finish', code: terminal, message: 'upstream echoed test-private-deepseek' }))
      }
    })
  })
  const connect = (headers, endpoint) => {
    const upstream = new URL(endpoint)
    assert.equal(upstream.protocol, 'wss:')
    assert.equal(upstream.host, 'api.deepseek.com')
    assert.equal(upstream.pathname, '/v1/tools/tts')
    return new WebSocket(`ws://127.0.0.1:${server.address().port}${upstream.pathname}${upstream.search}`, { headers })
  }
  try { await run({ connect, sessions }) } finally {
    for (const socket of server.clients) socket.terminate()
    await new Promise(resolve => server.close(resolve))
  }
}
