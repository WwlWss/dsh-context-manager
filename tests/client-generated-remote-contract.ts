import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '../lib/typert.remote-client.js'

import type { ContextManagerClientReadRemote } from '../src/client/remote-port.js'

type Assert<T extends true> = T

type GeneratedContextManagerRemote = TypertRemoteNamespaceMap['contextManager']

type GeneratedRemoteSatisfiesReadPort = Assert<
  GeneratedContextManagerRemote extends ContextManagerClientReadRemote ? true : false
>

const _generatedRemoteSatisfiesReadPort: GeneratedRemoteSatisfiesReadPort = true
void _generatedRemoteSatisfiesReadPort
