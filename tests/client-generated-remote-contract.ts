import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '../lib/typert.remote-client.js'

import type {
  ContextManagerClientBusinessRemote,
  ContextManagerClientReadRemote,
} from '../src/client/remote-port.js'

type Assert<T extends true> = T

type GeneratedContextManagerRemote = TypertRemoteNamespaceMap['contextManager']

type GeneratedRemoteSatisfiesReadPort = Assert<
  GeneratedContextManagerRemote extends ContextManagerClientReadRemote ? true : false
>

const _generatedRemoteSatisfiesReadPort: GeneratedRemoteSatisfiesReadPort = true
void _generatedRemoteSatisfiesReadPort

type GeneratedRemoteSatisfiesBusinessPort = Assert<
  GeneratedContextManagerRemote extends ContextManagerClientBusinessRemote ? true : false
>

const _generatedRemoteSatisfiesBusinessPort: GeneratedRemoteSatisfiesBusinessPort = true
void _generatedRemoteSatisfiesBusinessPort
