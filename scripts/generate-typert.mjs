import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspace = resolve(root, '.typert-build')
const packageRoot = resolve(workspace, 'packages/context-manager')
const packageSrc = resolve(packageRoot, 'src')
const out = resolve(root, 'lib')

const packageManifest = {
  name: 'dsh-context-manager',
  version: '0.0.0-typert-build',
  private: true,
  type: 'module',
  main: './lib/index.js',
  types: './lib/index.d.ts',
  exports: {
    '.': {
      types: './lib/index.d.ts',
      default: './lib/index.js',
    },
    './typert': {
      types: './lib/typert.host.d.ts',
      default: './lib/typert.host.js',
    },
    './remote': {
      types: './lib/typert.remote-client.d.ts',
      default: './lib/typert.remote-client.js',
    },
  },
  files: [
    'lib/typert.host.js',
    'lib/typert.host.d.ts',
    'lib/typert.remote-client.js',
    'lib/typert.remote-client.d.ts',
  ],
}

const aggregate = {
  files: [],
  references: [{ path: './packages/context-manager' }],
}

const project = {
  compilerOptions: {
    target: 'ES2024',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    baseUrl: '.',
  },
  include: ['src'],
}

const protocolShim = `declare module '@deepseek-ai/dsh-typert-protocol' {
  import { Service, type Context } from '@deepseek-ai/cordis'

  export interface TypertGatewayBindingOptions {
    readonly namespace?: string
  }

  export class TypertRemoteService extends Service {
    readonly typertRemote: {
      readonly service: object
      readonly serviceKey: string
      readonly namespace: string
    }

    constructor(ctx: Context, serviceKey: string, options?: TypertGatewayBindingOptions)
  }

  export function Remote(exportName?: string): MethodDecorator
}
`

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * 0.1.1-0.1.5 strict codecs carry `schema`; 0.1.6-alpha.1+ carries
 * `create`. A descriptor object may safely carry both properties, so publish
 * one dual-shape artifact rather than branching the package by Host version.
 */
function dualShapeStrictCodecs(source) {
  let patched = 0
  const result = source.replace(
    /^(\s*)schema: ([A-Za-z_$][\w$]*),$/gmu,
    (_match, indent, schema) => {
      patched += 1
      return `${indent}schema: ${schema},\n${indent}create: () => ${schema},`
    },
  )
  if (patched === 0) {
    throw new Error('Typert compatibility projection found no strict schema codecs to augment')
  }
  return result
}

rmSync(workspace, { recursive: true, force: true })
try {
  mkdirSync(packageSrc, { recursive: true })
  writeFileSync(resolve(workspace, 'tsconfig.host.json'), json(aggregate))
  writeFileSync(resolve(packageRoot, 'package.json'), json(packageManifest))
  writeFileSync(resolve(packageRoot, 'tsconfig.json'), json(project))
  writeFileSync(resolve(packageSrc, 'index.ts'), "export * from './protocol-controller.js'\n")
  writeFileSync(resolve(packageSrc, 'typert-protocol-shim.d.ts'), protocolShim)
  cpSync(
    resolve(root, 'src/remote/protocol-controller.ts'),
    resolve(packageSrc, 'protocol-controller.ts'),
  )

  const generated = new WorkspaceTypertGenerator(workspace, {
    checkDiagnostics: false,
  }).generate(['dsh-context-manager'], ['host'])

  if (generated.length !== 1 || generated[0].face !== 'host' || generated[0].remote === undefined) {
    throw new Error('Typert generator did not produce exactly one Host artifact with Remote descriptors')
  }

  mkdirSync(out, { recursive: true })
  writeFileSync(resolve(out, 'typert.host.js'), dualShapeStrictCodecs(generated[0].js))
  writeFileSync(resolve(out, 'typert.host.d.ts'), generated[0].dts)
  writeFileSync(resolve(out, 'typert.remote-client.js'), dualShapeStrictCodecs(generated[0].remote.js))
  writeFileSync(resolve(out, 'typert.remote-client.d.ts'), generated[0].remote.dts)
  writeFileSync(resolve(out, 'typert.remote-client.d.ts.map'), generated[0].remote.dtsMap)

  const remote = readFileSync(resolve(out, 'typert.remote-client.js'), 'utf8')
  if (!remote.includes("namespace: 'contextManager'")
    || !remote.includes("method: 'protocol'")
    || !remote.includes('schema:')
    || !remote.includes('create:')) {
    throw new Error('generated Remote artifact is missing the M6A strict dual-shape contract')
  }
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
