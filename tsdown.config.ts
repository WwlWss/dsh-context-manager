import { defineConfig } from 'tsdown'

const hostPackages = new Set([
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-scope',
  '@deepseek-ai/dsh-skill',
  '@deepseek-ai/schemastery',
  'zod',
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
