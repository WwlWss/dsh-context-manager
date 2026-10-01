import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

import type {
  ContextManagerRemoteChangeSnapshot,
  ContextManagerRemotePresetSnapshot,
  ContextManagerRemoteProfilesSnapshot,
  ContextManagerRemotePromptPlacementCapability,
  ContextManagerRemoteProtocol,
} from '../remote/types.js'

/**
 * Narrow generated Remote face consumed by the authoritative Client model.
 *
 * Keep this deliberately smaller than the full contextManager namespace so
 * later mutation and keyed-diagnostic surfaces cannot leak into B1-1.
 */
export interface ContextManagerClientReadRemote {
  protocol(): Promise<RemoteResult<ContextManagerRemoteProtocol>>
  changes(): Promise<RemoteResult<ContextManagerRemoteChangeSnapshot>>
  profiles(): Promise<RemoteResult<ContextManagerRemoteProfilesSnapshot>>
  presets(): Promise<RemoteResult<ContextManagerRemotePresetSnapshot>>
  promptPlacement(): Promise<RemoteResult<ContextManagerRemotePromptPlacementCapability>>
}
