import type { Context } from '@deepseek-ai/cordis'
import {
  SettingsConflictError,
  type SettingsDescriptor,
  type SettingsPathOp,
  type SettingsProvider,
  type SettingsScope,
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
 * exposed `settingsNamespace()` while current releases validate literal/raw
 * namespace strings inside the Settings service itself. Keeping the value
 * local avoids depending on either API generation.
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

type CurrentSettingsProvider = SettingsProvider & {
  installSection?: <T>(
    owner: Context,
    ns: string,
    schema: z<T>,
    entry: T,
    hooks: SettingsSectionHooks<T>,
  ) => void
}

/**
 * Attach an optional Settings-backed section across supported DSH API
 * generations.
 *
 * DSH 0.1.2+ owns this lifecycle through `settings.installSection()`. Older
 * releases exposed the same behavior as a module helper instead. Context
 * Manager intentionally does not import that removed helper: when the current
 * method is unavailable, this adapter uses only the common public
 * `register()`/`watch()`/Cordis lifecycle primitives.
 */
export function installSettingsSection<T>(
  ctx: Context,
  ns: string,
  schema: z<T>,
  entry: T,
  hooks: SettingsSectionHooks<T>,
): void {
  ctx.inject(['settings'], (settingsCtx) => {
    const settings = settingsCtx.settings as CurrentSettingsProvider

    if (typeof settings.installSection === 'function') {
      settings.installSection(ctx, ns, schema, entry, hooks)
      return
    }

    const scope = settings.register(
      ns as Parameters<SettingsProvider['register']>[0],
      schema,
      {
        base: entry,
        ...hooks.validate === undefined ? {} : { validate: hooks.validate },
      },
    ) as SettingsScope<T>

    hooks.setSource(() => scope.get())
    hooks.onChange()

    const stopWatching = scope.watch(() => hooks.onChange())
    settingsCtx.effect(() => () => {
      stopWatching()
      hooks.setSource(() => entry)
      hooks.onChange()
    }, `dsh-context-manager.settings(${JSON.stringify(ns)})`)
  })
}
