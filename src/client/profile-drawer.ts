import { createElement as h, useEffect, useRef } from 'react'
import type { ComposedProps } from '@deepseek-ai/dsh-client-ui-slots'

import {
  CONTEXT_MANAGER_LOCALE,
} from './locales.js'
import {
  mayDispatchImmediateProfileWrite,
  ownsLiveProfileDraft,
  isLiveDrawerOpenSession,
  mayApplyCurrentDraftEvent,
  mayApplyCurrentNavigationEvent,
  readLivePresentationForActions,
  terminalProfileNotice,
  type ContextManagerPresentationStoreHandle,
} from './presentation-store.js'
import type { ContextManagerClientBusinessFace } from './business-face.js'
import type { ContextManagerClientProfileMutationResult } from './mutation-types.js'
import type { ProfileDraft, ProfileEditField, ProfileNotice } from './profile-editor.js'
import {
  blockForMutationResult,
  createdProfileInput,
  editValueChanged,
  noticeForMutationResult,
  validateCreateDraft,
} from './profile-editor.js'
import {
  deriveProfileView,
  isProfileBeginCurrent,
  isProfileDraftCurrent,
  resolveProfilePreset,
  type ProfileListRow,
} from './profile-view.js'
import { ContextManagerPromptBindingSection } from './prompt-binding-section.js'
import { ContextManagerSkillPolicySection } from './skill-policy-section.js'
import { isPromptBindingDraft } from './prompt-binding-editor.js'
import { isSkillDraft } from './skill-policy-editor.js'
import styles from './plugin.module.css'

export type ContextManagerDrawerProps = ComposedProps<
  'shell.overlay',
  string,
  never,
  ContextManagerPresentationStoreHandle,
  ContextManagerClientBusinessFace,
  never,
  typeof CONTEXT_MANAGER_LOCALE
>

function button(
  label: string,
  onClick: () => void,
  disabled = false,
  variant: 'normal' | 'danger' = 'normal',
  attributes: Record<string, unknown> = {},
) {
  return h('button', {
    type: 'button',
    className: variant === 'danger' ? styles.danger : styles.button,
    disabled,
    onClick,
    ...attributes,
  }, label)
}

function fieldInput(
  id: string,
  value: string,
  onChange: (value: string) => void,
  disabled: boolean,
  multiline = false,
  list?: string,
) {
  const shared = {
    id,
    className: styles.input,
    value,
    disabled,
    onChange: (event: { currentTarget: { value: string } }) => onChange(event.currentTarget.value),
  }
  return multiline
    ? h('textarea', { ...shared, rows: 3 })
    : h('input', { ...shared, type: 'text', ...(list ? { list } : {}) })
}

function labelFor(id: string, text: string) {
  return h('label', { htmlFor: id, className: styles.label }, text)
}

