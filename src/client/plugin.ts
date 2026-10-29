import { createElement } from 'react'
import type { ComposedProps } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

import type { Context } from '@deepseek-ai/cordis'
import type {
  ContextManagerClientContext,
  ContextManagerClientRemote,
  ContextManagerRemoteContribution,
} from './context.js'
import {
  CONTEXT_MANAGER_LOCALE,
  CONTEXT_MANAGER_LOCALES,
} from './locales.js'
import {
  createContextManagerPresentationStore,
  type ContextManagerPresentationStoreHandle,
} from './presentation-store.js'
import { createContextManagerClientModel } from './model.js'
import type { ContextManagerClientBusinessRemote } from './remote-port.js'
import {
  createContextManagerClientBusinessFace,
  type ContextManagerClientBusinessFace,
} from './business-face.js'
import {
  ContextManagerProfileDrawerContent,
  type ContextManagerDrawerProps,
} from './profile-drawer.js'
import { ContextManagerResourceDrawerContent } from './resource-drawer.js'
import styles from './plugin.module.css'

type TriggerProps = ComposedProps<
  'sidebar.footer.action',
  string,
  never,
  ContextManagerPresentationStoreHandle,
  object,
  never,
  typeof CONTEXT_MANAGER_LOCALE
>

function ContextManagerTrigger(props: TriggerProps) {
  const { wide, useStore, actions, t } = props
  const open = useStore(state => state.open)
  return createElement('button', {
    type: 'button',
    className: styles.trigger,
    'aria-label': t('title'),
    'aria-expanded': open,
    'data-context-manager-trigger': '',
    onClick: actions.toggle,
  }, wide ? t('title') : t('compactTitle'))
}

/** Tabs share one apply-lifetime local Presentation Store; drafts outlive panel close. */
function ContextManagerDrawerBody(props: ContextManagerDrawerProps) {
  const pane = props.useStore(state => state.pane)
  const { actions, t } = props
  return createElement('div', { className: styles.workspace },
    createElement('nav', { className: styles.tabs, 'aria-label': t('title') },
      createElement('button', {
        type: 'button',
        className: pane === 'profiles' ? styles.tabActive : styles.tab,
        'aria-current': pane === 'profiles' ? 'page' : undefined,
        'data-context-manager-tab': 'profiles',
        onClick: () => actions.selectPane('profiles'),
      }, t('profilesTitle')),
      createElement('button', {
        type: 'button',
        className: pane === 'resources' ? styles.tabActive : styles.tab,
        'aria-current': pane === 'resources' ? 'page' : undefined,
        'data-context-manager-tab': 'resources',
        onClick: () => actions.selectPane('resources'),
      }, t('resourcesTitle')),
    ),
    pane === 'profiles'
      ? createElement(ContextManagerProfileDrawerContent, props)
      : createElement(ContextManagerResourceDrawerContent, props),
  )
}

function ContextManagerDrawer(props: ContextManagerDrawerProps) {
  const { useStore, actions, t } = props
  const open = useStore(state => state.open)
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
        tabIndex: -1,
        onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() },
        onKeyDown: (event: {
          key: string
          shiftKey: boolean
          target: EventTarget | null
          currentTarget: HTMLElement
          preventDefault(): void
          stopPropagation(): void
        }) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            actions.close()
            return
          }
          if (event.key !== 'Tab') return
          const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]',
          )).filter(element => element.getClientRects().length > 0)
          if (focusable.length === 0) {
            event.preventDefault()
            event.currentTarget.focus()
            return
          }
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        },
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
      createElement(ContextManagerDrawerBody, props),
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
      let model: ReturnType<typeof createContextManagerClientModel> | undefined
      let modelFiber: ReturnType<Context['plugin']> | undefined
      let disposeLocale: (() => void) | undefined
      let revokePresentationReader: (() => void) | undefined
      const slotDisposers: Array<() => void> = []

      try {
        const nextModel = createContextManagerClientModel()
        const businessFace = createContextManagerClientBusinessFace(nextModel)
        const injectBusinessFace = () => businessFace
        model = nextModel
        modelFiber = ctx.plugin({
          name: 'dsh-context-manager-client-model',
          inject: ['remote', 'remote.contextManager'],
          apply(childCtx: Context) {
            const childRemote = (childCtx as Context & {
              readonly remote: ContextManagerClientRemote & {
                readonly contextManager: ContextManagerClientBusinessRemote
              }
            }).remote
            return nextModel.attach(childRemote.contextManager as ContextManagerClientBusinessRemote)
          },
        })

        await modelFiber
        disposeLocale = ctx.locale.register(CONTEXT_MANAGER_LOCALE, CONTEXT_MANAGER_LOCALES)
        const t = ctx.locale.bind(CONTEXT_MANAGER_LOCALE)
        const presentationStore = createContextManagerPresentationStore()
        revokePresentationReader = presentationStore.revokeSnapshotReader
        // Live authorization resolves from published StoreInstance.actions,
        // leaving both Slot components and their legacy return shape intact.

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
            inject: injectBusinessFace,
            locale: CONTEXT_MANAGER_LOCALE,
          }, ContextManagerDrawer),
        ))
      } catch (error) {
        for (const dispose of slotDisposers.reverse()) dispose()
        revokePresentationReader?.()
        disposeLocale?.()
        try {
          await modelFiber?.dispose()
        } finally {
          model?.dispose()
          await disposeRemote()
        }
        throw error
      }

      return async () => {
        for (const dispose of slotDisposers.reverse()) dispose()
        revokePresentationReader?.()
        disposeLocale?.()
        try {
          await modelFiber?.dispose()
        } finally {
          model?.dispose()
          await disposeRemote()
        }
      }
    },
  }
}
