import { httpInput } from './http/index.js'
import { fileInput } from './file/index.js'
import type { InputDefinition } from './input.js'

const definitions: InputDefinition<unknown>[] = [httpInput, fileInput]
const inputs = new Map(definitions.map((input) => [input.name, input]))

if (inputs.size !== definitions.length) throw new Error('Duplicate input name')

export const inputRegistry = {
  list: () => inputs.values(),
  get: (name: string | undefined) => name === undefined ? undefined : inputs.get(name),
}
