#!/usr/bin/env node
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const command = args[0] === 'view' ? args[1] : args[0]
const recording = command ? resolve(command) : undefined
const browserRequested = args.includes('--no-browser') === false
const assets = resolve(fileURLToPath(new URL('.', import.meta.url)))
if (!recording) throw new Error('Usage: event-tape view <recording.jsonl>')
await stat(recording)
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    if (pathname === '/recording-metadata.json' && request.method === 'GET') {
      response.setHeader('content-type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ name: basename(recording) }))
      return
    }
    if (pathname === '/recording.jsonl') {
      response.setHeader('content-type', 'application/x-ndjson; charset=utf-8')
      response.end(await readFile(recording))
      return
    }
    const assetPath = pathname === '/' ? 'index.html' : pathname.slice(1)
    const fullPath = resolve(assets, assetPath)
    if (!fullPath.startsWith(`${assets}/`)) {
      response.writeHead(404).end()
      return
    }
    response.setHeader(
      'content-type',
      mime[extname(fullPath)] ?? 'application/octet-stream',
    )
    response.end(await readFile(fullPath))
  } catch {
    response.writeHead(404).end('Not found')
  }
})
server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  if (address && typeof address !== 'string') {
    const url = `http://127.0.0.1:${address.port}`
    console.log(`Event Tape Viewer: ${url}`)
    if (browserRequested) {
      const opener =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'cmd'
            : 'xdg-open'
      const openerArgs =
        process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
      void import('node:child_process').then(({ execFile }) =>
        execFile(opener, openerArgs),
      )
    }
  }
})
