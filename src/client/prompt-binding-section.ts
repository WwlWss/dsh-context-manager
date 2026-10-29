import { createElement as h, useRef } from 'react'
import type {
  ContextManagerRemoteProfile,
  ContextManagerRemotePromptBinding,
  ContextManagerRemotePromptPlacement,
} from '../remote/types.js'
import type { ContextManagerDrawerProps } from './profile-drawer.js'
import type { PromptBindingDraft } from './profile-editor.js'
import { isProfileDraftCurrent } from './profile-view.js'
import {
  blockForPromptBindingResult,
  commitPromptBindingDraft,
  isPromptBindingDraft,
  noticeForPromptBindingResult,
  promptBindingEditChanged,
  promptBindingPlacementHealth,
  promptBindingResourceHealth,
  sortedPromptBindings,
  validatePromptBindingCreate,
} from './prompt-binding-editor.js'
import styles from './plugin.module.css'

interface PromptBindingSectionProps extends ContextManagerDrawerProps {
  readonly profileId: string
  readonly profile: ContextManagerRemoteProfile
  readonly writable: boolean
}

const PLACEMENTS: readonly ContextManagerRemotePromptPlacement[] = [
  'before-persona', 'after-persona', 'before-tool-guidance',
  'after-tool-guidance', 'runtime-context',
]

function button(text: string, onClick: () => void, disabled = false,
  attributes: Record<string, unknown> = {}, danger = false) {
  return h('button', {
    type: 'button',
    className: danger ? styles.danger : styles.button,
    disabled, onClick, ...attributes,
  }, text)
}

function input(id: string, value: string, onChange: (next: string) => void,
  disabled: boolean, list?: string) {
  return h('input', {
    id, type: 'text', className: styles.input,
    value, disabled, ...(list === undefined ? {} : { list }),
    onChange: (event: { currentTarget: { value: string } }) =>
      onChange(event.currentTarget.value),
  })
}

function labeled(id: string, label: string, content: unknown) {
  return h('div', { className: styles.field },
    h('label', { htmlFor: id, className: styles.label }, label),
    content,
  )
}

function booleanSelect(id: string, value: boolean, disabled: boolean,
  set: (value: boolean) => void) {
  return h('select', {
    id, value: String(value), disabled, className: styles.input,
    onChange: (event: { currentTarget: { value: string } }) =>
      set(event.currentTarget.value === 'true'),
  }, h('option', { value: 'true' }, 'true'),
  h('option', { value: 'false' }, 'false'))
}

function placementSelect(id: string, value: ContextManagerRemotePromptPlacement,
  disabled: boolean, set: (next: ContextManagerRemotePromptPlacement) => void) {
  return h('select', {
    id, value, disabled, className: styles.input,
    onChange: (event: { currentTarget: { value: ContextManagerRemotePromptPlacement } }) =>
      set(event.currentTarget.value),
  }, ...PLACEMENTS.map(item => h('option', { key: item, value: item }, item)))
}

