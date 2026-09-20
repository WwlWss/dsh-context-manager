import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'
import { defineConfig } from 'tsdown'

const typert = typertPlugin({ mode: 'package', faces: ['host'] })
const typertDecorators = {
  name: 'dsh-context-manager-typert-decorators',
  transform: typert.transform,
}

const hostPackages = new Set([
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-scope',
  '@deepseek-ai/dsh-skill',
  '@deepseek-ai/dsh-typert-protocol',
  '@deepseek-ai/schemastery',
  'zod',
])

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
  // The upstream plugin's transform lowers standard decorators. Artifact
  // emission is handled by scripts/generate-typert.mjs because the upstream
  // workspace discovery contract intentionally registers only packages/*.
  plugins: [typertDecorators],
  deps: {
    neverBundle: specifier => hostPackages.has(specifier),
  },
})
