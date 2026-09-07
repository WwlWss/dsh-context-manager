import type { Context } from '@deepseek-ai/cordis'

import { ContextManagerService } from './service/context-manager.js'
import { ContextManagerPresetDirectory } from './service/preset-directory.js'

export type {
  BasePresetResolution,
  ContextManagerPresetSnapshot,
  ContextProfilePresetState,
  NativePresetDirectory,
  NativePresetRow,
  NativePresetTrust,
} from './adapters/agent-presets.js'
export * from './domain/errors.js'
export * from './domain/model.js'
export * from './domain/schema.js'
export { ContextManagerService, CONTEXT_MANAGER_SETTINGS_NAMESPACE } from './service/context-manager.js'
export { ContextManagerPresetDirectory } from './service/preset-directory.js'

export const name = 'dsh-context-manager'

/** Mount the model-inert Host services into the plugin's Cordis fiber. */
export function apply(ctx: Context): void {
  ctx.plugin(ContextManagerService)
  ctx.plugin(ContextManagerPresetDirectory)
  ctx.logger('dsh-context-manager').info('Context Manager Host services loaded')
}
