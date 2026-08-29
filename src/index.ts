import type { Context } from '@deepseek-ai/cordis'

import { ContextManagerService } from './service/context-manager.js'

export * from './domain/errors.js'
export * from './domain/model.js'
export * from './domain/schema.js'
export { ContextManagerService, CONTEXT_MANAGER_SETTINGS_NAMESPACE } from './service/context-manager.js'

export const name = 'dsh-context-manager'

/** Mount the model-inert Host state service into the plugin's Cordis fiber. */
export function apply(ctx: Context): void {
  ctx.plugin(ContextManagerService)
  ctx.logger('dsh-context-manager').info('Context Manager host state service loaded')
}