/** B1-1 Profile data + existing Profile lane; the Resource list is advisory only. */
export function ContextManagerPromptBindingSection(props: PromptBindingSectionProps) {
  const { profileId, profile, t, actions, writable } = props
  const snapshot = props.useContextManager(s => s)
  const operation = props.useProfileMutation(s => s.profile)
  const draft = props.useStore(s => s.draft)
  const resourceDraft = props.useStore(s => s.resourceDraft)
  const running = operation.status === 'running'
  const active = isPromptBindingDraft(draft) && draft.profileId === profileId ? draft : null
  const canStart = writable && !running && draft === null && resourceDraft === null
  const current = active !== null && isProfileDraftCurrent(snapshot, active)
  const canSubmit = active !== null && active.blocked === undefined && current
    && writable && !running
  // Synchronous guard for duplicate same-render Save events; Profile Controller
  // provides the independent global mutation single-flight and authority checks.
  const committing = useRef<number | null>(null)
  const rows = sortedPromptBindings(profile)
  const reservedIds = new Set(Object.keys(profile.prompts))
  const resourceList = snapshot.resources.list
  const suggestions = resourceList.status === 'ready' && !resourceList.stale
    ? resourceList.data?.filter(row => row.status === 'usable') ?? []
    : []

  const unavailable = () =>
    actions.setNotice({ code: 'noticeUnavailable', kind: 'warning' })
  const begin = () => {
    if (!canStart) {
      actions.setNotice({ code: 'noticeDraftActive', kind: 'warning' })
      return undefined
    }
    const basis = props.captureProfileMutationBasis()
    if (!basis) unavailable()
    return basis
  }
  const startCreate = () => {
    const basis = begin()
    if (basis) actions.beginPromptBindingCreate({ profileId, basis })
  }
  const startEdit = (bindingId: string, binding: ContextManagerRemotePromptBinding,
    field: 'resourceId' | 'enabled' | 'placement' | 'order') => {
    const basis = begin()
    if (!basis) return
    const common = { profileId, bindingId, basis }
    switch (field) {
      case 'resourceId':
        actions.beginPromptBindingFieldEdit({ ...common, field, original: binding.resourceId })
        break
      case 'enabled':
        actions.beginPromptBindingFieldEdit({ ...common, field, original: binding.enabled })
        break
      case 'placement':
        actions.beginPromptBindingFieldEdit({ ...common, field, original: binding.placement })
        break
      case 'order':
        actions.beginPromptBindingFieldEdit({ ...common, field, original: binding.order })
        break
    }
  }
  const startDelete = (bindingId: string) => {
    const basis = begin()
    if (basis) actions.beginPromptBindingDelete({ profileId, bindingId, basis })
  }

  // No automatic eager read, no body fetch, no Agent polling, no notice races:
  // only the explicitly clicked suggestions control starts a metadata-only read.
  const requestSuggestions = () => {
    void props.loadPromptResourceList().catch(() => {
      // The Client surface exposes read failures as unverified advisory state.
      // Never replace a blocked mutation notice with a late read failure.
    })
  }

  const commit = async () => {
    const original = active
    if (!canSubmit || original === null || committing.current !== null) return
    if (original.kind === 'prompt-binding-create') {
      const validation = validatePromptBindingCreate(original, reservedIds)
      if (validation !== 'valid') {
        const detail = validation === 'unsafe-id' ? t('bindingUnsafeId')
          : validation === 'exists' ? t('bindingIdDuplicate') : t('bindingOrderInvalid')
        actions.setPromptBindingNotice(original.token, {
          code: validation === 'exists' ? 'noticeBindingExists' : 'noticeInvalidInput',
          kind: 'warning', detail,
        })
        return
      }
    }
    if (original.kind === 'prompt-binding-edit-field'
      && !promptBindingEditChanged(original)) {
      if (original.field === 'order') {
        actions.setPromptBindingNotice(original.token, {
          code: 'noticeInvalidInput', kind: 'warning', detail: t('bindingOrderInvalid'),
        })
      }
      return
    }
    // Any previously captured operation only authorizes this exact Profile/
    // binding on the original revision. No mutation rebase at Save.
    if (original.kind !== 'prompt-binding-create'
      && !Object.hasOwn(profile.prompts, original.bindingId)) {
      actions.blockDraft(original.token, 'stale', {
        code: 'noticeBindingMissing', kind: 'warning',
      })
      return
    }
    committing.current = original.token
    try {
      const call = commitPromptBindingDraft(original, props.profileMutations)
      if (call === undefined) return
      const result = await call
      if (result.status === 'superseded') {
        actions.blockDraft(original.token, 'stale', null)
        return
      }
      const notice = noticeForPromptBindingResult(result)
      if (result.status === 'applied' && result.refresh === 'fresh') {
        actions.completeDraft(original.token, notice ?? null)
        return
      }
      const block = blockForPromptBindingResult(result)
      if (block !== undefined) {
        actions.blockDraft(original.token, block, notice ?? null)
        return
      }
      if (notice) actions.setPromptBindingNotice(original.token, notice)
    } catch (error) {
      actions.blockDraft(original.token, 'unknown', {
        code: 'noticeOutcomeUnknown', kind: 'warning',
        detail: error instanceof Error ? error.message : undefined,
      })
    } finally {
      if (committing.current === original.token) committing.current = null
    }
  }

  const formSubmit = (event: { preventDefault(): void }) => {
    event.preventDefault()
    void commit()
  }

  const createForm = active?.kind === 'prompt-binding-create'
    ? h('form', { className: styles.form, onSubmit: formSubmit,
      'data-context-manager-binding-create-form': '' },
    h('h4', null, t('bindingCreateTitle')),
    labeled('cm-binding-create-id', t('bindingId'),
      input('cm-binding-create-id', active.bindingId,
        value => actions.updatePromptBindingCreate('bindingId', value), !canSubmit)),
    h('p', { className: styles.hint }, t('bindingExactIdHint')),
    labeled('cm-binding-create-resource', t('bindingResourceId'),
      input('cm-binding-create-resource', active.resourceId,
        value => actions.updatePromptBindingCreate('resourceId', value), !canSubmit,
        'cm-binding-resource-suggestions')),
    labeled('cm-binding-create-enabled', t('bindingEnabled'),
      booleanSelect('cm-binding-create-enabled', active.enabled, !canSubmit,
        value => actions.updatePromptBindingCreate('enabled', value))),
    labeled('cm-binding-create-placement', t('bindingPlacement'),
      placementSelect('cm-binding-create-placement', active.placement, !canSubmit,
        value => actions.updatePromptBindingCreate('placement', value))),
    labeled('cm-binding-create-order', t('bindingOrder'),
      input('cm-binding-create-order', active.orderText,
        value => actions.updatePromptBindingCreate('orderText', value), !canSubmit)),
    h('div', { className: styles.actions },
      h('button', { type: 'submit', className: styles.primary,
        disabled: !canSubmit || validatePromptBindingCreate(active, reservedIds) !== 'valid',
        'data-context-manager-binding-save': '',
      }, t('create')),
      button(t('cancel'), () => actions.cancelDraft(), running)),
    ) : null

  const editForm = active?.kind === 'prompt-binding-edit-field'
    ? h('form', { className: styles.form, onSubmit: formSubmit,
      'data-context-manager-binding-edit-form': '' },
    h('h4', null, t('edit') + ': ' + t('bindingId') + ' ' + JSON.stringify(active.bindingId)),
    active.field === 'resourceId'
      ? labeled('cm-binding-edit-resourceId', t('bindingResourceId'),
        input('cm-binding-edit-resourceId', active.value,
          v => actions.updatePromptBindingField(v), !canSubmit,
          'cm-binding-resource-suggestions'))
      : active.field === 'enabled'
        ? labeled('cm-binding-edit-enabled', t('bindingEnabled'),
          booleanSelect('cm-binding-edit-enabled', active.value, !canSubmit,
            v => actions.updatePromptBindingField(v)))
        : active.field === 'placement'
          ? labeled('cm-binding-edit-placement', t('bindingPlacement'),
            placementSelect('cm-binding-edit-placement', active.value, !canSubmit,
              v => actions.updatePromptBindingField(v)))
          : labeled('cm-binding-edit-order', t('bindingOrder'),
            input('cm-binding-edit-order', active.value,
              v => actions.updatePromptBindingField(v), !canSubmit)),
    h('p', { className: styles.hint }, t('bindingOneFieldHint')),
    h('div', { className: styles.actions },
      h('button', { type: 'submit', className: styles.primary,
        disabled: !canSubmit || !promptBindingEditChanged(active),
        'data-context-manager-binding-save': '',
      }, t('save')),
      button(t('cancel'), () => actions.cancelDraft(), running)),
    ) : null

  const deleteConfirmation = active?.kind === 'prompt-binding-delete'
    ? h('section', { className: styles.warning, role: 'group',
      'data-context-manager-binding-delete-confirm': '' },
    h('strong', null, t('bindingConfirmDelete')),
    h('p', null, t('bindingDeleteHint')),
    h('code', null, JSON.stringify(active.profileId) + ' / ' + JSON.stringify(active.bindingId)),
    h('div', { className: styles.actions },
      button(t('confirmDelete'), () => { void commit() }, !canSubmit,
        { 'data-context-manager-binding-save': '' }, true),
      button(t('cancel'), () => actions.cancelDraft(), running)),
    ) : null

  return h('section', { className: styles.diagnostics,
    'data-context-manager-prompt-bindings': '',
    'aria-label': t('bindingTitle'),
  },
  h('div', { className: styles.fieldHeader },
    h('h3', null, t('bindingTitle')),
    button(t('bindingNew'), startCreate, !canStart,
      { 'data-context-manager-new-binding': '' }),
  ),
  h('p', { className: styles.hint }, t('bindingOneFieldHint')),
  h('div', { className: styles.actions },
    button(t('bindingLoadSuggestions'), requestSuggestions, snapshot.attachment !== 'attached'),
  ),
  h('datalist', { id: 'cm-binding-resource-suggestions' },
    ...suggestions.filter(row => row.status === 'usable')
      .map(row => h('option', { key: row.id, value: row.id }, row.name)),
  ),
  rows.length === 0
    ? h('p', { className: styles.empty }, t('bindingNoItems'))
    : h('ul', { className: styles.profileItems },
      ...rows.map(([bindingId, binding]) => {
        const resource = promptBindingResourceHealth(snapshot, binding.resourceId)
        const placement = promptBindingPlacementHealth(snapshot, binding.placement)
        return h('li', { key: bindingId, className: styles.field,
          'data-context-manager-binding-row': bindingId },
        h('div', { className: styles.fieldHeader },
          h('code', null, JSON.stringify(bindingId)),
          h('span', { className: styles.tag }, String(binding.order)),
        ),
        h('p', { className: styles.value },
          t('bindingResourceId') + ': ', h('code', null, JSON.stringify(binding.resourceId))),
        h('p', { className: styles.hint },
          t('bindingEnabled') + ': ' + String(binding.enabled)
          + ' · ' + t('bindingPlacement') + ': ' + binding.placement),
        h('p', { className: styles.hint },
          t('bindingResourceHealth') + ': ' + t(({
            usable: 'bindingResourceUsable',
            invalid: 'bindingResourceInvalid',
            missing: 'bindingResourceMissing',
            unverified: 'bindingResourceUnverified',
          } as const)[resource])),
        h('p', { className: styles.hint },
          t('bindingPlacementHealth') + ': ' + t(({
            available: 'bindingPlacementAvailable',
            unavailable: 'bindingPlacementUnavailable',
            unverified: 'bindingPlacementUnverified',
          } as const)[placement])),
        h('div', { className: styles.actions },
          button(t('bindingEditResourceId'), () => startEdit(bindingId, binding, 'resourceId'),
            !canStart, { 'data-context-manager-binding-edit-resourceId': bindingId }),
          button(t('bindingEditEnabled'), () => startEdit(bindingId, binding, 'enabled'),
            !canStart, { 'data-context-manager-binding-edit-enabled': bindingId }),
          button(t('bindingEditPlacement'), () => startEdit(bindingId, binding, 'placement'),
            !canStart, { 'data-context-manager-binding-edit-placement': bindingId }),
          button(t('bindingEditOrder'), () => startEdit(bindingId, binding, 'order'),
            !canStart, { 'data-context-manager-binding-edit-order': bindingId }),
          button(t('bindingDelete'), () => startDelete(bindingId),
            !canStart, { 'data-context-manager-binding-delete': bindingId }, true),
        ))
      }),
    ),
  createForm,
  editForm,
  deleteConfirmation,
  h('p', { className: styles.hint }, t('bindingEffectiveUnverified')),
  )
}
