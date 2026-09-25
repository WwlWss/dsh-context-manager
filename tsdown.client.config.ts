import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

import { transform } from 'lightningcss'
import { defineConfig, type TsdownPlugin } from 'tsdown'

const CLIENT_ID = 'dsh-context-manager'
const CSS_PREFIX = '\0dsh-context-manager-css:'
const CSS_SUFFIX = '.mjs'

function styleInjectionModule(fileId: string, css: string, classMap: Readonly<Record<string, string>>): string {
  const tagId = `${CLIENT_ID}/${basename(fileId)}`
  return [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
    "  const tag = document.createElement('style');",
    `  tag.dataset.plugin = ${JSON.stringify(CLIENT_ID)};`,
    "  tag.dataset.pluginCss = tagId;",
    "  tag.textContent = css;",
    "  document.head.appendChild(tag);",
    "}",
    `export default ${JSON.stringify(classMap)};`,
  ].join('\n')
}

const cssModulesInline: TsdownPlugin = {
  name: 'dsh-context-manager-css-modules-inline',
  resolveId(source: string, importer: string | undefined): string | null {
    if (!source.endsWith('.module.css')) return null
    const absolute = importer === undefined ? resolve(source) : resolve(dirname(importer), source)
    return CSS_PREFIX + absolute + CSS_SUFFIX
  },
  async load(id: string): Promise<string | null> {
    if (!id.startsWith(CSS_PREFIX) || !id.endsWith(CSS_SUFFIX)) return null
    const fileId = id.slice(CSS_PREFIX.length, -CSS_SUFFIX.length)
    this.addWatchFile(fileId)
    const source = await readFile(fileId)
    const { code, exports: cssExports } = transform({
      filename: fileId,
      code: source,
      cssModules: { pattern: '[hash]_[local]' },
      minify: true,
    })
    const classMap: Record<string, string> = {}
    for (const [local, value] of Object.entries(cssExports ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
      classMap[local] = value.name
    }
    return styleInjectionModule(fileId, code.toString(), classMap)
  },
}

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
  plugins: [cssModulesInline],
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
