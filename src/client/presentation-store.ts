import { defineStore } from '@deepseek-ai/dsh-client-store'

export interface ContextManagerPresentationState {
  open: boolean
}

export function createContextManagerPresentationStore() {
  return defineStore({
    init: (): ContextManagerPresentationState => ({ open: false }),
    actions: {
      open(draft) {
        draft.open = true
      },
      close(draft) {
        draft.open = false
      },
      toggle(draft) {
        draft.open = !draft.open
      },
    },
  })
}

export type ContextManagerPresentationStoreHandle = ReturnType<typeof createContextManagerPresentationStore>
