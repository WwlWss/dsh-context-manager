import { createElement as h, useEffect, useRef } from 'react'
import type { ContextManagerDrawerProps } from './profile-drawer.js'
import type { ResourceDraft, ResourceNotice } from './resource-editor.js'
import {
  blockForResourceMutationResult,
  commitResourceDraft,
  deriveResourceView,
  isResourceBeginCurrent,
  isResourceCreateBeginCurrent,
  isResourceDraftCurrent,
  noticeForResourceMutationResult,
  resourceEditChanges,
  validateResourceCreateDraft,
} from './resource-editor.js'
import { isLiveDrawerOpenSession, mayApplyCurrentDraftEvent, mayApplyCurrentNavigationEvent, ownsLiveResourceDraft, readLivePresentationForActions, terminalResourceNotice } from './presentation-store.js'
import styles from './plugin.module.css'

function button(
  title: string,
  onClick: () => void,
  disabled = false,
  danger = false,
  attributes: Record<string, unknown> = {},
) {
  return h('button', {
    type: 'button',
    className: danger ? styles.danger : styles.button,
    disabled, onClick, ...attributes,
  }, title)
}

function field(
  id: string, label: string, value: string, set: (value: string) => void,
  disabled: boolean, multiline = false,
) {
  const shared = {
    id, value, disabled,
    className: multiline ? `${styles.input} ${styles.resourceTextarea}` : styles.input,
    onChange: (event: { currentTarget: { value: string } }) => set(event.currentTarget.value),
  }
  return h('div', { className: styles.field },
    h('label', { className: styles.label, htmlFor: id }, label),
    multiline
      ? h('textarea', { ...shared, rows: 12 })
      : h('input', { ...shared, type: 'text' }),
  )
}

