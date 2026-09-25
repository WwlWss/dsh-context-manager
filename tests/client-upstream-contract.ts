import {
  CONTEXT_MANAGER_LOCALE,
  CONTEXT_MANAGER_LOCALES,
} from '../src/client/locales.js'
import {
  createContextManagerPresentationStore,
  type ContextManagerPresentationState,
} from '../src/client/presentation-store.js'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import {
  SlotCore,
  type LocaleNamespaceMap,
  type PropsLocale,
  type PropsStore,
  type StoreHandle,
} from '@deepseek-ai/dsh-client-ui-slots'

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

const candidateStore = createContextManagerPresentationStore()
const store: StoreHandle<
  ContextManagerPresentationState,
  typeof candidateStore.spec.actions
> = candidateStore

const _englishTitle: string = CONTEXT_MANAGER_LOCALES.en.title
const _chineseTitle: string = CONTEXT_MANAGER_LOCALES.zh.title

type PresentationProps =
  & PropsStore<typeof store>
  & PropsLocale<typeof CONTEXT_MANAGER_LOCALE>

declare const props: PresentationProps
const _open: boolean = props.useStore((state: ContextManagerPresentationState) => state.open)
props.actions.open()
props.actions.close()
props.actions.toggle()
const _title: string = props.t('title')

const core = new SlotCore()

const disposeFooter = core.register({
  name: 'sidebar.footer.action',
  id: 'context-manager',
  order: 100,
  store,
  locale: CONTEXT_MANAGER_LOCALE,
}, (_props: PresentationProps) => null)

const disposeOverlay = core.register({
  name: 'shell.overlay',
  id: 'context-manager-drawer',
  store,
  locale: CONTEXT_MANAGER_LOCALE,
}, (_props: PresentationProps) => null)

const _localeProof: HasContextManagerLocale = true

disposeOverlay()
disposeFooter()
