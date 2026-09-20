import type {
  RemoteResult,
  TypertRemoteNamespaceMap,
} from '@deepseek-ai/dsh-typert-protocol'

import '../lib/typert.remote-client.js'

declare const remote: TypertRemoteNamespaceMap

const result = remote.contextManager.protocol()
const expected: Promise<RemoteResult<{
  readonly apiVersion: number
  readonly transport: 'typert'
  readonly strict: true
}>> = result

void expected
