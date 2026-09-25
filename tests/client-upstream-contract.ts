import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import {
  SlotCore,
  type LocaleNamespaceMap,
  type PropsLocale,
  type PropsStore,
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

type PresentationProps =
  & PropsStore<typeof store>
  & PropsLocale<'context-manager'>

declare const props: PresentationProps
const _open: boolean = props.useStore((state: PresentationState) => state.open)
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
  locale: 'context-manager',
}, (_props: PresentationProps) => null)

const disposeOverlay = core.register({
  name: 'shell.overlay',
  id: 'context-manager-drawer',
  store,
  locale: 'context-manager',
}, (_props: PresentationProps) => null)

const _localeProof: HasContextManagerLocale = true

disposeOverlay()
disposeFooter()
