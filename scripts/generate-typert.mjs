import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

const root = fileURLToPath(new URL('../', import.meta.url))
const out = join(root, 'lib')
const temporary = await mkdtemp(join(root, '.typert-workspace-'))

try {
  const packageRoot = join(temporary, 'packages', 'dsh-context-manager')
  const protocolRoot = join(temporary, 'packages', 'dsh-typert-protocol')
  await mkdir(join(packageRoot, 'src'), { recursive: true })
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
    join(packageRoot, 'src', 'index.ts'),
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

  await mkdir(out, { recursive: true })
  await Promise.all([
    writeFile(join(out, 'typert.host.js'), artifact.js),
    writeFile(join(out, 'typert.host.d.ts'), artifact.dts),
    writeFile(join(out, 'typert.remote-client.js'), artifact.remote.js),
    writeFile(join(out, 'typert.remote-client.d.ts'), artifact.remote.dts),
    writeFile(join(out, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap),
  ])

  // Make drift between the temporary package contract and the production source
  // loud during generation rather than relying only on later package tests.
  const production = await readFile(join(root, 'src', 'service', 'remote.ts'), 'utf8')
  const copied = await readFile(join(packageRoot, 'src', 'index.ts'), 'utf8')
  if (production !== copied) {
    throw new Error('M6A Typert source copy drifted during generation')
  }
} finally {
  await rm(temporary, { recursive: true, force: true })
}
