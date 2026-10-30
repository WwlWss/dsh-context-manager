import { createElement as h, useRef } from 'react'
import type {
  ContextManagerRemoteProfile, ContextManagerRemoteSkillBinding, ContextManagerRemoteSkillMode,
} from '../remote/types.js'
import type { ContextManagerDrawerProps } from './profile-drawer.js'
import { deriveProfileView, isProfileDraftCurrent } from './profile-view.js'
import {
  blockForSkillResult, commitSkillDraft, isSkillBeginCurrent, isSkillDraft,
  noticeForSkillResult, sortedSkillBindings, skillModeEditChanged, validateSkillCreate,
} from './skill-policy-editor.js'
import {
  isLiveDrawerOpenSession, mayApplyCurrentDraftEvent, ownsLiveProfileDraft, readLivePresentationForActions,
} from './presentation-store.js'
import styles from './plugin.module.css'

interface SkillPolicySectionProps extends ContextManagerDrawerProps {
  profileId: string
  profile: ContextManagerRemoteProfile
  writable: boolean
}

function button(
  title: string, action: () => void, disabled: boolean,
  attributes: Record<string, unknown> = {},
) {
  return h('button', {
    type: 'button', className: styles.button, onClick: action,
    disabled, ...attributes,
  }, title)
}

/**
 * B1-3 INERT Published Renderer interaction seam, NOT a Skill Editor.
 *
 * Real, mounted React buttons expose captured callbacks to the retained DSH
 * Renderer tests. Begin delegates to the already typed but deliberately inert
 * Skill Store actions; there are no Skill forms, Save handlers or mutations.
 * This prevents a superficial missing-DOM RED from masking all subsequent
 * Begin tests. B2 must replace this seam with the reviewed full editor.
 *
 * Do not advertise an Agent/native catalog or infer effective Skill state.
 */
