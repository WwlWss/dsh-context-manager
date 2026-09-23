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
 * Keep this path self-contained. M6A's generated Remote declarations import
 * the public ./types subpath, so git installs must emit matching declarations
 * as part of prepare instead of relying on a stale build tree.
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/remote/types.ts', 'src/client-contract.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: true,
  clean: false,
  // The upstream plugin's transform lowers standard decorators. Artifact
  // emission is handled by scripts/generate-typert.mjs because the upstream
  // workspace discovery contract intentionally registers only packages/*.
  plugins: [typertDecorators],
  deps: {
    neverBundle: specifier => hostPackages.has(specifier),
  },
})
