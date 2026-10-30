import { defineConfig } from 'tsdown'

export default defineConfig({
  tsconfig: 'tsconfig.client-model-test.json',
  entry: {
    'client-model-runtime.test': 'tests/client-model-runtime.test.ts',
    'client-business-face.test': 'tests/client-business-face.test.ts',
    'client-profile-editor.test': 'tests/client-profile-editor.test.ts',
    'client-resource-mutation.test': 'tests/client-resource-mutation.test.ts',
    'client-resource-editor.test': 'tests/client-resource-editor.test.ts',
    'client-prompt-binding-editor.test': 'tests/client-prompt-binding-editor.test.ts',
    'client-skill-policy-editor.test': 'tests/client-skill-policy-editor.test.ts',
  },
  outDir: '.artifacts/client-model-tests',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  dts: false,
  sourcemap: false,
  clean: true,
  deps: {
    alwaysBundle: () => true,
  },
})
