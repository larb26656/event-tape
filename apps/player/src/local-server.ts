import { createServer, type Server } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

export async function serveRecording(recordingPath: string): Promise<Server> {
  const recording = resolve(recordingPath)
  await stat(recording)
  const assets = resolve(fileURLToPath(new URL('.', import.meta.url)))
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
      if (pathname === '/recording-metadata.json' && request.method === 'GET') {
        response.setHeader('content-type', 'application/json; charset=utf-8')
        response.end(JSON.stringify({ name: basename(recording) }))
        return
      }
      if (pathname === '/recording.jsonl' && request.method === 'GET') {
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
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  return server
}
