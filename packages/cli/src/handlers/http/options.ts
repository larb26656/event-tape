import { z } from 'zod'
import { MAX_CAPTURE_BYTES } from './body.js'

const integer = (min: number, max: number, fallback: number) => {
  const message = `must be an integer between ${min} and ${max}`
  return z.union([z.number(), z.string().regex(/^\d+$/, message)], { error: message })
    .transform(Number)
    .refine((value) => Number.isSafeInteger(value) && value >= min && value <= max, message)
    .default(fallback)
}

const upstream = z.string().transform((value, context) => {
  let url: URL
  try { url = new URL(value) } catch {
    context.addIssue({ code: 'custom', message: 'must be an HTTP or HTTPS URL' })
    return z.NEVER
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    context.addIssue({ code: 'custom', message: 'must be an HTTP or HTTPS origin without credentials, path, query or fragment' })
    return z.NEVER
  }
  return url
})

const schema = z.strictObject({
  mode: z.enum(['capture', 'proxy']).default('capture'),
  upstream: upstream.optional(),
  host: z.string().refine((value) => value.length > 0 && !/\s/.test(value), 'must be a non-empty listen address').default('127.0.0.1'),
  port: integer(0, 65535, 0),
  bodyLimit: integer(0, MAX_CAPTURE_BYTES, 64 * 1024),
  redact: z.boolean().default(true),
  redactHeaders: z.array(z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/)).default([])
    .transform((names) => names.map((name) => name.toLowerCase())),
  idleTimeout: integer(1, 2_147_483_647, 30_000),
}).superRefine((options, context) => {
  if (options.mode === 'proxy' && !options.upstream)
    context.addIssue({ code: 'custom', path: ['upstream'], message: 'is required in proxy mode' })
  if (options.mode === 'capture' && options.upstream)
    context.addIssue({ code: 'custom', path: ['upstream'], message: 'is only allowed in proxy mode' })
})

export type HttpOptions = z.output<typeof schema>

export function resolveOptions(preset: Record<string, unknown>, overrides: Record<string, unknown>): HttpOptions {
  const options = { ...preset }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) options[key === 'redactHeader' ? 'redactHeaders' : key] = value
  }
  const result = schema.safeParse(options)
  if (!result.success) {
    const issue = result.error.issues[0]
    if (issue.code === 'unrecognized_keys') throw new Error(`unknown HTTP option: ${issue.keys.join(', ')}`)
    throw new Error(`${issue.path.join('.') || 'HTTP options'}: ${issue.message}`)
  }
  return result.data
}