/** Hook ownership is confined to this mounted child, never after the shell's early return. */
export function ContextManagerProfileDrawerContent(props: ContextManagerDrawerProps) {
  const { useStore, actions, t } = props
  const snapshot = props.useContextManager(s => s)
  const operation = props.useProfileMutation(s => s.profile)
  const renderedOpenSessionEpoch = useStore(s => s.openSessionEpoch)
  const requestedId = useStore(s => s.selectedProfileId)
  const draft = useStore(s => s.draft)
  const resourceDraft = useStore(s => s.resourceDraft)
  const notice = useStore(s => s.notice)
  const displayedNotice = terminalProfileNotice({ draft }) ?? notice
  const view = deriveProfileView(snapshot, requestedId)
  const running = operation.status === 'running'
  const canStart = view.writable && !running && draft === null && resourceDraft === null
  const draftCurrent = draft === null || isProfileDraftCurrent(snapshot, draft)
  const canSubmit = draft !== null && draft.blocked === undefined
    && !draft.submitting && draftCurrent && view.writable && !running
  const contentRef = useRef<HTMLElement | null>(null)
  const mounted = useRef(false)
  const latestSelection = useRef(view.selectedId)
  const latestDraftToken = useRef(draft?.token)
  const latestDraftBlock = useRef(draft?.blocked)
  latestSelection.current = view.selectedId
  latestDraftToken.current = draft?.token
  latestDraftBlock.current = draft?.blocked

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const panel = contentRef.current?.closest<HTMLElement>('[data-context-manager-drawer]')
    const previouslyFocused = document.activeElement
    panel?.focus()
    return () => {
      if (
        previouslyFocused instanceof HTMLElement
        && previouslyFocused.isConnected
      ) previouslyFocused.focus()
    }
  }, [])

  // This value is captured by each render's callbacks, not read afresh when
  // a pre-Close handler is invoked after a different Drawer opening.
  const ownsRenderSession = () => isLiveDrawerOpenSession(
    readLivePresentationForActions(actions), renderedOpenSessionEpoch,
  )
  const applyDraftEvent = (token: number, event: () => void): void => {
    if (mayApplyCurrentDraftEvent(actions, renderedOpenSessionEpoch, 'profiles', token)) event()
  }
  const notifyUnavailable = (): void => {
    actions.setNotice({ code: 'noticeUnavailable', kind: 'warning' })
  }
  const captureBasis = () => {
    if (!view.writable || running) {
      notifyUnavailable()
      return undefined
    }
    const basis = props.captureProfileMutationBasis()
    if (basis === undefined) notifyUnavailable()
    return basis
  }
  const notifyStaleBegin = () => {
    actions.setNotice({ code: 'noticeDraftStale', kind: 'warning' })
  }
  const startCreate = () => {
    if (!ownsRenderSession()) return
    if (draft !== null) {
      actions.setNotice({ code: 'noticeDraftActive', kind: 'warning' })
      return
    }
    const basis = captureBasis()
    if (!basis) return
    if (!isProfileBeginCurrent(snapshot, basis)) return notifyStaleBegin()
    actions.beginCreate(basis)
  }
  const startEdit = (row: ProfileListRow, field: ProfileEditField, original: string | undefined) => {
    if (!ownsRenderSession()) return
    if (row.id === '__proto__') return actions.setNotice({ code: 'noticeNotEditable', kind: 'warning' })
    if (draft !== null) {
      actions.setNotice({ code: 'noticeDraftActive', kind: 'warning' })
      return
    }
    const basis = captureBasis()
    if (!basis) return
    if (!isProfileBeginCurrent(snapshot, basis, row, field, original)) return notifyStaleBegin()
    actions.beginFieldEdit({ profileId: row.id, field, original, basis })
  }
  const startDelete = (row: ProfileListRow) => {
    if (!ownsRenderSession()) return
    if (row.id === '__proto__') return actions.setNotice({ code: 'noticeNotEditable', kind: 'warning' })
    if (draft !== null) {
      actions.setNotice({ code: 'noticeDraftActive', kind: 'warning' })
      return
    }
    const basis = captureBasis()
    if (!basis) return
    if (!isProfileBeginCurrent(snapshot, basis, row)) return notifyStaleBegin()
    actions.beginDelete(row.id, basis)
  }
  const afterMutation = (
    result: ContextManagerClientProfileMutationResult,
    originalDraft?: ProfileDraft,
    selectedIdOnFreshCreate?: string,
  ) => {
    const responseNotice = noticeForMutationResult(result)
    if (result.status === 'superseded') return
    if (originalDraft === undefined) {
      if (responseNotice !== undefined) actions.setNotice(responseNotice)
      return
    }
    if (result.status === 'applied') {
      actions.completeDraft(
        originalDraft.token,
        responseNotice ?? null,
        result.refresh === 'fresh' ? selectedIdOnFreshCreate : undefined,
      )
      return
    }
    const blocked = blockForMutationResult(result)
    if (blocked !== undefined) {
      actions.blockDraft(originalDraft.token, blocked, responseNotice ?? null)
      return
    }
    if (responseNotice !== undefined) actions.setNotice(responseNotice)
  }
  const commitDraft = async () => {
    const original = draft
    const live = readLivePresentationForActions(actions)
    if (!canSubmit || original === null
      || !isLiveDrawerOpenSession(live, renderedOpenSessionEpoch)
      || !ownsLiveProfileDraft(live, original)) return
    if (original.kind === 'create') {
      const validation = validateCreateDraft(original, new Set(view.rows.map(row => row.id)))
      if (validation !== 'valid') {
        actions.setNotice({ code: validation === 'exists'
          ? 'noticeProfileExists' : 'noticeInvalidInput', kind: 'warning' })
        return
      }
    }
    if (original.kind === 'edit-field' && !editValueChanged(original)) return
    // Claim this exact draft synchronously. Controller still owns Profile
    // global single-flight, Host CAS and authoritative rehydration.
    actions.beginProfileSubmission(original.token)
    const claimed = readLivePresentationForActions(actions)?.draft
    if (claimed?.token !== original.token || claimed.submitting !== true) return
    try {
      if (original.kind === 'create') {
        const result = await props.profileMutations.createProfile(
          original.basis, original.id, createdProfileInput(original),
        )
        afterMutation(result, original, original.id)
      } else if (original.kind === 'confirm-delete') {
        const result = await props.profileMutations.deleteProfile(original.basis, original.profileId)
        afterMutation(result, original)
      } else if (original.kind === 'edit-field') {
        let result: ContextManagerClientProfileMutationResult
        switch (original.field) {
          case 'name':
            result = await props.profileMutations.setProfileName(
              original.basis, original.profileId, original.value)
            break
          case 'description':
            result = await props.profileMutations.setProfileDescription(
              original.basis, original.profileId,
              original.removeDescription ? null : original.value)
            break
          case 'basePreset':
            result = await props.profileMutations.setProfileBasePreset(
              original.basis, original.profileId, original.value)
            break
        }
        afterMutation(result, original)
      }
    } catch (error) {
      // Unexpected rejected call remains non-retriable outcome-unknown.
      actions.blockDraft(original.token, 'unknown', {
        code: 'noticeOutcomeUnknown', kind: 'warning',
        detail: error instanceof Error ? error.message : undefined,
      })
    } finally {
      actions.finishProfileSubmission(original.token)
    }
  }
  const changeDefault = async (id: string | null) => {
    const live = readLivePresentationForActions(actions)
    if (!canStart || !isLiveDrawerOpenSession(live, renderedOpenSessionEpoch)
      || !mayDispatchImmediateProfileWrite(live, requestedId)) return
    const basis = captureBasis()
    if (!basis) return
    // Even an immediate default toggle carries an intent from this render.
    // A new Settings revision cannot authorize a stale clear/set decision.
    if (!isProfileBeginCurrent(snapshot, basis)) return notifyStaleBegin()
    afterMutation(await props.profileMutations.setDefaultProfile(basis, id))
  }

  const refresh = () => {
    const selectionAtStart = latestSelection.current
    const tokenAtStart = latestDraftToken.current
    const report = (code: 'noticeUnavailable' | 'noticeRefreshFailed') => {
      // A late read must never replace an outcome-unknown, conflict or
      // confirmed-but-degraded Binding mutation notice, nor publish into a
      // different selected Profile/closed tab/newer draft.
      if (!mounted.current
        || latestSelection.current !== selectionAtStart
        || latestDraftToken.current !== tokenAtStart
        || latestDraftBlock.current !== undefined) return
      actions.setNotice({
        code, kind: code === 'noticeRefreshFailed' ? 'error' : 'warning',
      })
    }
    void props.refresh().then(result => {
      if (result.status !== 'completed') report('noticeUnavailable')
    }).catch(() => {
      report('noticeRefreshFailed')
    })
  }

  const presetOptions = view.catalogAvailable
    ? h('datalist', { id: 'cm-profile-preset-choices' },
      ...view.presetRows.map(preset => h('option', {
        key: preset.id,
        value: preset.id,
        label: preset.name ?? preset.id,
      })),
    )
    : null

  const stateBanner = (() => {
    if (snapshot.attachment === 'detached') return t('hostDetached')
    if (snapshot.protocol.status === 'incompatible') return t('hostIncompatible')
    if (snapshot.protocol.status === 'checking' || snapshot.protocol.status === 'unchecked') {
      return t('hostChecking')
    }
    if (snapshot.protocol.status === 'error') return t('hostError')
    if (snapshot.profiles.status === 'loading' || snapshot.profiles.status === 'idle') {
      return t('loadingProfiles')
    }
    if (snapshot.profiles.status === 'error') return t('profilesReadError')
    if (!view.schemaCompatible) return t('schemaIncompatible')
    if (snapshot.profiles.stale) return t('profilesStale')
    if (view.persistence === 'unavailable') return t('persistenceUnavailable')
    if (view.persistence === 'read-only') return t('persistenceReadOnly')
    return null
  })()

  const createForm = draft?.kind === 'create'
    ? h('form', {
      className: styles.form,
      onSubmit: (event: { preventDefault(): void }) => {
        event.preventDefault()
        void commitDraft()
      },
    },
    h('h3', null, t('createTitle')),
    labelFor('cm-create-id', t('fieldId')),
    fieldInput('cm-create-id', draft.id, value => applyDraftEvent(draft.token, () => actions.updateCreate(draft.token, 'id', value)), !canSubmit),
    h('p', { className: styles.hint }, t('idImmutableHint')),
    labelFor('cm-create-name', t('fieldName')),
    fieldInput('cm-create-name', draft.name, value => applyDraftEvent(draft.token, () => actions.updateCreate(draft.token, 'name', value)), !canSubmit),
    labelFor('cm-create-description', t('fieldDescription')),
    fieldInput('cm-create-description', draft.description, value => applyDraftEvent(draft.token, () => actions.updateCreate(draft.token, 'description', value)), !canSubmit, true),
    labelFor('cm-create-preset', t('fieldBasePreset')),
    fieldInput('cm-create-preset', draft.basePreset, value => applyDraftEvent(draft.token, () => actions.updateCreate(draft.token, 'basePreset', value)), !canSubmit, false, view.catalogAvailable ? 'cm-profile-preset-choices' : undefined),
    h('p', { className: styles.hint }, t('createDefaultHint')),
    h('div', { className: styles.actions },
      h('button', { type: 'submit', className: styles.primary,
        disabled: !canSubmit || validateCreateDraft(draft, new Set(view.rows.map(row => row.id))) !== 'valid',
      }, t('create')),
      button(t('cancel'), () => applyDraftEvent(draft.token, () => actions.cancelDraft(draft.token)), running || draft.submitting === true),
    ),
    )
    : null

  const blockedBanner = draft !== null && (draft.blocked !== undefined || !draftCurrent)
    ? h('div', { role: 'alert', className: styles.warning },
      h('strong', null, t(
        draft.blocked === 'unknown' ? 'draftUnknown'
          : (isPromptBindingDraft(draft) || isSkillDraft(draft))
            && draft.blocked === 'unverified' ? 'noticeSavedDegraded'
            : (isPromptBindingDraft(draft) || isSkillDraft(draft))
              && draft.blocked === 'conflict' ? 'noticeConflict'
              : 'draftNeedsReload',
      )),
      h('p', null, t('draftPreservedHint')),
      h('div', { className: styles.actions },
        button(t('refresh'), refresh, running),
        button(t('discardDraft'), () => applyDraftEvent(draft.token, () => {
          if (draft.blocked !== undefined) actions.discardBlockedDraft(draft.token)
          else actions.cancelDraft(draft.token)
        }), running || draft.submitting === true),
      ),
    )
    : null

  const renderField = (
    row: ProfileListRow,
    field: ProfileEditField,
    label: string,
    value: string | undefined,
  ) => {
    const active = draft?.kind === 'edit-field'
      && draft.profileId === row.id
      && draft.field === field
    const fieldId = 'cm-edit-' + field
    return h('div', { key: field, className: styles.field },
      h('div', { className: styles.fieldHeader },
        h('span', { className: styles.label }, label),
        !active ? button(t('edit'), () => startEdit(row, field, value), !canStart || row.id === '__proto__') : null,
      ),
      active && draft?.kind === 'edit-field'
        ? h('form', {
          className: styles.form,
          onSubmit: (event: { preventDefault(): void }) => {
            event.preventDefault()
            void commitDraft()
          },
        },
        labelFor(fieldId, label),
        fieldInput(fieldId, draft.removeDescription ? '' : draft.value,
          next => applyDraftEvent(draft.token, () => actions.updateField(draft.token, next)), !canSubmit,
          field === 'description',
          field === 'basePreset' && view.catalogAvailable ? 'cm-profile-preset-choices' : undefined),
        field === 'description'
          ? button(t('removeDescription'), () => applyDraftEvent(draft.token, () => actions.markDescriptionRemoved(draft.token)),
            !canSubmit || draft.original === undefined)
          : null,
        draft.removeDescription
          ? h('p', { className: styles.hint }, t('descriptionRemovalPending'))
          : null,
        h('div', { className: styles.actions },
          h('button', { type: 'submit', className: styles.primary,
            disabled: !canSubmit || !editValueChanged(draft),
          }, t('save')),
          button(t('cancel'), () => applyDraftEvent(draft.token, () => actions.cancelDraft(draft.token)), running || draft.submitting === true),
        ),
        )
        : h('p', { className: styles.value }, value === undefined
          ? t('notSet') : (value === '' ? t('emptyValue') : value)),
    )
  }

  const selected = view.selected
  const detail = draft?.kind === 'create'
    ? createForm
    : selected === undefined
      ? h('div', { className: styles.empty },
        t(view.canRead ? 'selectOrCreateProfile' : 'waitForProfiles'),
      )
      : h('div', { className: styles.detail },
        h('div', { className: styles.detailHeading },
          h('h3', null, selected.kind === 'usable'
            ? selected.profile?.name || selected.id
            : selected.id),
          selected.configuredDefault ? h('span', { className: styles.tag }, t('defaultLabel')) : null,
        ),
        h('div', { className: styles.field },
          h('span', { className: styles.label }, t('fieldId')),
          h('code', { className: styles.value }, selected.id),
          h('p', { className: styles.hint }, t('idImmutableHint')),
        ),
        selected.kind === 'invalid'
          ? h('div', { className: styles.warning, role: 'status' },
            h('strong', null, t('invalidProfile')),
            h('p', null, selected.diagnostic?.message ?? t('invalidProfile')),
            h('p', null, t('invalidStoredHint')),
          )
          : selected.profile === undefined ? null
            : h('div', { className: styles.form },
              renderField(selected, 'name', t('fieldName'), selected.profile.name),
              renderField(selected, 'description', t('fieldDescription'), selected.profile.description),
              renderField(selected, 'basePreset', t('fieldBasePreset'), selected.profile.basePreset),
              h('div', { className: styles.presetInfo },
                h('span', { className: styles.label }, t('presetStatus')),
                h('span', null, t(({
                  resolved: 'presetResolved',
                  missing: 'presetMissing',
                  broken: 'presetBroken',
                  unavailable: 'presetUnavailable',
                  unverified: 'presetUnverified',
                } as const)[resolveProfilePreset(snapshot, selected.id)])),
              ),
              h(ContextManagerSkillPolicySection, {
                ...props, profileId: selected.id, profile: selected.profile,
                writable: view.writable,
              }),
              h(ContextManagerPromptBindingSection, {
                ...props, profileId: selected.id, profile: selected.profile,
                writable: view.writable,
              }),
            ),
        draft?.kind === 'confirm-delete' && draft.profileId === selected.id
          ? h('section', { className: styles.warning, role: 'group', 'aria-label': t('deleteConfirmTitle') },
            h('strong', null, t('deleteConfirmTitle')),
            h('p', null, t('deleteConfirmHint')),
            selected.configuredDefault
              ? h('p', null, t('deleteDefaultHint')) : null,
            h('div', { className: styles.actions },
              button(t('confirmDelete'), () => { void commitDraft() }, !canSubmit, 'danger'),
              button(t('cancel'), () => applyDraftEvent(draft.token, () => actions.cancelDraft(draft.token)), running || draft.submitting === true),
            ),
          )
          : h('div', { className: styles.actions },
            selected.kind === 'usable'
              ? button(
                selected.configuredDefault ? t('clearDefault') : t('makeDefault'),
                () => { void changeDefault(selected.configuredDefault ? null : selected.id) },
                !canStart,
              ) : null,
            button(t('deleteProfile'), () => startDelete(selected), !canStart || selected.id === '__proto__', 'danger'),
          ),
      )

  const notices = displayedNotice !== null
    ? h('div', {
      className: displayedNotice.kind === 'error' ? styles.error
        : displayedNotice.kind === 'warning' ? styles.warning : styles.success,
      role: displayedNotice.kind === 'error' ? 'alert' : 'status',
      'aria-live': 'polite',
    },
    h('strong', null, t(displayedNotice.code)),
    displayedNotice.detail ? h('p', null, displayedNotice.detail) : null,
    ) : null

  return h('div', { className: styles.content, ref: contentRef },
    h('div', { className: styles.toolbar },
      h('strong', null, t('profilesTitle')),
      button(t('refresh'), refresh, snapshot.sync.status === 'syncing'),
    ),
    stateBanner !== null ? h('div', { className: styles.warning, role: 'status' }, stateBanner) : null,
    snapshot.sync.status === 'syncing'
      ? h('p', { className: styles.hint, role: 'status' }, t('syncing')) : null,
    running
      ? h('p', { className: styles.hint, role: 'status' }, operation.phase === 'mutating'
        ? t('saving') : t('refreshingAfterSave')) : null,
    notices,
    blockedBanner,
    presetOptions,
    view.configuredDefaultProfileId !== undefined
      && !view.rows.some(row => row.usableDefault)
      ? h('div', { className: styles.warning },
        h('span', null, t('invalidDefaultReference') + ': ' + view.configuredDefaultProfileId),
        button(t('clearDefault'), () => { void changeDefault(null) }, !canStart),
      ) : null,
    h('div', { className: styles.columns },
      h('nav', { className: styles.profileList, 'aria-label': t('profilesTitle') },
        button(t('newProfile'), startCreate, !canStart, 'normal', { 'data-context-manager-new-profile': '' }),
        view.rows.length === 0
          ? h('p', { className: styles.empty },
            view.canRead && view.schemaCompatible ? t('noProfiles') : t('waitForProfiles'))
          : h('ul', { className: styles.profileItems },
            ...view.rows.map(row => h('li', { key: row.id },
              h('button', {
                type: 'button',
                className: row.id === view.selectedId ? styles.selectedRow : styles.profileRow,
                'aria-current': row.id === view.selectedId ? 'true' : undefined,
                disabled: draft !== null && row.id !== view.selectedId,
                onClick: () => {
                  if (mayApplyCurrentNavigationEvent(actions, renderedOpenSessionEpoch, 'profiles')) {
                    actions.selectProfile(row.id)
                  }
                },
              },
              h('span', { className: styles.rowTitle }, row.profile?.name || row.id),
              row.configuredDefault ? h('span', { className: styles.tag }, t('defaultLabel')) : null,
              row.kind === 'invalid' ? h('span', { className: styles.tag }, t('invalidProfile')) : null,
              ),
            )),
          ),
      ),
      h('section', { className: styles.detailPanel, 'aria-label': t('profileDetails') },
        detail,
      ),
    ),
    view.diagnostics.length > 0
      ? h('section', { className: styles.diagnostics },
        h('h3', null, t('diagnosticsTitle')),
        h('ul', null, ...view.diagnostics.map((d, index) => h('li', {
          key: d.code + ':' + (d.profileId ?? '') + ':' + index,
        }, h('strong', null, d.code), ': ', d.message))),
      ) : null,
    h('p', { className: styles.hint }, t('noSessionDiagnosticsHint')),
  )
}
