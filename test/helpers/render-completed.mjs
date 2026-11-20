import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'

export function renderCompleted(element) {
  return new Promise((resolve, reject) => {
    const output = new PassThrough()
    let html = ''
    output.setEncoding('utf8')
    output.on('data', chunk => { html += chunk })
    output.on('end', () => resolve(html))
    output.on('error', reject)
    const stream = renderToPipeableStream(element, { onAllReady() { stream.pipe(output) }, onError: reject })
  })
}