export function ContextManagerSkillPolicySection(props: SkillPolicySectionProps) {
  const { profile, profileId, writable, actions, t } = props
  const snapshot = props.useContextManager(s => s)
  const operation = props.useProfileMutation(s => s.profile)
  const renderedOpenSessionEpoch = props.useStore(s => s.openSessionEpoch)
  const profileDraft = props.useStore(s => s.draft)
  const resourceDraft = props.useStore(s => s.resourceDraft)
  const selectedProfileId = props.useStore(s => s.selectedProfileId)
  const committing = useRef<number | null>(null)
  const canStart = writable && operation.status !== 'running'
    && profileDraft === null && resourceDraft === null
    && profileId !== '__proto__'

  // This is an own-key *read-only projection*, not a discovered native Skill
  // inventory. A code-unit comparison preserves exact configured IDs.
  const rows = sortedSkillBindings(profile)

  const capture = (target?: {
    skillName: string
    renderedBinding: ContextManagerRemoteSkillBinding
    originalMode: ContextManagerRemoteSkillBinding['mode']
  }) => {
    const live = readLivePresentationForActions(actions)
    if (!canStart || !isLiveDrawerOpenSession(live, renderedOpenSessionEpoch)
      || live?.pane !== 'profiles') return undefined
    const view = deriveProfileView(snapshot, live.selectedProfileId)
    if (view.selectedId !== profileId) return undefined
    const basis = props.captureProfileMutationBasis()
    if (!isSkillBeginCurrent(snapshot, profileId, profile, basis, target)) return undefined
    return basis
  }

  const startCreate = () => {
    const basis = capture()
    if (!basis) return
    actions.beginSkillModeCreate({
      profileId, basis, observedSkillNames: Object.keys(profile.skills),
    })
  }

  const startEdit = (name: string, renderedBinding: ContextManagerRemoteSkillBinding) => {
    const basis = capture({ skillName: name, renderedBinding, originalMode: renderedBinding.mode })
    if (!basis) return
    actions.beginSkillModeEdit({
      profileId, skillName: name, originalMode: renderedBinding.mode, basis,
    })
  }

  const startDelete = (name: string, renderedBinding: ContextManagerRemoteSkillBinding) => {
    const basis = capture({ skillName: name, renderedBinding, originalMode: renderedBinding.mode })
    if (!basis) return
    actions.beginSkillBindingDelete({
      profileId, skillName: name, originalMode: renderedBinding.mode, basis,
    })
  }


  const active = isSkillDraft(profileDraft) && profileDraft.profileId === profileId
    ? profileDraft : null
  const currentView = deriveProfileView(snapshot, selectedProfileId)
  const canSubmit = active !== null
    && active.blocked === undefined && !active.submitting
    && isProfileDraftCurrent(snapshot, active)
    && currentView.writable && currentView.selectedId === profileId
    && operation.status !== 'running'

  const options = (value: ContextManagerRemoteSkillMode,
    onChange: (mode: ContextManagerRemoteSkillMode) => void) =>
    h('select', {
      className: styles.input,
      value, disabled: !canSubmit,
      id: active?.kind === 'skill-mode-create' ? 'cm-skill-mode-create' : 'cm-skill-mode-edit',
      onChange: (event: { currentTarget: { value: string } }) =>
        onChange(event.currentTarget.value as ContextManagerRemoteSkillMode),
    }, ...(['auto', 'manual', 'off', 'pinned'] as const).map(mode =>
      h('option', { key: mode, value: mode }, mode)))

  /** B2-B1 single existing Profile RPC, never a separate Skill controller.
   * Current UI, live root Store identity, Drawer session and original Model
   * Basis all authorize the single synchronous submission claim. */
  const commit = async () => {
    const original = active
    const live = readLivePresentationForActions(actions)
    if (!canSubmit || original === null || committing.current !== null
      || !isLiveDrawerOpenSession(live, renderedOpenSessionEpoch)
      || !ownsLiveProfileDraft(live, original)
      || live?.selectedProfileId !== profileId) return

    const freshBasis = props.captureProfileMutationBasis()
    if (freshBasis === undefined
      || freshBasis.instanceId !== original.basis.instanceId
      || freshBasis.revision !== original.basis.revision) {
      actions.setSkillDraftNotice(original.token, {
        code: 'noticeDraftStale', kind: 'warning',
      })
      return
    }
    if (original.kind === 'skill-mode-create') {
      const validity = validateSkillCreate(original)
      if (validity !== 'valid') {
        actions.setSkillDraftNotice(original.token, {
          code: 'noticeInvalidInput', kind: 'warning',
          detail: validity === 'exists' ? t('skillIdDuplicate') : t('skillUnsafePath'),
        })
        return
      }
    } else {
      if (!Object.hasOwn(profile.skills, original.skillName)
        || profile.skills[original.skillName].mode !== original.originalMode) {
        actions.setSkillDraftNotice(original.token, {
          code: 'noticeSkillMissing', kind: 'warning',
        })
        return
      }
      if (original.kind === 'skill-mode-edit' && !skillModeEditChanged(original)) return
    }

    actions.beginProfileSubmission(original.token)
    const claimed = readLivePresentationForActions(actions)?.draft
    if (claimed?.token !== original.token || claimed.kind !== original.kind
      || claimed.submitting !== true) return
    committing.current = original.token
    let ordinaryNotice: ReturnType<typeof noticeForSkillResult>
    try {
      const call = commitSkillDraft(original, props.profileMutations)
      if (call === undefined) return
      const result = await call
      if (result.status === 'superseded') {
        actions.blockDraft(original.token, 'stale', null)
        return
      }
      const notice = noticeForSkillResult(result)
      if (result.status === 'applied' && result.refresh === 'fresh') {
        actions.completeDraft(original.token, notice ?? null)
        return
      }
      const blocked = blockForSkillResult(result)
      if (blocked !== undefined) {
        actions.blockDraft(original.token, blocked, notice ?? null)
        return
      }
      ordinaryNotice = notice
    } catch (error) {
      actions.blockDraft(original.token, 'unknown', {
        code: 'noticeOutcomeUnknown', kind: 'warning',
        detail: error instanceof Error ? error.message : undefined,
      })
    } finally {
      actions.finishProfileSubmission(original.token)
      // Nonterminal business notices must be published after the submit
      // claim is released without altering an existing terminal receipt.
      if (ordinaryNotice !== undefined) actions.setSkillDraftNotice(original.token, ordinaryNotice)
      if (committing.current === original.token) committing.current = null
    }
  }
  const formSubmit = (event: { preventDefault(): void }) => {
    event.preventDefault()
    void commit()
  }
  const applyDraftEvent = (token: number, event: () => void): void => {
    if (mayApplyCurrentDraftEvent(actions, renderedOpenSessionEpoch, 'profiles', token)) event()
  }
  const cancel = (token: number) => applyDraftEvent(token, () => actions.cancelDraft(token))
  const actionRow = (token: number, saveDisabled: boolean) =>
    h('div', { className: styles.actions },
      h('button', {
        type: 'submit', className: styles.primary, disabled: saveDisabled,
      }, t('save')),
      button(t('cancel'), () => cancel(token), active?.submitting === true),
    )

  const createForm = active?.kind === 'skill-mode-create'
    ? h('form', {
      className: styles.form, onSubmit: formSubmit,
      'data-context-manager-skill-create-form': '',
    },
    h('h4', null, t('skillNew')),
    h('label', { htmlFor: 'cm-skill-create-name', className: styles.label }, t('fieldId')),
    h('input', {
      id: 'cm-skill-create-name', className: styles.input,
      type: 'text', value: active.skillName, disabled: !canSubmit,
      onChange: (event: { currentTarget: { value: string } }) =>
        applyDraftEvent(active.token, () =>
          actions.updateSkillCreateName(active.token, event.currentTarget.value)),
    }),
    h('label', { htmlFor: 'cm-skill-mode-create', className: styles.label }, t('skillMode')),
    options(active.mode, mode => applyDraftEvent(active.token, () => actions.updateSkillMode(active.token, mode))),
    h('p', { className: styles.hint }, t('skillExactIdHint')),
    actionRow(active.token, !canSubmit || validateSkillCreate(active) !== 'valid'),
    ) : null

  const editForm = active?.kind === 'skill-mode-edit'
    ? h('form', {
      className: styles.form, onSubmit: formSubmit,
      'data-context-manager-skill-edit-form': '',
    },
    h('h4', null, t('skillEdit')),
    h('code', { className: styles.value }, JSON.stringify(active.skillName)),
    h('p', { className: styles.hint }, t('skillMode') + ': ' + active.originalMode),
    h('label', { htmlFor: 'cm-skill-mode-edit', className: styles.label }, t('skillMode')),
    options(active.mode, mode => applyDraftEvent(active.token, () => actions.updateSkillMode(active.token, mode))),
    actionRow(active.token, !canSubmit || !skillModeEditChanged(active)),
    ) : null

  const deleteConfirm = active?.kind === 'skill-binding-delete'
    ? h('section', {
      className: styles.warning, role: 'group',
      'data-context-manager-skill-delete-confirm': '',
    },
    h('h4', null, t('skillDelete')),
    h('p', null, t('skillDeleteWholeHint')),
    h('p', null, t('profileDetails'), ': ', h('code', null, JSON.stringify(profileId))),
    h('p', null, t('skillTitle'), ': ',
      h('code', null, JSON.stringify(active.skillName))),
    h('div', { className: styles.actions },
      button(t('confirmDelete'), () => { void commit() },
        !canSubmit, { 'data-context-manager-skill-confirm-delete': '' }),
      button(t('cancel'), () => cancel(active.token), active.submitting === true),
    ),
    ) : null

  return h('section', {
    className: styles.bindingSection,
    'data-context-manager-skills': '',
    'aria-label': t('skillTitle'),
  },
  h('div', { className: styles.fieldHeader },
    h('h3', null, t('skillTitle')),
    button(t('skillNew'), startCreate, !canStart,
      { 'data-context-manager-skill-new': '' }),
  ),
  h('p', { className: styles.hint }, t('skillConfiguredOnly')),
  h('p', { className: styles.hint }, t('skillRedProbe')),
  createForm, editForm, deleteConfirm,
  rows.length === 0
    ? h('p', { className: styles.empty }, t('skillNoItems'))
    : h('ul', { className: styles.profileItems },
      ...rows.map(([name, binding]) => {
        const pathReadOnly = profileId === '__proto__' || name === '__proto__'
        return h('li', {
          key: name, className: styles.field,
          'data-context-manager-skill-row': name,
        },
        h('div', { className: styles.fieldHeader },
          h('code', null, JSON.stringify(name)),
          h('span', { className: styles.tag }, binding.mode),
        ),
        h('p', { className: styles.hint },
          t('skillMode') + ': ' + binding.mode),
        pathReadOnly
          ? h('p', { className: styles.warning }, t('skillUnsafePath')) : null,
        h('div', { className: styles.actions },
          button(t('skillEdit'), () => startEdit(name, binding), !canStart || pathReadOnly,
            { 'data-context-manager-skill-edit': name }),
          button(t('skillDelete'), () => startDelete(name, binding), !canStart || pathReadOnly,
            { 'data-context-manager-skill-delete': name }),
        ))
      }),
    ),
  )
}
