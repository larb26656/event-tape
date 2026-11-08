import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'

export const DEFAULT_REDACTED_HEADERS = ['authorization', 'cookie', 'set-cookie']

export function capturedHeaders(request: IncomingMessage, blocked: Set<string> | undefined): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = Object.create(null) as Record<string, string | string[]>
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    const name = request.rawHeaders[i].toLowerCase()
    const value = blocked?.has(name) ? '[REDACTED]' : request.rawHeaders[i + 1]
    const previous = headers[name]
    if (previous === undefined) headers[name] = value
    else if (Array.isArray(previous)) previous.push(value)
    else headers[name] = [previous, value]
  }
  return headers
}

export function forwardingHeaders(message: IncomingMessage): IncomingHttpHeaders {
  const headers = { ...message.headers }
  const connection = headers.connection
  const nominated = (Array.isArray(connection) ? connection.join(',') : connection ?? '')
    .split(',').map((name) => name.trim().toLowerCase())
  for (const name of [...nominated, 'connection', 'proxy-connection', 'keep-alive',
    'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'])
    delete headers[name]
  return headers
}
