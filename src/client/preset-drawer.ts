import { createElement as h, useEffect, useRef, useState } from 'react'
import type { ContextManagerDrawerProps } from './profile-drawer.js'
import type { PresetDraft, PresetNotice } from './preset-editor.js'
import {
  blockForPresetResult,
  derivePresetView,
  isPresetDraftCurrent,
  noticeForPresetResult,
  validatePresetCopyDraft,
  validPresetRemovalConfirmation,
} from './preset-editor.js'
import {
  isLiveDrawerOpenSession,
  mayApplyCurrentDraftEvent,
  mayApplyCurrentNavigationEvent,
  ownsLivePresetDraft,
  readLivePresentationForActions,
  terminalPresetNotice,
} from './presentation-store.js'
import styles from './plugin.module.css'

function button(label: string, onClick: () => void, disabled = false,
  danger = false, attrs: Record<string, unknown> = {}) {
  return h('button', {
    type: 'button', className: danger ? styles.danger : styles.button,
    onClick, disabled, ...attrs,
  }, label)
}

function field(id: string, label: string, value: string, onChange: (v: string) => void, disabled = false) {
  return h('div', { className: styles.field },
    h('label', { className: styles.label, htmlFor: id }, label),
    h('input', {
      type: 'text', className: styles.input, id, value, disabled,
      onChange: (event: { currentTarget: { value: string } }) => onChange(event.currentTarget.value),
    }),
  )
}

/**
 * Native AgentPreset is **not** a Profile or Resource. The Renderer receives
 * a frozen two-method Preset business projection and an explicit composition
 * view lease. Neither a native write nor a sensitive read is ever dispatched
 * by mount, selection or baseline hydration.
 */
