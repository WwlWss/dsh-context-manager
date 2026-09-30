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
  type ComposedProps,
  type LocaleDictOf,
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

const _englishDictionary: LocaleDictOf<typeof CONTEXT_MANAGER_LOCALE> = CONTEXT_MANAGER_LOCALES.en
const _chineseDictionary: LocaleDictOf<typeof CONTEXT_MANAGER_LOCALE> = CONTEXT_MANAGER_LOCALES.zh
const _englishTitle: string = _englishDictionary.title
const _chineseTitle: string = _chineseDictionary.title

type PresentationProps =
  & PropsStore<typeof store>
  & PropsLocale<typeof CONTEXT_MANAGER_LOCALE>

type FooterProps = ComposedProps<
  'sidebar.footer.action',
  string,
  never,
  typeof store,
  object,
  never,
  typeof CONTEXT_MANAGER_LOCALE
>
type OverlayProps = ComposedProps<
  'shell.overlay',
  string,
  never,
  typeof store,
  object,
  never,
  typeof CONTEXT_MANAGER_LOCALE
>

declare const footerProps: FooterProps
const _wide: boolean = footerProps.wide
const _open: boolean = footerProps.useStore((state: ContextManagerPresentationState) => state.open)
footerProps.actions.open()
footerProps.actions.close()
footerProps.actions.toggle()
const _title: string = footerProps.t('title')

const core = new SlotCore()

const disposeFooter = core.register({
  name: 'sidebar.footer.action',
  id: 'context-manager',
  order: 100,
  store,
  locale: CONTEXT_MANAGER_LOCALE,
}, (_props: FooterProps) => null)

const disposeOverlay = core.register({
  name: 'shell.overlay',
  id: 'context-manager-drawer',
  store,
  locale: CONTEXT_MANAGER_LOCALE,
}, (_props: OverlayProps) => null)

const _localeProof: HasContextManagerLocale = true

disposeOverlay()
disposeFooter()
