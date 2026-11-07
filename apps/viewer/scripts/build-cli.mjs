import { build } from 'esbuild'
import { fileURLToPath, URL } from 'node:url'

await build({
  entryPoints: [fileURLToPath(new URL('../src/cli.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: fileURLToPath(new URL('../dist/cli.js', import.meta.url)),
})
