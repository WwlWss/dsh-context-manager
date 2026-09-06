import type { Context } from '@deepseek-ai/cordis'
import * as SettingsApi from '@deepseek-ai/dsh-settings'
import {
  SettingsConflictError,
  type SettingsDescriptor,
  type SettingsPathOp,
  type SettingsProvider,
} from '@deepseek-ai/dsh-settings'
import type z from '@deepseek-ai/schemastery'

export {
  SettingsConflictError,
  type SettingsDescriptor,
  type SettingsPathOp,
  type SettingsProvider,
}

/**
 * Context Manager only needs a stable string namespace. Older DSH releases
 * exposed `settingsNamespace()` while current releases validate namespace
 * strings in the Settings service itself. Keeping the value local avoids
 * coupling the Domain to either API generation.
 */
export function settingsNamespace(value: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(value)) {
    throw new TypeError(`settings namespace ${JSON.stringify(value)} must be lowercase kebab-case`)
  }
  return value
}

export interface SettingsSectionHooks<T> {
  setSource(current: () => T): void
  onChange(): void
  validate?: (value: T) => void
}

type InstallSettingsSection = <T>(
  owner: Context,
  ns: string,
  schema: z<T>,
  entry: T,
  hooks: SettingsSectionHooks<T>,
) => void

type CurrentSettingsProvider = SettingsProvider & {
  installSection?: InstallSettingsSection
}

/**
 * Attach the optional Context Manager Settings section across DSH API
 * generations without reimplementing DSH's lifecycle policy.
 *
 * Current DSH exposes the helper as `settings.installSection(...)`. The older
 * supported line exposes the same owned lifecycle as the module-level
 * `installSettingsSection(...)`. The adapter selects only between those two
 * public API shapes; it never detects a particular fork or reaches into DSH
 * internals.
 */
export function installSettingsSection<T>(
  ctx: Context,
  ns: string,
  schema: z<T>,
  entry: T,
  hooks: SettingsSectionHooks<T>,
): void {
  const legacyInstall = (SettingsApi as unknown as {
    installSettingsSection?: InstallSettingsSection
  }).installSettingsSection

  if (legacyInstall !== undefined) {
    legacyInstall(ctx, ns, schema, entry, hooks)
    return
  }

  ctx.inject(['settings'], (settingsCtx) => {
    const settings = settingsCtx.settings as CurrentSettingsProvider
    if (typeof settings.installSection !== 'function') {
      throw new Error(
        'dsh-context-manager: unsupported @deepseek-ai/dsh-settings API; expected settings.installSection()',
      )
    }
    settings.installSection(ctx, ns, schema, entry, hooks)
  })
}
