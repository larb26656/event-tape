import { httpHandler } from './http/index.js'

const definitions = [httpHandler]
const handlers = new Map(definitions.map((handler) => [handler.name, handler]))

if (handlers.size !== definitions.length) throw new Error('Duplicate handler name')

export const handlerRegistry = {
  list: () => handlers.values(),
  get: (name: string | undefined) => name === undefined ? undefined : handlers.get(name),
}
