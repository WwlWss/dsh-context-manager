import type { Context } from '@deepseek-ai/cordis'

import { ContextManagerService } from './service/context-manager.js'
import { ContextManagerPresetAuthoring } from './service/preset-authoring.js'
import { ContextManagerPresetDirectory } from './service/preset-directory.js'
import { ContextManagerPromptLibrary } from './service/prompt-library.js'
import { ContextManagerPromptPlacementCapability } from './service/prompt-placement.js'
import { ContextManagerPromptRuntime } from './service/prompt-runtime.js'
import { ContextManagerSessionPresetIdentity } from './service/session-preset.js'
import { ContextManagerSkillRuntime } from './service/skill-runtime.js'

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
export { ContextManagerPromptLibrary } from './service/prompt-library.js'
export { ContextManagerPromptPlacementCapability } from './service/prompt-placement.js'
export { ContextManagerPromptRuntime } from './service/prompt-runtime.js'
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
  ctx.plugin(ContextManagerSkillRuntime)
  ctx.logger('dsh-context-manager').info('Context Manager Host services loaded')
}
