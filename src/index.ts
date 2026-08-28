import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-context-manager'

/**
 * Host entry for DSH Context Manager.
 *
 * The initial scaffold is intentionally side-effect-light: it proves that the
 * bundle can be installed and mounted without replacing any built-in preset,
 * skill provider, or Web UI surface. Functional services are added in later
 * milestones behind explicit capability checks.
 */
export function apply(ctx: Context): void {
  try {
    const logger = ctx.logger('dsh-context-manager')
    logger.info('Context Manager plugin loaded (scaffold mode)')
  } catch (error) {
    // A diagnostics failure must never make the optional plugin fatal.
    console.warn('[dsh-context-manager] loaded, but diagnostics are unavailable', error)
  }
}
