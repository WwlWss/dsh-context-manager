import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-context-manager'

/**
 * Host entry for DSH Context Manager.
 *
 * The scaffold intentionally performs no runtime mutation beyond diagnostics.
 * Later milestones should use Cordis dependency injection and effect-owned
 * registrations rather than broad exception swallowing.
 */
export function apply(ctx: Context): void {
  ctx.logger('dsh-context-manager').info('Context Manager loaded (scaffold mode)')
}
