import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  ContextManagerRemotePresetReceipt,
  ContextManagerRemoteResult,
} from '../remote/types.js'

/** Wire only; never expose native filesystem access or make this a CAS API. */
export interface ContextManagerClientPresetMutationRemote {
  copyPreset(
    from: string,
    id: string,
    name: string | null,
  ): Promise<RemoteResult<ContextManagerRemoteResult<ContextManagerRemotePresetReceipt>>>
  removePreset(
    id: string,
  ): Promise<RemoteResult<ContextManagerRemoteResult<ContextManagerRemotePresetReceipt>>>
}
