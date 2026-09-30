import type { Context } from '@deepseek-ai/cordis'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'

export interface ContextManagerRemoteContribution {
  readonly package: string
  readonly descriptors: readonly unknown[]
}

/**
 * Backward-compatible public name retained from the original M7A declaration.
 *
 * New Client code should use ContextManagerRemoteContribution directly.
 */
export type ContextManagerClientRemoteContribution = ContextManagerRemoteContribution

export interface ContextManagerClientRemote {
  $mount(
    contribution: ContextManagerRemoteContribution,
  ): Promise<() => Promise<void>>
}

/**
 * Backward-compatible M7A public names, now derived from their framework
 * owners instead of restating those owners member-by-member.
 */
export interface ContextManagerClientSlots extends Pick<SlotRegistry, 'inject' | 'register'> {}
export interface ContextManagerClientLocale extends Pick<LocaleRuntime, 'register' | 'bind'> {}

/**
 * Single source of truth for the browser Client context consumed by production
 * and exported through ./client declarations.
 *
 * Framework-owned Slot and Locale faces are derived from their published
 * upstream owners instead of being restated structurally in this package.
 */
export type ContextManagerClientContext = Omit<Context, 'remote' | 'slots' | 'locale'> & {
  readonly remote: ContextManagerClientRemote
  readonly slots: ContextManagerClientSlots
  readonly locale: ContextManagerClientLocale
}
