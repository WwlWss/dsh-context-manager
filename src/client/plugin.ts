import { createElement, useSyncExternalStore } from 'react'

import { ContextManagerInteractionController } from './interaction.js'

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
    component: (props: Record<string, unknown>) => unknown,
  ): () => void
}

export interface ContextManagerClientContext {
  readonly remote: ClientRemoteMount
  readonly slots: ClientSlotRegistry
}

interface ContextManagerInjected {
  readonly controller: ContextManagerInteractionController
}

const BUTTON_STYLE = Object.freeze({
  border: '1px solid var(--dsw-alias-border-l1, #d0d0d0)',
  borderRadius: '8px',
  background: 'var(--dsw-alias-bg-layer-1, #fff)',
  color: 'var(--dsw-alias-label-primary, #111)',
  cursor: 'pointer',
  padding: '8px 10px',
})

const BACKDROP_STYLE = Object.freeze({
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(0, 0, 0, 0.28)',
})

const DRAWER_STYLE = Object.freeze({
  position: 'absolute',
  top: 0,
  right: 0,
  width: 'min(620px, calc(100vw - 24px))',
  height: '100%',
  boxSizing: 'border-box',
  background: 'var(--dsw-alias-bg-base, #fff)',
  color: 'var(--dsw-alias-label-primary, #111)',
  borderLeft: '1px solid var(--dsw-alias-border-l1, #d0d0d0)',
  padding: '20px',
  boxShadow: '-12px 0 32px rgba(0, 0, 0, 0.18)',
})

function ContextManagerTrigger(props: Record<string, unknown>): unknown {
  const { controller } = props as unknown as ContextManagerInjected
  const wide = props.wide === true
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)

  return createElement('button', {
    type: 'button',
    style: BUTTON_STYLE,
    'aria-label': 'Context Manager',
    'aria-expanded': snapshot.open,
    'data-context-manager-trigger': '',
    onClick: () => { controller.toggle() },
  }, wide ? 'Context Manager' : 'CM')
}

function ContextManagerDrawer(props: Record<string, unknown>): unknown {
  const { controller } = props as unknown as ContextManagerInjected
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  if (!snapshot.open) return null

  return createElement(
    'div',
    {
      style: BACKDROP_STYLE,
      'data-context-manager-backdrop': '',
      onClick: () => { controller.close() },
    },
    createElement(
      'aside',
      {
        role: 'dialog',
        'aria-modal': true,
        'aria-label': 'Context Manager',
        style: DRAWER_STYLE,
        'data-context-manager-drawer': '',
        onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() },
      },
      createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' },
      },
      createElement('strong', null, 'Context Manager'),
      createElement('button', {
        type: 'button',
        style: BUTTON_STYLE,
        'aria-label': 'Close Context Manager',
        onClick: () => { controller.close() },
      }, 'Close')),
      createElement('p', {
        style: { margin: '20px 0 0', color: 'var(--dsw-alias-label-secondary, #666)' },
      }, 'Web client foundation is active. Profile controls arrive in M7B/M7C.'),
    ),
  )
}

export const inject = Object.freeze(['remote', 'slots'])

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
      const controller = new ContextManagerInteractionController()
      const face = (): ContextManagerInjected => ({ controller })
      const slotDisposers: Array<() => void> = []

      try {
        slotDisposers.push(ctx.slots.inject(
          'sidebar.footer.action',
          () => ctx.slots.register({
            name: 'sidebar.footer.action',
            id: 'context-manager',
            order: 100,
            label: 'Context Manager',
            inject: face,
          }, ContextManagerTrigger),
        ))
        slotDisposers.push(ctx.slots.inject(
          'shell.overlay',
          () => ctx.slots.register({
            name: 'shell.overlay',
            id: 'context-manager-drawer',
            inject: face,
          }, ContextManagerDrawer),
        ))
      } catch (error) {
        for (const dispose of slotDisposers.reverse()) dispose()
        await disposeRemote()
        throw error
      }

      return async () => {
        for (const dispose of slotDisposers.reverse()) dispose()
        await disposeRemote()
      }
    },
  }
}
