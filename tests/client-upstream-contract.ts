import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {
  ContextManagerClientContext,
  ContextManagerClientLocale,
  ContextManagerClientRemote,
  ContextManagerClientRemoteContribution,
  ContextManagerClientSlots,
  ContextManagerRemoteContribution,
} from '../src/client/context.js'
import type { ContextManagerClientBusinessFace } from '../src/client/business-face.js'
import type { ContextManagerClientSnapshot } from '../src/client/model-types.js'
import type { ContextManagerClientMutationSnapshot } from '../src/client/mutation-types.js'
import {
  CONTEXT_MANAGER_LOCALE,
  CONTEXT_MANAGER_LOCALES,
} from '../src/client/locales.js'
import type { ContextManagerLocaleKey } from '../src/client/locales.js'
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

type LocaleContractUsesProductionKeys = ContextManagerLocaleKey
type Assert<T extends true> = T
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2)
    ? true
    : false
type ClientSlotsAliasIsUpstream = Assert<
  Equal<ContextManagerClientSlots, Pick<SlotRegistry, 'inject' | 'register'>>
>
type ClientLocaleAliasIsUpstream = Assert<
  Equal<ContextManagerClientLocale, Pick<LocaleRuntime, 'register' | 'bind'>>
>
type ClientSlotsAreUpstream = Assert<
  Equal<ContextManagerClientContext['slots'], ContextManagerClientSlots>
>
type ClientLocaleIsUpstream = Assert<
  Equal<ContextManagerClientContext['locale'], ContextManagerClientLocale>
>
type RemoteContributionExtendsLegacy = Assert<
  ContextManagerRemoteContribution extends ContextManagerClientRemoteContribution ? true : false
>
type RemoteMountUsesLegacyContribution = Assert<
  Parameters<ContextManagerClientRemote['$mount']>[0] extends ContextManagerClientRemoteContribution ? true : false
>
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
  ContextManagerClientBusinessFace,
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

declare const overlayProps: OverlayProps
const _attachment: ContextManagerClientSnapshot['attachment'] =
  overlayProps.useContextManager(snapshot => snapshot.attachment)
const _mutationStatus: ContextManagerClientMutationSnapshot['profile']['status'] =
  overlayProps.useProfileMutation(snapshot => snapshot.profile.status)
void overlayProps.refresh()
const _basis = overlayProps.captureProfileMutationBasis()
if (_basis !== undefined) {
  void overlayProps.profileMutations.setProfileName(_basis, 'main', 'Main')
}
declare const businessFace: ContextManagerClientBusinessFace

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
  inject: () => businessFace,
  locale: CONTEXT_MANAGER_LOCALE,
}, (_props: OverlayProps) => null)

const _localeProof: HasContextManagerLocale = true
const _clientSlotsAliasProof: ClientSlotsAliasIsUpstream = true
const _clientLocaleAliasProof: ClientLocaleAliasIsUpstream = true
const _clientSlotsProof: ClientSlotsAreUpstream = true
const _clientLocaleProof: ClientLocaleIsUpstream = true
const _remoteContributionProof: RemoteContributionExtendsLegacy = true
const _remoteMountProof: RemoteMountUsesLegacyContribution = true

disposeOverlay()
disposeFooter()
