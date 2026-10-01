import { defineConfig } from 'tsdown'

export default defineConfig({
  tsconfig: 'tsconfig.client-model-test.json',
  entry: {
    'client-model-runtime.test': 'tests/client-model-runtime.test.ts',
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