/** Resource editing lives on the existing retained Renderer seam, not a new store. */
export function ContextManagerResourceDrawerContent(props: ContextManagerDrawerProps) {
  const { useStore, actions, t } = props
  const snapshot = props.useContextManager(s => s)
  const operation = props.useResourceMutation(s => s.resource)
  const renderedOpenSessionEpoch = useStore(s => s.openSessionEpoch)
  const requestedId = useStore(s => s.selectedResourceId)
  const draft = useStore(s => s.resourceDraft)
  const profileDraft = useStore(s => s.draft)
  const notice = useStore(s => s.resourceNotice)
  const displayedNotice = terminalResourceNotice({ resourceDraft: draft }) ?? notice
  const view = deriveResourceView(snapshot, requestedId)
  const running = operation.status === 'running'
  const canStart = view.writable && !running && draft === null && profileDraft === null
  const draftCurrent = draft === null || isResourceDraftCurrent(snapshot, draft)
  const canSubmit = draft !== null && draft.blocked === undefined
    && !draft.submitting && draftCurrent && view.writable && !running
  const selectedId = view.selectedId
  const mounted = useRef(false)
  const latestSelection = useRef(selectedId)
  const latestDraftToken = useRef(draft?.token)
  const latestDraftBlock = useRef(draft?.blocked)
  const committing = useRef<number | null>(null)
  latestSelection.current = selectedId
  latestDraftToken.current = draft?.token
  latestDraftBlock.current = draft?.blocked

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // Ignore errors from an obsolete mounted tab / selected row / superseded draft.
  // A read failure cannot overwrite the uncertain/conflict/degraded write notice.
  const reportReadFailure = (
    selectedAtStart: string | undefined,
    tokenAtStart: number | undefined,
    code: 'resourceNoticeRefreshFailed' | 'resourceNoticeUnavailable',
  ) => {
    if (!mounted.current || latestSelection.current !== selectedAtStart
      || latestDraftToken.current !== tokenAtStart
      || latestDraftBlock.current !== undefined) return
    actions.setResourceNotice({ code, kind: 'warning' })
  }

  // This tab does not add polling or an eager Resource document roster.
  useEffect(() => {
    let active = true
    const startToken = latestDraftToken.current
    void props.loadPromptResourceList().catch(() => {
      if (active) reportReadFailure(selectedId, startToken, 'resourceNoticeRefreshFailed')
    })
    return () => { active = false }
  }, [props.loadPromptResourceList])

  useEffect(() => {
    if (view.selected?.status !== 'usable' || selectedId === undefined) return
    let active = true
    const startToken = latestDraftToken.current
    void props.loadPromptResource(selectedId).catch(() => {
      if (active) reportReadFailure(selectedId, startToken, 'resourceNoticeRefreshFailed')
    })
    return () => { active = false }
  }, [selectedId, view.selected?.status, props.loadPromptResource])

  const refresh = () => {
    const live = readLivePresentationForActions(actions)
    if (!mounted.current
      || !mayApplyCurrentNavigationEvent(actions, renderedOpenSessionEpoch, 'resources')
      || live?.selectedResourceId !== requestedId
      || latestSelection.current !== selectedId) return
    const tokenAtStart = latestDraftToken.current
    const report = (code: 'resourceNoticeRefreshFailed' | 'resourceNoticeUnavailable') =>
      reportReadFailure(selectedId, tokenAtStart, code)
    void (async () => {
      const result = await props.loadPromptResourceList()
      if (!mounted.current || latestSelection.current !== selectedId
        || latestDraftToken.current !== tokenAtStart) return
      if (result.status !== 'completed') {
        report('resourceNoticeUnavailable')
        return
      }
      if (selectedId !== undefined && view.selected?.status === 'usable') {
        const body = await props.loadPromptResource(selectedId)
        if (body.status !== 'completed') report('resourceNoticeRefreshFailed')
      }
    })().catch(() => report('resourceNoticeRefreshFailed'))
  }

  const unavailable = () => {
    actions.setResourceNotice({ code: 'resourceNoticeUnavailable', kind: 'warning' })
  }
  const ownsRenderSession = () => mounted.current
    && mayApplyCurrentNavigationEvent(actions, renderedOpenSessionEpoch, 'resources')
  const ownsSelectedResource = () => {
    const live = readLivePresentationForActions(actions)
    return ownsRenderSession()
      && live?.selectedResourceId === requestedId
      && latestSelection.current === selectedId
  }
  const applyDraftEvent = (token: number, event: () => void): void => {
    if (mayApplyCurrentDraftEvent(actions, renderedOpenSessionEpoch, 'resources', token)) event()
  }
  const staleBegin = () => {
    actions.setResourceNotice({ code: 'resourceNoticeStale', kind: 'warning' })
  }

  const startCreate = () => {
    if (!ownsRenderSession()) return
    if (!canStart) return unavailable()
    const basis = props.capturePromptResourceCreateBasis()
    if (!basis) return unavailable()
    if (!isResourceCreateBeginCurrent(snapshot, basis)) return staleBegin()
    actions.beginResourceCreate(basis)
  }

  const startEdit = () => {
    if (!ownsSelectedResource()) return
    const selected = view.selected
    const document = view.document
    if (!canStart || !view.canEditSelected || selected?.status !== 'usable' || !document) {
      return unavailable()
    }
    const stamp = props.capturePromptResourceReadStamp(selected.id, 'document')
    if (!stamp) return unavailable()
    if (!isResourceBeginCurrent(snapshot, selected, stamp, document)) return staleBegin()
    actions.beginResourceEdit(document, stamp)
  }

  const startDelete = () => {
    if (!ownsSelectedResource()) return
    const selected = view.selected
    if (!canStart || selected?.status !== 'usable') return unavailable()
    const stamp = props.capturePromptResourceReadStamp(selected.id, 'list')
    if (!stamp) return unavailable()
    if (!isResourceBeginCurrent(snapshot, selected, stamp)) return staleBegin()
    actions.beginResourceDelete(selected.id, selected.name, stamp)
  }

  const finish = (
    result: Awaited<NonNullable<ReturnType<typeof commitResourceDraft>>>,
    original: ResourceDraft,
  ) => {
    if (result.status === 'superseded') return
    const reported = noticeForResourceMutationResult(result)
    const blocked = blockForResourceMutationResult(result)
    if (result.status === 'applied' && result.refresh === 'fresh') {
      actions.completeResourceDraft(original.token, reported ?? null,
        original.kind === 'create' ? original.id
          : original.kind === 'delete' ? null : undefined)
      return
    }
    if (blocked !== undefined) {
      actions.blockResourceDraft(original.token, blocked, reported ?? null)
      return
    }
    if (reported) actions.setResourceNotice(reported)
  }

  const commit = async () => {
    const live = readLivePresentationForActions(actions)
    if (!canSubmit || draft === null || committing.current !== null
      || !isLiveDrawerOpenSession(live, renderedOpenSessionEpoch)
      || !ownsLiveResourceDraft(live, draft)) return
    if (draft.kind === 'create') {
      const validation = validateResourceCreateDraft(draft, new Set(view.rows.map(row => row.id)))
      if (validation !== 'valid') {
        const code: ResourceNotice['code'] = validation === 'exists'
          ? 'resourceNoticeExists' : 'resourceNoticeInvalid'
        actions.setResourceNotice({ code, kind: 'warning' })
        return
      }
    }
    actions.beginResourceSubmission(draft.token)
    const claimed = readLivePresentationForActions(actions)?.resourceDraft
    if (claimed?.token !== draft.token || claimed.submitting !== true) return
    committing.current = draft.token
    try {
      const result = await commitResourceDraft(draft, props.resourceMutations)
      if (result !== undefined) finish(result, draft)
    } catch (error) {
      // A rejected *call* is outcome-unknown, never permission to auto-retry.
      actions.blockResourceDraft(draft.token, 'unknown', {
        code: 'resourceNoticeUnknown', kind: 'warning',
        detail: error instanceof Error ? error.message : undefined,
      })
    } finally {
      actions.finishResourceSubmission(draft.token)
      if (committing.current === draft.token) committing.current = null
    }
  }

  const noticeElement = displayedNotice
    ? h('div', {
      role: displayedNotice.kind === 'error' ? 'alert' : 'status',
      'aria-live': 'polite',
      className: displayedNotice.kind === 'error' ? styles.error
        : displayedNotice.kind === 'warning' ? styles.warning : styles.success,
    },
    h('strong', null, t(displayedNotice.code)),
    displayedNotice.detail ? h('p', null, displayedNotice.detail) : null,
    ) : null

  const blockedElement = draft && (draft.blocked !== undefined || !draftCurrent)
    ? h('section', { role: 'alert', className: styles.warning },
      h('strong', null, t(
        draft.blocked === 'unknown' ? 'resourceNoticeUnknown'
          : draft.blocked === 'unverified' ? 'resourceNoticeDegraded'
            : draft.blocked === 'conflict' ? 'resourceNoticeConflict'
              : 'resourceNoticeStale',
      )),
      h('p', null, t('resourceDraftBlockedHint')),
      h('div', { className: styles.actions },
        button(t('refresh'), refresh, running),
        button(t('discardDraft'), () => applyDraftEvent(draft.token, () => {
          if (draft.blocked !== undefined) actions.discardBlockedResourceDraft(draft.token)
          else actions.cancelResourceDraft(draft.token)
        }), running || draft.submitting === true),
      ),
    ) : null

  const createForm = draft?.kind === 'create'
    ? h('form', { className: styles.form, onSubmit: (e: { preventDefault(): void }) => {
      e.preventDefault(); void commit()
    } },
    h('h3', null, t('resourceCreateTitle')),
    field('cm-resource-create-id', t('fieldId'), draft.id,
      v => applyDraftEvent(draft.token, () => actions.updateResourceCreate(draft.token, 'id', v)), !canSubmit),
    h('p', { className: styles.hint }, t('idImmutableHint')),
    field('cm-resource-create-name', t('fieldName'), draft.name,
      v => applyDraftEvent(draft.token, () => actions.updateResourceCreate(draft.token, 'name', v)), !canSubmit),
    field('cm-resource-create-description', t('fieldDescription'), draft.description,
      v => applyDraftEvent(draft.token, () => actions.updateResourceCreate(draft.token, 'description', v)), !canSubmit),
    field('cm-resource-create-content', t('resourceContent'), draft.content,
      v => applyDraftEvent(draft.token, () => actions.updateResourceCreate(draft.token, 'content', v)), !canSubmit, true),
    h('p', { className: styles.hint }, t('resourceBodyExactHint')),
    h('div', { className: styles.actions },
      h('button', {
        type: 'submit', className: styles.primary,
        disabled: !canSubmit
          || validateResourceCreateDraft(draft, new Set(view.rows.map(x => x.id))) !== 'valid',
      }, t('create')),
      button(t('cancel'), () => applyDraftEvent(draft.token, () => actions.cancelResourceDraft(draft.token)), running || draft.submitting === true),
    ),
    ) : null

  const editForm = draft?.kind === 'edit'
    ? h('form', { className: styles.form, onSubmit: (e: { preventDefault(): void }) => {
      e.preventDefault(); void commit()
    } },
    h('h3', null, t('resourceDetails')),
    h('p', { className: styles.hint }, `${t('resourceRevision')}: ${draft.stamp.revision}`),
    field('cm-resource-edit-name', t('fieldName'), draft.name,
      v => applyDraftEvent(draft.token, () => actions.updateResourceEdit(draft.token, 'name', v)), !canSubmit),
    field('cm-resource-edit-description', t('fieldDescription'),
      draft.removeDescription ? '' : draft.description,
      v => applyDraftEvent(draft.token, () => actions.updateResourceEdit(draft.token, 'description', v)), !canSubmit),
    h('div', { className: styles.actions },
      button(t('removeDescription'), () => applyDraftEvent(draft.token, () => actions.markResourceDescriptionRemoved(draft.token)),
        !canSubmit || draft.original.description === undefined),
      draft.original.description === undefined
        ? button(t('resourceSetEmptyDescription'),
          () => applyDraftEvent(draft.token, () => actions.markResourceDescriptionEmpty(draft.token)), !canSubmit)
        : null,
    ),
    draft.removeDescription
      ? h('p', { className: styles.hint }, t('resourceRemoveDescriptionHint')) : null,
    field('cm-resource-edit-content', t('resourceContent'), draft.content,
      v => applyDraftEvent(draft.token, () => actions.updateResourceEdit(draft.token, 'content', v)), !canSubmit, true),
    h('p', { className: styles.hint }, t('resourceBodyExactHint')),
    h('div', { className: styles.actions },
      h('button', { type: 'submit', className: styles.primary,
        disabled: !canSubmit || resourceEditChanges(draft).length === 0,
      }, t('save')),
      button(t('cancel'), () => applyDraftEvent(draft.token, () => actions.cancelResourceDraft(draft.token)), running || draft.submitting === true),
    ),
    ) : null

  const deletePanel = draft?.kind === 'delete'
    ? h('section', { className: styles.warning, role: 'group', 'aria-label': t('resourceDeleteTitle') },
      h('strong', null, t('resourceDeleteTitle')),
      h('p', null, t('resourceDeleteHint')),
      h('p', null, t('resourceDeleteBindingsHint')),
      h('code', null, draft.resourceId),
      h('div', { className: styles.actions },
        button(t('confirmDelete'), () => { void commit() }, !canSubmit, true),
        button(t('cancel'), () => applyDraftEvent(draft.token, () => actions.cancelResourceDraft(draft.token)), running || draft.submitting === true),
      ),
    ) : null

  const selected = view.selected
  const body = selected?.status === 'usable'
    ? snapshot.resources.documents.get(selected.id) : undefined
  const detail = draft?.kind === 'create' ? createForm
    : draft?.kind === 'edit' ? editForm
    : draft?.kind === 'delete' ? deletePanel
    : selected === undefined
      ? h('p', { className: styles.empty }, t('resourceSelectHint'))
      : selected.status === 'invalid'
        ? h('div', { className: styles.warning, role: 'status' },
          h('strong', null, t('resourceInvalid')),
          h('p', null, selected.message),
        )
        : h('div', { className: styles.detail },
          h('div', { className: styles.detailHeading },
            h('h3', null, selected.name || selected.id),
            h('span', { className: styles.tag }, `${t('resourceRevision')} ${selected.revision}`),
          ),
          h('div', { className: styles.field },
            h('span', { className: styles.label }, t('fieldId')),
            h('code', { className: styles.value }, selected.id),
          ),
          h('div', { className: styles.field },
            h('span', { className: styles.label }, t('fieldDescription')),
            h('p', { className: styles.value },
              selected.description === undefined ? t('notSet')
                : selected.description === '' ? t('emptyValue') : selected.description),
          ),
          h('div', { className: styles.field },
            h('span', { className: styles.label }, t('resourceIncarnation')),
            h('code', { className: styles.value }, selected.incarnationId ?? t('notSet')),
          ),
          view.canInspectSelected
            ? h('section', { className: styles.field },
              h('span', { className: styles.label }, t('resourceContent')),
              h('pre', { className: styles.resourceBody }, view.document?.content),
            )
            : h('p', { className: styles.hint, role: 'status' },
              body?.status === 'error' ? t('resourceDocumentError')
                : body?.status === 'loading' || body?.status === 'idle'
                  || body === undefined ? t('resourceDocumentLoading') : t('resourceStale')),
          h('div', { className: styles.actions },
            button(t('edit'), startEdit, !canStart || !view.canEditSelected),
            button(t('resourceDelete'), startDelete, !canStart, true),
          ),
        )

  const statusText = (() => {
    if (snapshot.attachment === 'detached') return t('hostDetached')
    if (snapshot.protocol.status === 'incompatible') return t('hostIncompatible')
    if (snapshot.protocol.status !== 'compatible') return t('hostChecking')
    if (snapshot.resources.list.status === 'error') return t('resourceReadError')
    if (snapshot.resources.list.status === 'loading' || snapshot.resources.list.status === 'idle') return t('resourceLoading')
    if (snapshot.resources.list.stale) return t('resourceStale')
    if (!view.writable) return t('resourceReadOnly')
    return null
  })()

  return h('div', { className: styles.content, 'data-context-manager-resource-editor': '' },
    h('div', { className: styles.toolbar },
      h('strong', null, t('resourcesTitle')),
      button(t('refresh'), refresh, running),
    ),
    statusText ? h('div', { className: styles.warning, role: 'status' }, statusText) : null,
    running ? h('p', { className: styles.hint, role: 'status' },
      t(operation.phase === 'mutating' ? 'saving' : 'refreshingAfterSave')) : null,
    noticeElement,
    blockedElement,
    h('div', { className: styles.columns },
      h('nav', { className: styles.profileList, 'aria-label': t('resourcesTitle') },
        button(t('resourceNew'), startCreate, !canStart, false, {
          'data-context-manager-new-resource': '',
        }),
        view.rows.length === 0
          ? h('p', { className: styles.empty }, t('resourceNoItems'))
          : h('ul', { className: styles.profileItems },
            ...view.rows.map(row => h('li', { key: row.id },
              h('button', {
                type: 'button',
                className: row.id === selectedId ? styles.selectedRow : styles.profileRow,
                disabled: draft !== null && row.id !== selectedId,
                'aria-current': row.id === selectedId ? 'true' : undefined,
                onClick: () => {
                  if (mayApplyCurrentNavigationEvent(actions, renderedOpenSessionEpoch, 'resources')) {
                    actions.selectResource(row.id)
                  }
                },
              },
              h('span', { className: styles.rowTitle },
                row.status === 'usable' ? row.name || row.id : row.id),
              row.status === 'invalid'
                ? h('span', { className: styles.tag }, t('resourceInvalid'))
                : h('span', { className: styles.tag }, `Rev. ${row.revision}`),
              ),
            )),
          ),
      ),
      h('section', { className: styles.detailPanel, 'aria-label': t('resourceDetails') },
        detail,
      ),
    ),
  )
}
