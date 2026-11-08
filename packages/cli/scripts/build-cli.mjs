import { build } from 'tsdown'
import { fileURLToPath, URL } from 'node:url'

await build({
  entry: [fileURLToPath(new URL('../src/cli.ts', import.meta.url))],
  outDir: fileURLToPath(new URL('../dist', import.meta.url)),
  platform: 'node',
  format: 'esm',
  dts: false,
  clean: true,
})
