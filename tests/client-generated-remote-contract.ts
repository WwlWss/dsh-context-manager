import type { ContextManagerClientPresetMutationRemote } from '../src/client/preset-remote-port.js'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '../lib/typert.remote-client.js'

import type {
  ContextManagerClientBusinessRemote,
  ContextManagerClientReadRemote,
  ContextManagerClientResourceMutationRemote,
  ContextManagerClientNativePresetReadRemote,
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

type GeneratedRemoteSatisfiesResourceMutationPort = Assert<
  GeneratedContextManagerRemote extends ContextManagerClientResourceMutationRemote ? true : false
>
const _generatedResourcePort: GeneratedRemoteSatisfiesResourceMutationPort = true
void _generatedResourcePort

type GeneratedRemoteSatisfiesNativePresetRead = Assert<
  GeneratedContextManagerRemote extends ContextManagerClientNativePresetReadRemote ? true : false
>
const _generatedNativePresetRead: GeneratedRemoteSatisfiesNativePresetRead = true
void _generatedNativePresetRead

type GeneratedRemoteSatisfiesNativePresetMutation = Assert<
  GeneratedContextManagerRemote extends ContextManagerClientPresetMutationRemote ? true : false
>
const _generatedNativePresetMutation: GeneratedRemoteSatisfiesNativePresetMutation = true
void _generatedNativePresetMutation
