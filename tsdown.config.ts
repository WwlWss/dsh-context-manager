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

export default defineConfig({
  entry: ['src/index.ts', 'src/remote/types.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: true,
  clean: true,
  // The upstream plugin's transform lowers standard decorators. Artifact
  // emission is handled by scripts/generate-typert.mjs because the upstream
  // workspace discovery contract intentionally registers only packages/*.
  plugins: [typertDecorators],
  deps: {
    neverBundle: specifier => hostPackages.has(specifier),
  },
})
