export interface ContextManagerPresentationState {
  open: boolean
}

export interface ContextManagerPresentationActions {
  open(): void
  close(): void
  toggle(): void
}

type PresentationActionSpec = {
  open(draft: ContextManagerPresentationState): void
  close(draft: ContextManagerPresentationState): void
  toggle(draft: ContextManagerPresentationState): void
}

interface ContextManagerPresentationStoreInstance {
  readonly actions: ContextManagerPresentationActions
  getSnapshot(): ContextManagerPresentationState
  subscribe(listener: () => void): () => void
  clearPersisted(): void
}

export interface ContextManagerPresentationStoreHandle {
  readonly spec: {
    readonly init: () => ContextManagerPresentationState
    readonly actions: PresentationActionSpec
  }
  create(scopeKey?: string): ContextManagerPresentationStoreInstance
}

export function createContextManagerPresentationStore(): ContextManagerPresentationStoreHandle {
  const actionSpec: PresentationActionSpec = Object.freeze({
    open(draft) {
      draft.open = true
    },
    close(draft) {
      draft.open = false
    },
    toggle(draft) {
      draft.open = !draft.open
    },
  })
  const spec = Object.freeze({
    init: (): ContextManagerPresentationState => ({ open: false }),
    actions: actionSpec,
  })

  return Object.freeze({
    spec,
    create(_scopeKey?: string): ContextManagerPresentationStoreInstance {
      let snapshot = Object.freeze(spec.init())
      const listeners = new Set<() => void>()

      const publish = (mutate: (draft: ContextManagerPresentationState) => void): void => {
        const draft = { ...snapshot }
        mutate(draft)
        if (draft.open === snapshot.open) return
        snapshot = Object.freeze(draft)
        for (const listener of [...listeners]) listener()
      }

      return {
        actions: Object.freeze({
          open: () => { publish(actionSpec.open) },
          close: () => { publish(actionSpec.close) },
          toggle: () => { publish(actionSpec.toggle) },
        }),
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        clearPersisted() {},
      }
    },
  })
}
