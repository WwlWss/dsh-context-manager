import type {
  ContextManagerRemoteDiagnostic,
  ContextManagerRemotePresetRow,
  ContextManagerRemoteProfile,
} from '../remote/types.js'
import type { ContextManagerClientSnapshot } from './model-types.js'
import type { ProfileDraft } from './profile-editor.js'

export interface ProfileListRow {
  readonly id: string
  readonly kind: 'usable' | 'invalid'
  readonly profile?: ContextManagerRemoteProfile
  readonly diagnostic?: ContextManagerRemoteDiagnostic
  readonly configuredDefault: boolean
  readonly usableDefault: boolean
}

export type ProfilePresetResolution =
  | 'resolved' | 'missing' | 'broken' | 'unavailable' | 'unverified'

export interface ProfileView {
  readonly rows: readonly ProfileListRow[]
  readonly selectedId?: string
  readonly selected?: ProfileListRow
  readonly writable: boolean
  readonly canRead: boolean
  readonly schemaCompatible: boolean
  readonly configuredDefaultProfileId?: string
  readonly diagnostics: readonly ContextManagerRemoteDiagnostic[]
  readonly presetRows: readonly ContextManagerRemotePresetRow[]
  readonly catalogAvailable: boolean
  readonly persistence: 'unavailable' | 'read-only' | 'writable' | 'not-ready'
}

export function deriveProfileView(
  snapshot: ContextManagerClientSnapshot,
  requestedId: string | null,
): ProfileView {
  const ready = snapshot.profiles.status === 'ready' && snapshot.profiles.data !== undefined
  const data = snapshot.profiles.data
  const rows: ProfileListRow[] = []

  if (ready && data !== undefined && data.schemaCompatible) {
    for (const [id, profile] of Object.entries(data.profiles)) {
      rows.push({
        id,
        kind: 'usable',
        profile,
        configuredDefault: id === data.configuredDefaultProfileId,
        usableDefault: id === data.usableDefaultProfileId,
      })
    }
    for (const diagnostic of data.diagnostics) {
      if (
        diagnostic.code !== 'invalid-profile'
        || diagnostic.profileId === undefined
        || Object.hasOwn(data.profiles, diagnostic.profileId)
        || rows.some(row => row.id === diagnostic.profileId)
      ) continue
      rows.push({
        id: diagnostic.profileId,
        kind: 'invalid',
        diagnostic,
        configuredDefault: diagnostic.profileId === data.configuredDefaultProfileId,
        usableDefault: false,
      })
    }
  }

  rows.sort((a, b) =>
    Number(b.configuredDefault) - Number(a.configuredDefault)
    || a.id.localeCompare(b.id)
  )

  const selectedId = requestedId !== null && rows.some(row => row.id === requestedId)
    ? requestedId
    : rows.find(row => row.usableDefault)?.id ?? rows[0]?.id
  const selected = rows.find(row => row.id === selectedId)

  const validAuthority = snapshot.instanceId !== undefined
    && snapshot.instanceId === snapshot.changes?.instanceId
  const writable = ready
    && !snapshot.profiles.stale
    && snapshot.attachment === 'attached'
    && snapshot.protocol.status === 'compatible'
    && validAuthority
    && data?.schemaCompatible === true
    && data.persistence.available
    && data.persistence.registered
    && data.persistence.writable
    && data.persistence.revision !== undefined

  let persistence: ProfileView['persistence'] = 'not-ready'
  if (ready && data !== undefined) {
    persistence = !data.persistence.available || !data.persistence.registered
      ? 'unavailable'
      : data.persistence.writable ? 'writable' : 'read-only'
  }

  const presets = snapshot.presets
  const catalogAvailable = presets.status === 'ready'
    && !presets.stale
    && presets.data?.directory.status === 'available'

  return {
    rows,
    selectedId,
    selected,
    writable,
    canRead: ready,
    schemaCompatible: data?.schemaCompatible === true,
    configuredDefaultProfileId: data?.configuredDefaultProfileId,
    diagnostics: data?.diagnostics ?? [],
    presetRows: catalogAvailable && presets.data?.directory.status === 'available'
      ? presets.data.directory.presets
      : [],
    catalogAvailable,
    persistence,
  }
}

export function resolveProfilePreset(
  snapshot: ContextManagerClientSnapshot,
  profileId: string,
): ProfilePresetResolution {
  if (snapshot.presets.status !== 'ready' || snapshot.presets.stale) return 'unverified'
  const data = snapshot.presets.data
  if (data === undefined || data.directory.status === 'unavailable') return 'unavailable'
  return data.profiles[profileId]?.basePreset.status ?? 'unverified'
}

export function isProfileDraftCurrent(
  snapshot: ContextManagerClientSnapshot,
  draft: ProfileDraft,
): boolean {
  const profiles = snapshot.profiles
  return snapshot.attachment === 'attached'
    && snapshot.protocol.status === 'compatible'
    && profiles.status === 'ready'
    && !profiles.stale
    && profiles.data?.schemaCompatible === true
    && profiles.data.persistence.writable
    && snapshot.instanceId !== undefined
    && snapshot.instanceId === snapshot.changes?.instanceId
    && draft.basis.instanceId === snapshot.instanceId
    && draft.basis.revision === profiles.data.persistence.revision
}
