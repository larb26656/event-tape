import { resolve } from 'node:path'
import { z } from 'zod'

const schema = z.strictObject({
  paths: z.array(z.string().min(1)).min(1),
  fromStart: z.boolean().default(false),
})
export type FileOptions = z.output<typeof schema>

export function resolveOptions(preset: Record<string, unknown>, overrides: Record<string, unknown>): FileOptions {
  const options = { ...preset }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) options[key === 'path' ? 'paths' : key] = value
  }
  const result = schema.safeParse(options)
  if (!result.success) {
    const issue = result.error.issues[0]!
    if (issue.code === 'unrecognized_keys') throw new Error(`unknown file option: ${issue.keys.join(', ')}`)
    throw new Error(`${issue.path.join('.') || 'file options'}: ${issue.message}`)
  }
  return { ...result.data, paths: result.data.paths.map((path) => resolve(path)) }
}

