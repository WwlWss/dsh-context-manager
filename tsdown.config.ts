import { defineConfig } from 'tsdown'

const hostPackages = new Set([
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/schemastery',
])

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: true,
  clean: true,
  deps: {
    neverBundle: specifier => hostPackages.has(specifier),
  },
})
