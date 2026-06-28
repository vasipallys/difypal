import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    main: 'electron/main/index.ts',
    preload: 'electron/preload/index.ts',
  },
  format: ['cjs'],
  outDir: 'dist-electron',
  clean: true,
  sourcemap: true,
  target: 'node22',
  platform: 'node',
  external: ['electron'],
})
