import type { Context } from '@deepseek-ai/cordis'

import { ContextManagerService } from './service/context-manager.js'
import { ContextManagerPresetAuthoring } from './service/preset-authoring.js'
import { ContextManagerPresetDirectory } from './service/preset-directory.js'
import { ContextManagerPinnedSkillRuntime } from './service/pinned-skill-runtime.js'
import { ContextManagerPromptLibrary } from './service/prompt-library.js'
import { ContextManagerPromptPlacementCapability } from './service/prompt-placement.js'
import { ContextManagerPromptRuntime } from './service/prompt-runtime.js'
import { ContextManagerRequestSeries } from './service/request-series.js'
import { ContextManagerRemoteService } from './service/remote.js'
import { ContextManagerSessionPresetIdentity } from './service/session-preset.js'
import { ContextManagerSkillRuntime } from './service/skill-runtime.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextRemote: ContextManagerRemoteService
  }
}

export type {
  BasePresetResolution,
  ContextManagerPresetSnapshot,
  ContextProfilePresetState,
  NativePresetDirectory,
  NativePresetRow,
  NativePresetTrust,
} from './adapters/agent-presets.js'
export type { SessionPresetIdentity } from './adapters/session-preset.js'
export type {
  PromptPlacementCapabilityChannel,
  PromptPlacementCapabilitySnapshot,
} from './service/prompt-placement.js'
export type {
  EffectiveProfileResolution,
  PromptRuntimeBindingInspection,
  PromptRuntimeInspection,
  PromptRuntimeNativeState,
  PinnedSkillBindingInspection,
  PinnedSkillRuntimeInspection,
  PinnedSkillRuntimeNativeState,
  SkillRuntimeBindingInspection,
  SkillRuntimeInspection,
  SkillRuntimeInvocation,
  SkillRuntimeWinner,
} from './runtime/types.js'
export * from './domain/errors.js'
export * from './domain/model.js'
export * from './domain/schema.js'
export type {
  InvalidPromptResourceSummary,
  PromptMutationReceipt,
  PromptResource,
  PromptResourceId,
  PromptResourceInput,
  PromptResourceListItem,
  PromptResourceSnapshot,
  UsablePromptResourceSummary,
} from './library/prompt-library.js'
export { ContextManagerService, CONTEXT_MANAGER_SETTINGS_NAMESPACE } from './service/context-manager.js'
export { ContextManagerPresetAuthoring } from './service/preset-authoring.js'
export { ContextManagerPresetDirectory } from './service/preset-directory.js'
export { ContextManagerPinnedSkillRuntime } from './service/pinned-skill-runtime.js'
export { ContextManagerPromptLibrary } from './service/prompt-library.js'
export { ContextManagerPromptPlacementCapability } from './service/prompt-placement.js'
export { ContextManagerPromptRuntime } from './service/prompt-runtime.js'
export { ContextManagerRequestSeries } from './service/request-series.js'
export {
  CONTEXT_MANAGER_REMOTE_API_VERSION,
  ContextManagerRemoteService,
} from './service/remote.js'
export type { ContextManagerRemoteProtocol } from './service/remote.js'
export { ContextManagerSessionPresetIdentity } from './service/session-preset.js'
export { ContextManagerSkillRuntime } from './service/skill-runtime.js'

export const name = 'dsh-context-manager'

export function apply(ctx: Context): void {
  ctx.plugin(ContextManagerService)
  ctx.plugin(ContextManagerPresetDirectory)
  ctx.plugin(ContextManagerSessionPresetIdentity)
  ctx.plugin(ContextManagerPresetAuthoring)
  ctx.plugin(ContextManagerPromptLibrary)
  ctx.plugin(ContextManagerPromptPlacementCapability)
  ctx.plugin(ContextManagerPromptRuntime)
  ctx.plugin(ContextManagerRequestSeries)
  ctx.plugin(ContextManagerRemoteService)
  ctx.plugin(ContextManagerSkillRuntime)
  ctx.plugin(ContextManagerPinnedSkillRuntime)
  ctx.logger('dsh-context-manager').info('Context Manager Host services loaded')
}
