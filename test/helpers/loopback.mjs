import { randomInt } from 'node:crypto'
import { once } from 'node:events'

export async function listenLoopback(server) {
  for (let attempt = 0; ; attempt += 1) {
    // Port zero can select a blocked Fetch port. Some Windows ports also deny binds.
    server.listen(randomInt(49152, 65536), '127.0.0.1')
    try {
      await once(server, 'listening')
      return 'http://127.0.0.1:' + server.address().port
    } catch (error) {
      if (attempt >= 9 || !['EADDRINUSE', 'EACCES'].includes(error.code)) throw error
    }
  }
}
