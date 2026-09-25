import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import {
  SlotCore,
  type LocaleNamespaceMap,
  type StoreHandle,
} from '@deepseek-ai/dsh-client-ui-slots'

interface PresentationState {
  open: boolean
}

type PresentationActions = {
  open(draft: PresentationState): void
  close(draft: PresentationState): void
  toggle(draft: PresentationState): void
}

type ContextManagerLocaleKey =
  | 'title'
  | 'compactTitle'
  | 'close'
  | 'closeAria'
  | 'foundationMessage'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'context-manager': ContextManagerLocaleKey
  }
}

type Assert<T extends true> = T
type HasContextManagerLocale = Assert<
  'context-manager' extends keyof LocaleNamespaceMap ? true : false
>

declare const store: StoreHandle<PresentationState, PresentationActions>

const core = new SlotCore()

const disposeRoot = core.register({
  name: 'root',
  children: {
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  },
}, () => null)

const disposeFooter = core.register({
  name: 'sidebar.footer.action',
  id: 'context-manager',
  order: 100,
  store,
  locale: 'context-manager',
  inject: actions => ({ actions }),
}, () => null)

const disposeOverlay = core.register({
  name: 'shell.overlay',
  id: 'context-manager-drawer',
  store,
  locale: 'context-manager',
  inject: actions => ({ actions }),
}, () => null)

const _localeProof: HasContextManagerLocale = true

disposeOverlay()
disposeFooter()
disposeRoot()
