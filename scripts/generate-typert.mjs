import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

/**
 * Preserve the oldest 0.1.1 strict-codec ABI while adding the 0.1.6 factory ABI.
 *
 * Retained pre-0.1.6 Registry/Gateway builds consume `codec.schema`; 0.1.6-alpha.2
 * consumes `codec.create()`. Both generations accept the extra field, so one
 * oldest-generated artifact can carry both without runtime version branching.
 */
function addTypertFactoryCompatibility(source, label) {
  let strictCodecs = 0
  const withCodecFactories = source.replace(
    /(^[ \t]*typeSymbol: [^\n]+,\n)([ \t]*)schema: ([A-Za-z_$][\w$]*),$/gmu,
    (_match, typeSymbolLine, indent, schema) => {
      strictCodecs += 1
      return typeSymbolLine + indent + 'schema: ' + schema + ',\n' + indent + 'create: () => ' + schema + ','
    },
  )
  if (strictCodecs === 0) {
    throw new Error('M6A ' + label + ' Typert artifact contains no legacy strict codec to project')
  }

  // Old Host contributions also store exported schemas as eager instances. The
  // current Registry expects factories; retain both shapes for the same reason.
  return withCodecFactories.replace(
    /^([ \t]*)\{ name: ([^,\n]+), schema: ([A-Za-z_$][\w$]*) \},$/gmu,
    (_match, indent, name, schema) =>
      indent + '{ name: ' + name + ', schema: ' + schema + ', create: () => ' + schema + ' },',
  )
}
const root = fileURLToPath(new URL('../', import.meta.url))
const out = join(root, 'lib')
const temporary = await mkdtemp(join(root, '.typert-workspace-'))

try {
  const packageRoot = join(temporary, 'packages', 'dsh-context-manager')
  const protocolRoot = join(temporary, 'packages', 'dsh-typert-protocol')
  await mkdir(join(packageRoot, 'src', 'service'), { recursive: true })
  await mkdir(join(packageRoot, 'src', 'remote'), { recursive: true })
  await mkdir(protocolRoot, { recursive: true })

  // The oldest Typert analyzer verifies Remote/RemoteService identity against a
  // workspace registration for the protocol package. Mirror the exact installed
  // public declarations into the temporary workspace so symbol identity follows
  // the same path as it does inside the DSH monorepo.
  const installedProtocolRoot = dirname(
    fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-typert-protocol/package.json')),
  )
  await cp(
    join(installedProtocolRoot, 'lib', 'types'),
    join(protocolRoot, 'lib', 'types'),
    { recursive: true },
  )

  // Generate from the exact production Remote source rather than maintaining a
  // second contract declaration. The temporary package contains no other
  // Context Manager services, so opting into Typert cannot accidentally widen
  // M2-M5 Host APIs into reflection surface.
  await cp(
    join(root, 'src', 'service', 'remote.ts'),
    join(packageRoot, 'src', 'service', 'remote.ts'),
  )
  await cp(
    join(root, 'src', 'remote', 'types.ts'),
    join(packageRoot, 'src', 'remote', 'types.ts'),
  )

  await writeFile(join(temporary, 'tsconfig.host.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2024',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noEmit: true,
      verbatimModuleSyntax: true,
      skipLibCheck: true,
      baseUrl: '.',
      paths: {
        '@deepseek-ai/dsh-typert-protocol': [
          './packages/dsh-typert-protocol/lib/types/index.d.ts',
        ],
        '@deepseek-ai/dsh-typert-protocol/*': [
          './packages/dsh-typert-protocol/lib/types/*',
        ],
      },
    },
    files: [],
    references: [
      { path: './packages/dsh-context-manager' },
      { path: './packages/dsh-typert-protocol' },
    ],
  }, null, 2) + '\n')

  await writeFile(join(packageRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2024',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noEmit: true,
      verbatimModuleSyntax: true,
      skipLibCheck: true,
    },
    include: ['src/**/*.ts'],
  }, null, 2) + '\n')

  await writeFile(join(protocolRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2024',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ['lib/types/**/*.d.ts'],
  }, null, 2) + '\n')

  await writeFile(join(protocolRoot, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh-typert-protocol',
    type: 'module',
    main: './lib/index.js',
    types: './lib/types/index.d.ts',
    exports: {
      '.': {
        types: './lib/types/index.d.ts',
        default: './lib/index.js',
      },
    },
  }, null, 2) + '\n')

  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
    name: 'dsh-context-manager',
    type: 'module',
    main: './lib/service/remote.js',
    types: './lib/service/remote.d.ts',
    exports: {
      '.': {
        types: './lib/service/remote.d.ts',
        default: './lib/service/remote.js',
      },
      './types': {
        types: './lib/remote/types.d.ts',
        default: './lib/remote/types.js',
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
      'lib/typert.remote-client.d.ts.map',
    ],
  }, null, 2) + '\n')

  const artifacts = new WorkspaceTypertGenerator(temporary).generate(
    ['dsh-context-manager'],
    ['host'],
  )
  if (artifacts.length !== 1) {
    throw new Error(`M6A Typert generation expected one Host artifact, received ${artifacts.length}`)
  }

  const artifact = artifacts[0]
  if (artifact === undefined || artifact.package !== 'dsh-context-manager' || artifact.face !== 'host') {
    throw new Error('M6A Typert generation returned the wrong package or face')
  }
  if (artifact.remote === undefined) {
    throw new Error('M6A Typert generation emitted no Remote contract')
  }

  const hostRuntime = addTypertFactoryCompatibility(artifact.js, 'Host')
  const remoteRuntime = addTypertFactoryCompatibility(artifact.remote.js, 'Remote')

  await mkdir(out, { recursive: true })
  await Promise.all([
    writeFile(join(out, 'typert.host.js'), hostRuntime),
    writeFile(join(out, 'typert.host.d.ts'), artifact.dts),
    writeFile(join(out, 'typert.remote-client.js'), remoteRuntime),
    writeFile(join(out, 'typert.remote-client.d.ts'), artifact.remote.dts),
    writeFile(join(out, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap),
  ])

  // Make drift between the temporary package contract and the production source
  // loud during generation rather than relying only on later package tests.
  for (const relative of [
    ['service', 'remote.ts'],
    ['remote', 'types.ts'],
  ]) {
    const production = await readFile(join(root, 'src', ...relative), 'utf8')
    const copied = await readFile(join(packageRoot, 'src', ...relative), 'utf8')
    if (production !== copied) {
      throw new Error(`M6A Typert source copy drifted during generation: ${relative.join('/')}`)
    }
  }
} finally {
  await rm(temporary, { recursive: true, force: true })
}
