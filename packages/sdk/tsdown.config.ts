import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: { tsc: { eager: true } },
  exports: true,
  clean: true,
  deps: {
    alwaysBundle: ['@event-tape/recording-format'],
    dts: { alwaysBundle: ['@event-tape/recording-format'] },
  },
})