export function ContextManagerPresetDrawerContent(props: ContextManagerDrawerProps) {
  const { actions, useStore, t } = props
  const snapshot = props.useContextManager(s => s)
  const operation = props.usePresetMutation(s => s.preset)
  const renderedOpenSessionEpoch = useStore(s => s.openSessionEpoch)
  const requestedId = useStore(s => s.selectedPresetId)
  const draft = useStore(s => s.presetDraft)
  const notice = useStore(s => s.presetNotice)
  const profileDraft = useStore(s => s.draft)
  const resourceDraft = useStore(s => s.resourceDraft)
  const view = derivePresetView(snapshot, requestedId)
  const selectedId = view.selectedId
  const mounted = useRef(false)
  const latestEffectiveId = useRef(selectedId)
  const committing = useRef<number | null>(null)
  const viewLease = useRef<{ readonly id: string; readonly leaseId: number } | null>(null)
  const [shownLease, setShownLease] = useState<number | null>(null)
  latestEffectiveId.current = selectedId

  // Each mounted Pane owns only the exact one explicitly requested body.
  // Releasing an obsolete lease cannot clear a newer view opened elsewhere.
  const releaseView = () => {
    const old = viewLease.current
    viewLease.current = null
    if (old) props.releaseNativePresetView(old.leaseId)
  }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      releaseView()
    }
  }, [])
  useEffect(() => {
    return () => {
      if (viewLease.current?.id === selectedId) releaseView()
    }
  }, [selectedId])

  const ownsOpening = () => mounted.current
    && mayApplyCurrentNavigationEvent(actions, renderedOpenSessionEpoch, 'presets')
  const ownsSelection = () => {
    const live = readLivePresentationForActions(actions)
    const actual = props.readCurrentPresetState()
    const fresh = derivePresetView(actual, live?.selectedPresetId ?? null)
    const original = view.selected
    const current = fresh.selected
    // A retained, enabled React callback cannot inherit authority from a
    // detached Host, a changed authorability hint or an identically keyed row
    // whose native metadata has changed before the next React render.
    return ownsOpening()
      && live?.selectedPresetId === requestedId
      && fresh.directoryFresh
      && actual.instanceId === snapshot.instanceId
      && fresh.selectedId === selectedId
      && fresh.cursor === view.cursor
      && fresh.defaultId === view.defaultId
      && fresh.authorable === view.authorable
      && original !== undefined && current !== undefined
      && original.id === current.id
      && original.trust === current.trust
      && original.isDefault === current.isDefault
      && original.name === current.name
      && original.description === current.description
      && original.broken === current.broken
      && latestEffectiveId.current === selectedId
      && actual.changes?.presets === snapshot.changes?.presets
  }
  const applyDraft = (token: number, action: () => void) => {
    if (mounted.current && mayApplyCurrentDraftEvent(
      actions, renderedOpenSessionEpoch, 'presets', token,
    )) action()
  }
  const running = operation.status === 'running'
  const canBegin = !running && profileDraft === null && resourceDraft === null && draft === null
    && view.directoryFresh && selectedId !== undefined

  const select = (id: string) => {
    if (!ownsOpening()) return
    const liveDirectory = derivePresetView(props.readCurrentPresetState(), requestedId)
    if (!liveDirectory.directoryFresh || !liveDirectory.rows.some(row => row.id === id)) return
    if (viewLease.current !== null) {
      releaseView()
      setShownLease(null)
    }
    actions.selectPreset(id)
  }
  const refresh = () => {
    if (!ownsOpening()) return
    releaseView()
    setShownLease(null)
    void props.refreshNativePresets().then(outcome => {
      if (outcome.status !== 'completed' && ownsOpening()) {
        actions.setPresetNotice({ code: 'presetNoticeUnavailable', kind: 'warning' })
      }
    }).catch(() => {
      if (ownsOpening()) actions.setPresetNotice({ code: 'presetNoticeReadFailed', kind: 'warning' })
    })
  }

  const viewComposition = () => {
    if (!ownsSelection() || !view.canViewComposition || selectedId === undefined) return
    releaseView()
    const claim = props.beginNativePresetView(selectedId)
    viewLease.current = { id: selectedId, leaseId: claim.leaseId }
    setShownLease(claim.leaseId)
    // A revoked read normally resolves with superseded/detached/disposed;
    // catching only rejected promises would leave this View loading forever.
    // Settle only the exact local lease: a late result may never erase a newer View.
    const retireView = (code: 'presetNoticeReadFailed' | 'presetNoticeUnavailable') => {
      if (viewLease.current?.leaseId !== claim.leaseId) return
      releaseView()
      if (!mounted.current) return
      setShownLease(null)
      if (ownsOpening()) actions.setPresetNotice({ code, kind: 'warning' })
    }
    void claim.result.then(outcome => {
      if (outcome.status !== 'completed') {
        retireView(outcome.status === 'superseded'
          ? 'presetNoticeReadFailed' : 'presetNoticeUnavailable')
      }
    }).catch(() => retireView('presetNoticeReadFailed'))
  }
  const startCopy = () => {
    if (!canBegin || !view.canCopy || !ownsSelection()
      || view.selected === undefined || view.cursor === undefined
      || view.defaultId === undefined || snapshot.instanceId === undefined) return
    actions.beginPresetCopy(view.selected, view.cursor, view.defaultId, snapshot.instanceId)
  }
  const startRemove = () => {
    if (!canBegin || !view.canRemove || !ownsSelection()
      || view.selected === undefined || view.cursor === undefined
      || view.defaultId === undefined || snapshot.instanceId === undefined) return
    actions.beginPresetRemove(view.selected, view.cursor, view.defaultId, snapshot.instanceId)
  }

  const commit = async () => {
    const original = draft
    const live = readLivePresentationForActions(actions)
    const selected = original?.kind === 'copy' ? original.sourceId : original?.targetId
    if (original === null || !mounted.current || running || committing.current !== null
      || !isLiveDrawerOpenSession(live, renderedOpenSessionEpoch)
      || !ownsLivePresetDraft(live, original) || live?.selectedPresetId !== selected) return

    const liveModel = props.readCurrentPresetState()
    const now = derivePresetView(liveModel, live?.selectedPresetId ?? null)
    // A live capability may be withdrawn without a Preset cursor change.
    // Reject both a stale row and a stale Copy/Remove authorization before
    // the controller can dispatch the native RPC.
    if (now.selectedId !== selected || !isPresetDraftCurrent(liveModel, original)
      || (original.kind === 'copy' ? !now.canCopy : !now.canRemove)) {
      actions.setPresetNotice({ code: 'presetNoticeStale', kind: 'warning' })
      return
    }
    if (original.kind === 'copy') {
      const validity = validatePresetCopyDraft(original, new Set(now.rows.map(row => row.id)))
      if (validity !== 'valid') {
        actions.setPresetNotice({
          code: validity === 'exists' ? 'presetNoticeExists' : 'presetNoticeInvalid', kind: 'warning',
        })
        return
      }
    } else if (!validPresetRemovalConfirmation(original)) {
      actions.setPresetNotice({ code: 'presetNoticeConfirmMismatch', kind: 'warning' })
      return
    }
    actions.beginPresetSubmission(original.token)
    const claimed = readLivePresentationForActions(actions)?.presetDraft
    if (claimed?.token !== original.token || claimed.submitting !== true) return
    committing.current = original.token

    try {
      // The Model Preset Controller claims an independent global single-flight.
      // The UI cannot retry an RPC with an unknown or degraded result.
      const result = original.kind === 'copy'
        ? await props.presetMutations.copyPreset(
          original.sourceId, original.targetId,
          original.nameMode === 'inherit' ? null : original.explicitName,
        )
        : await props.presetMutations.removePreset(original.targetId)
      if (result.status === 'superseded') return
      const notice = noticeForPresetResult(result) ?? null
      const blocked = blockForPresetResult(result)
      if (result.status === 'applied' && result.refresh === 'fresh') {
        actions.completePresetDraft(original.token, notice,
          original.kind === 'copy' ? original.targetId : null)
        return
      }
      if (blocked !== undefined) {
        actions.blockPresetDraft(original.token, blocked, notice)
        return
      }
      if (notice) actions.setPresetNotice(notice)
    } catch {
      // Rejected Promise after dispatch cannot prove that native files stayed untouched.
      actions.blockPresetDraft(original.token, 'unknown', {
        kind: 'warning', code: 'presetNoticeUnknown',
      })
    } finally {
      actions.finishPresetSubmission(original.token)
      if (committing.current === original.token) committing.current = null
    }
  }

  const noticeNow: PresetNotice | undefined = terminalPresetNotice({ presetDraft: draft })
    ?? notice ?? undefined
  const noticeElement = noticeNow ? h('div', {
    role: noticeNow.kind === 'error' ? 'alert' : 'status',
    className: noticeNow.kind === 'success' ? styles.success : styles.warning,
  }, t(noticeNow.code)) : null

  const activeDraft = draft as PresetDraft | null
  const draftCurrent = activeDraft !== null && isPresetDraftCurrent(snapshot, activeDraft)
  const canSubmit = activeDraft !== null && draftCurrent && activeDraft.blocked === undefined
    && !activeDraft.submitting && !running && view.directoryFresh && profileDraft === null
    && resourceDraft === null

  const blockedElement = activeDraft && (activeDraft.blocked !== undefined || !draftCurrent)
    ? h('section', { className: styles.warning, role: 'alert' },
      h('strong', null, t(activeDraft.blocked === 'unknown' ? 'presetNoticeUnknown'
        : activeDraft.blocked === 'unverified' ? 'presetNoticeDegraded'
          : activeDraft.blocked === 'refused' ? 'presetNoticeRejected' : 'presetNoticeStale')),
      h('p', { className: styles.hint }, t('presetDraftBlockedHint')),
      h('div', { className: styles.actions },
        button(t('refresh'), refresh, running),
        button(t('discardDraft'), () => applyDraft(activeDraft.token, () => {
          if (activeDraft.blocked !== undefined) actions.discardBlockedPresetDraft(activeDraft.token)
          else actions.cancelPresetDraft(activeDraft.token)
        }), running || activeDraft.submitting === true),
      ),
    ) : null

  const copyDraft = activeDraft?.kind === 'copy' ? activeDraft : null
  const copyPanel = copyDraft
    ? h('form', {
      className: styles.form,
      'data-context-manager-preset-copy-form': '',
      onSubmit: (event: { preventDefault(): void }) => { event.preventDefault(); void commit() },
    },
    h('h3', null, t('presetCopyTitle')),
    h('code', null, copyDraft.sourceId),
    field('cm-preset-copy-id', t('presetCopyTarget'), copyDraft.targetId,
      value => applyDraft(copyDraft.token, () => actions.updatePresetCopy(copyDraft.token, 'targetId', value)),
      !canSubmit),
    h('div', { className: styles.field },
      h('label', { htmlFor: 'cm-preset-copy-name-mode', className: styles.label }, t('presetCopyNameMode')),
      h('select', {
        id: 'cm-preset-copy-name-mode',
        className: styles.input,
        value: copyDraft.nameMode, disabled: !canSubmit,
        onChange: (event: { currentTarget: { value: string } }) => {
          const mode = event.currentTarget.value
          if (mode === 'inherit' || mode === 'explicit') applyDraft(copyDraft.token,
            () => actions.setPresetNameMode(copyDraft.token, mode))
        },
      },
      h('option', { value: 'inherit' }, t('presetCopyNameInherit')),
      h('option', { value: 'explicit' }, t('presetCopyNameExplicit')),
      ),
    ),
    copyDraft.nameMode === 'explicit'
      ? field('cm-preset-copy-name', t('presetCopyExplicitName'), copyDraft.explicitName,
        value => applyDraft(copyDraft.token, () => actions.updatePresetCopy(copyDraft.token, 'explicitName', value)),
        !canSubmit)
      : null,
    h('div', { className: styles.actions },
      h('button', {
        type: 'submit', className: styles.primary,
        'data-context-manager-preset-copy-submit': '',
        disabled: !canSubmit || validatePresetCopyDraft(
          copyDraft, new Set(view.rows.map(row => row.id)),
        ) !== 'valid',
      }, t('presetCopy')),
      button(t('cancel'), () => applyDraft(copyDraft.token,
        () => actions.cancelPresetDraft(copyDraft.token)), !canSubmit),
    ),
    ) : null

  const removeDraft = activeDraft?.kind === 'confirm-remove' ? activeDraft : null
  const removePanel = removeDraft
    ? h('section', { className: styles.warning, role: 'group', 'aria-label': t('presetRemoveTitle') },
      h('h3', null, t('presetRemoveTitle')),
      h('p', null, t('presetRemoveHint')),
      h('code', null, removeDraft.targetId),
      field('cm-preset-remove-confirm', t('presetRemoveConfirm'), removeDraft.confirmationText,
        value => applyDraft(removeDraft.token,
          () => actions.updatePresetRemoveConfirmation(removeDraft.token, value)),
        !canSubmit),
      h('div', { className: styles.actions },
        button(t('presetRemove'), () => { void commit() },
          !canSubmit || !validPresetRemovalConfirmation(removeDraft), true,
          { 'data-context-manager-preset-remove-submit': '' }),
        button(t('cancel'), () => applyDraft(removeDraft.token,
          () => actions.cancelPresetDraft(removeDraft.token)), !canSubmit),
      ),
    ) : null

  const body = selectedId === undefined ? undefined : snapshot.nativePresetDocuments?.get(selectedId)
  const leased = selectedId !== undefined && viewLease.current?.id === selectedId
    && viewLease.current?.leaseId === shownLease
  const visibleBody = leased && view.directoryFresh && body?.status === 'ready' && !body.stale
    && body.data?.id === selectedId ? body.data.content : undefined

  const detail = copyPanel ?? removePanel ?? (view.selected === undefined
    ? h('p', { className: styles.empty }, t('presetNoItems'))
    : h('div', { className: styles.detail },
      h('h3', null, view.selected.name ?? view.selected.id),
      h('div', { className: styles.field },
        h('span', { className: styles.label }, t('fieldId')),
        h('code', { className: styles.value }, view.selected.id),
      ),
      view.selected.description !== undefined
        ? h('div', { className: styles.field },
          h('span', { className: styles.label }, t('fieldDescription')),
          h('p', { className: styles.value }, view.selected.description),
        ) : null,
      view.selected.broken !== undefined
        ? h('p', { className: styles.warning, role: 'status' },
          t('presetBrokenRow'), ': ', view.selected.broken)
        : null,
      h('div', { className: styles.actions },
        button(t('presetView'), viewComposition, !view.canViewComposition,
          false, { 'data-context-manager-preset-view': '' }),
        button(t('presetCopy'), startCopy, !canBegin || !view.canCopy,
          false, { 'data-context-manager-preset-copy': '' }),
        button(t('presetRemove'), startRemove, !canBegin || !view.canRemove,
          true, { 'data-context-manager-preset-remove': '' }),
      ),
      leased ? h('section', { className: styles.field },
        h('strong', null, t('presetReadOnlyContent')),
        h('p', { className: styles.hint }, t('presetContentHint')),
        visibleBody !== undefined
          ? h('pre', { className: styles.resourceBody, 'data-context-manager-preset-body': '' }, visibleBody)
          : h('p', { className: styles.hint, role: 'status' },
            body?.status === 'error' ? t('presetBodyFailed') : t('presetBodyLoading')),
      ) : null,
    ))
  const status = snapshot.attachment === 'detached' ? t('hostDetached')
    : snapshot.protocol.status === 'incompatible' ? t('hostIncompatible')
      : !view.directoryAvailable ? t('presetUnavailable')
        : !view.directoryFresh ? t('presetDirectoryStale')
          : !view.authorable ? t('presetAuthoringUnavailable')
            : null

  return h('div', { className: styles.content, 'data-context-manager-preset-editor': '' },
    h('div', { className: styles.toolbar },
      h('strong', null, t('presetsTitle')),
      button(t('refresh'), refresh, running),
    ),
    status ? h('p', { className: styles.warning, role: 'status' }, status) : null,
    running ? h('p', { className: styles.hint, role: 'status' },
      t(operation.phase === 'mutating' ? 'saving' : 'refreshingAfterSave')) : null,
    noticeElement,
    blockedElement,
    h('div', { className: styles.columns },
      h('nav', { className: styles.profileList, 'aria-label': t('presetDirectory') },
        view.rows.length === 0 ? h('p', { className: styles.empty }, t('presetNoItems'))
          : h('ul', { className: styles.profileItems },
            ...view.rows.map(row => h('li', { key: row.id },
              h('button', {
                type: 'button',
                className: row.id === selectedId ? styles.selectedRow : styles.profileRow,
                disabled: activeDraft !== null && row.id !== selectedId,
                'aria-current': row.id === selectedId ? 'true' : undefined,
                'data-context-manager-preset-row': row.id,
                onClick: () => select(row.id),
              },
              h('span', { className: styles.rowTitle }, row.name ?? row.id),
              h('span', { className: styles.tag },
                t(row.trust === 'system' ? 'presetSystem' : 'presetUser')),
              row.isDefault ? h('span', { className: styles.tag }, t('presetDefault')) : null,
              row.broken !== undefined
                ? h('span', { className: styles.tag }, t('presetBrokenRow')) : null,
              ),
            )),
          ),
      ),
      h('section', { className: styles.detailPanel, 'aria-label': t('presetReadOnlyContent') },
        detail,
      ),
    ),
  )
}
