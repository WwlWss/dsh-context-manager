import { defineConfig } from 'tsdown'

const CLIENT_ID = 'dsh-context-manager'

export default defineConfig({
  tsconfig: 'tsconfig.client.json',
  entry: { client: 'scripts/client-entry.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: specifier => specifier === 'react',
    alwaysBundle: specifier => specifier !== 'react',
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => {`,
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
    sourcemapExcludeSources: false,
  },
})
