import { createElement } from 'react'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'

import {
  CONTEXT_MANAGER_LOCALE,
  CONTEXT_MANAGER_LOCALES,
} from './locales.js'
import {
  createContextManagerPresentationStore,
  type ContextManagerPresentationState,
  type ContextManagerPresentationStoreHandle,
} from './presentation-store.js'
import styles from './plugin.module.css'

export interface ContextManagerRemoteContribution {
  readonly package: string
  readonly descriptors: readonly unknown[]
}

interface ClientRemoteMount {
  $mount(contribution: ContextManagerRemoteContribution): Promise<() => Promise<void>>
}

interface ClientSlotRegistry {
  inject(name: string, factory: () => () => void): () => void
  register(
    options: Readonly<Record<string, unknown>>,
    component: unknown,
  ): () => void
}

interface ClientLocale {
  register(
    namespace: string,
    dictionaries: Readonly<Record<string, Readonly<Record<string, string>>>>,
  ): () => void
  bind(namespace: string): (key: string, params?: Readonly<Record<string, string | number>>) => string
}

export interface ContextManagerClientContext {
  readonly remote: ClientRemoteMount
  readonly slots: ClientSlotRegistry
  readonly locale: ClientLocale
}

type PresentationStoreProps = PropsStore<ContextManagerPresentationStoreHandle>
type PresentationLocaleProps = PropsLocale<typeof CONTEXT_MANAGER_LOCALE>

type TriggerProps =
  & PresentationStoreProps
  & PresentationLocaleProps
  & { readonly wide?: boolean }

type DrawerProps =
  & PresentationStoreProps
  & PresentationLocaleProps

function ContextManagerTrigger(props: TriggerProps): unknown {
  const { wide, useStore, actions, t } = props
  const open = useStore((state: ContextManagerPresentationState) => state.open)
  return createElement('button', {
    type: 'button',
    className: styles.trigger,
    'aria-label': t('title'),
    'aria-expanded': open,
    'data-context-manager-trigger': '',
    onClick: actions.toggle,
  }, wide === true ? t('title') : t('compactTitle'))
}

function ContextManagerDrawer(props: DrawerProps): unknown {
  const { useStore, actions, t } = props
  const open = useStore((state: ContextManagerPresentationState) => state.open)
  if (!open) return null

  return createElement(
    'div',
    {
      className: styles.backdrop,
      'data-context-manager-backdrop': '',
      onClick: actions.close,
    },
    createElement(
      'aside',
      {
        role: 'dialog',
        'aria-modal': true,
        'aria-label': t('title'),
        className: styles.drawer,
        'data-context-manager-drawer': '',
        onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() },
      },
      createElement('div', { className: styles.header },
        createElement('strong', null, t('title')),
        createElement('button', {
          type: 'button',
          className: styles.close,
          'aria-label': t('closeAria'),
          onClick: actions.close,
        }, t('close')),
      ),
      createElement('p', { className: styles.message }, t('foundationMessage')),
    ),
  )
}

export const inject = Object.freeze(['remote', 'slots', 'locale'])

export function createContextManagerClientPlugin(contribution: ContextManagerRemoteContribution): {
  readonly inject: readonly string[]
  readonly apply: (ctx: ContextManagerClientContext) => Promise<() => Promise<void>>
} {
  if (contribution.package !== 'dsh-context-manager') {
    throw new Error(`Context Manager client received Remote contribution for ${JSON.stringify(contribution.package)}`)
  }

  return {
    inject,
    async apply(ctx) {
      const disposeRemote = await ctx.remote.$mount(contribution)
      let disposeLocale: (() => void) | undefined
      const slotDisposers: Array<() => void> = []

      try {
        disposeLocale = ctx.locale.register(CONTEXT_MANAGER_LOCALE, CONTEXT_MANAGER_LOCALES)
        const t = ctx.locale.bind(CONTEXT_MANAGER_LOCALE)
        const presentationStore = createContextManagerPresentationStore()

        slotDisposers.push(ctx.slots.inject(
          'sidebar.footer.action',
          () => ctx.slots.register({
            name: 'sidebar.footer.action',
            id: 'context-manager',
            order: 100,
            label: () => t('title'),
            store: presentationStore,
            locale: CONTEXT_MANAGER_LOCALE,
          }, ContextManagerTrigger),
        ))
        slotDisposers.push(ctx.slots.inject(
          'shell.overlay',
          () => ctx.slots.register({
            name: 'shell.overlay',
            id: 'context-manager-drawer',
            store: presentationStore,
            locale: CONTEXT_MANAGER_LOCALE,
          }, ContextManagerDrawer),
        ))
      } catch (error) {
        for (const dispose of slotDisposers.reverse()) dispose()
        disposeLocale?.()
        await disposeRemote()
        throw error
      }

      return async () => {
        for (const dispose of slotDisposers.reverse()) dispose()
        disposeLocale?.()
        await disposeRemote()
      }
    },
  }
}
