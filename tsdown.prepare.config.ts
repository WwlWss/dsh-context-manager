import { defineConfig } from 'tsdown'

/**
 * Consumer-side build for git installs.
 *
 * Keep this path self-contained and runtime-only: type checking and declaration
 * generation belong to development/CI, while `prepare` only has to make the
 * package loadable from its declared `main` entry.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  external: ['@deepseek-ai/cordis'],
})
