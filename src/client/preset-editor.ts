import type { ContextManagerRemotePresetRow } from '../remote/types.js'
import type { ContextManagerClientSnapshot } from './model-types.js'
import type { ContextManagerClientPresetMutationResult } from './preset-mutation-types.js'

type PresetSource = Pick<ContextManagerClientSnapshot,
  'attachment' | 'protocol' | 'instanceId' | 'changes' | 'presets'>

export type PresetDraftBlock = 'stale' | 'unknown' | 'unverified' | 'refused'

export type PresetNoticeCode =
  | 'presetNoticeApplied'
  | 'presetNoticeDegraded'
  | 'presetNoticeUnknown'
  | 'presetNoticeRejected'
  | 'presetNoticeBusy'
  | 'presetNoticeUnavailable'
  | 'presetNoticeInvalid'
  | 'presetNoticeExists'
  | 'presetNoticeDraftActive'
  | 'presetNoticeStale'
  | 'presetNoticeReadFailed'
  | 'presetNoticeConfirmMismatch'

export interface PresetNotice {
  readonly code: PresetNoticeCode
  readonly kind: 'success' | 'warning' | 'error'
}

interface PresetDraftBase {
  readonly token: number
  /** A UI observation, NOT a native CAS revision or Host authority. */
  readonly observedRow: Readonly<ContextManagerRemotePresetRow>
  readonly observedCursor: number
  readonly observedDefaultId: string
  submitting?: boolean
  blocked?: PresetDraftBlock
  terminalNotice?: PresetNotice
}

export type PresetDraft =
  | (PresetDraftBase & {
      kind: 'copy'
      readonly sourceId: string
      targetId: string
      nameMode: 'inherit' | 'explicit'
      explicitName: string
    })
  | (PresetDraftBase & {
      kind: 'confirm-remove'
      readonly targetId: string
      confirmationText: string
    })

export interface PresetView {
  readonly rows: readonly ContextManagerRemotePresetRow[]
  readonly selectedId?: string
  readonly selected?: ContextManagerRemotePresetRow
  readonly directoryFresh: boolean
  readonly directoryAvailable: boolean
  readonly authorable: boolean
  readonly canCopy: boolean
  readonly canRemove: boolean
  readonly canViewComposition: boolean
  readonly defaultId?: string
  readonly cursor?: number
}

const compareIds = (a: ContextManagerRemotePresetRow, b: ContextManagerRemotePresetRow) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0

/** A pure view of the authoritative Model surface; never a second roster. */
export function derivePresetView(
  snapshot: PresetSource,
  requestedId: string | null,
): PresetView {
  const surface = snapshot.presets
  const data = surface.data
  const directory = data?.directory
  const available = directory?.status === 'available'
  const rows = available ? [...directory.presets].sort(compareIds) : []
  const selectedId = requestedId !== null && rows.some(row => row.id === requestedId)
    ? requestedId : rows.some(row => row.id === (available ? directory.defaultId : undefined))
      ? (available ? directory.defaultId : undefined) : rows[0]?.id
  const selected = rows.find(row => row.id === selectedId)
  const fresh = available
    && snapshot.attachment === 'attached'
    && snapshot.protocol.status === 'compatible'
    && snapshot.instanceId !== undefined
    && snapshot.changes?.instanceId === snapshot.instanceId
    && surface.status === 'ready' && !surface.stale
  const authorable = available && directory.authorable
  return {
    rows, selectedId, selected,
    directoryAvailable: available,
    directoryFresh: fresh,
    authorable,
    canCopy: fresh && authorable && selected !== undefined && selected.broken === undefined,
    canRemove: fresh && authorable && selected?.trust === 'user' && !selected.isDefault,
    canViewComposition: fresh && selected !== undefined && selected.broken === undefined,
    defaultId: available ? directory.defaultId : undefined,
    cursor: snapshot.changes?.presets,
  }
}

export function isPresetDraftCurrent(
  snapshot: PresetSource,
  draft: PresetDraft | null,
): boolean {
  if (draft === null) return false
  const view = derivePresetView(snapshot, draft.kind === 'copy' ? draft.sourceId : draft.targetId)
  const row = view.selected
  const original = draft.observedRow
  return view.directoryFresh && view.authorable && view.cursor === draft.observedCursor
    && view.defaultId === draft.observedDefaultId
    && row !== undefined && row.id === original.id
    && row.trust === original.trust && row.isDefault === original.isDefault
    && row.name === original.name && row.description === original.description
    && row.broken === original.broken
    && (draft.kind === 'copy' ? row.id === draft.sourceId : row.id === draft.targetId)
}

export function validatePresetCopyDraft(
  draft: PresetDraft | null,
  reservedIds: ReadonlySet<string>,
): 'valid' | 'invalid' | 'exists' {
  if (draft?.kind !== 'copy') return 'invalid'
  if (draft.targetId.length === 0 || draft.targetId.trim().length === 0) return 'invalid'
  if (draft.sourceId === draft.targetId || reservedIds.has(draft.targetId)) return 'exists'
  return 'valid'
}

export function validPresetRemovalConfirmation(draft: PresetDraft | null): boolean {
  return draft?.kind === 'confirm-remove' && draft.confirmationText === draft.targetId
}

export function noticeForPresetResult(result: ContextManagerClientPresetMutationResult): PresetNotice | undefined {
  switch (result.status) {
    case 'applied': return { code: result.refresh === 'fresh' ? 'presetNoticeApplied' : 'presetNoticeDegraded',
      kind: result.refresh === 'fresh' ? 'success' : 'warning' }
    case 'unknown': return { code: 'presetNoticeUnknown', kind: 'warning' }
    case 'rejected': return { code: result.error.code === 'busy' ? 'presetNoticeBusy' : 'presetNoticeRejected', kind: 'warning' }
    case 'incompatible':
    case 'detached':
    case 'disposed': return { code: 'presetNoticeUnavailable', kind: 'warning' }
    case 'superseded': return undefined
  }
}

export function blockForPresetResult(result: ContextManagerClientPresetMutationResult): PresetDraftBlock | undefined {
  if (result.status === 'applied' && result.refresh === 'degraded') return 'unverified'
  if (result.status === 'unknown') return 'unknown'
  if (result.status === 'rejected' && result.error.kind === 'business') return 'refused'
  if (result.status === 'detached' || result.status === 'incompatible' || result.status === 'disposed') return 'stale'
  return undefined
}
