import { createElement as h } from 'react'
import type {
  ContextManagerRemoteProfile, ContextManagerRemoteSkillBinding, ContextManagerRemoteSkillMode,
} from '../remote/types.js'
import type { ContextManagerDrawerProps } from './profile-drawer.js'
import { deriveProfileView, isProfileDraftCurrent } from './profile-view.js'
import {
  isSkillBeginCurrent, isSkillDraft, sortedSkillBindings, skillModeEditChanged,
  validateSkillCreate,
} from './skill-policy-editor.js'
import {
  isLiveDrawerOpenSession, readLivePresentationForActions,
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

  // B2-A2 real mounted form RED frontier. Saves are deliberately inert until
  // separate B2-B1 RPC/Controller RED qualification. Do not fake a success.
  const stagedSubmit = (event: { preventDefault(): void }) => {
    event.preventDefault()
  }
  const cancel = (token: number) => {
    if (isLiveDrawerOpenSession(readLivePresentationForActions(actions),
      renderedOpenSessionEpoch)) actions.cancelDraft(token)
  }
  const actionRow = (token: number, saveDisabled: boolean) =>
    h('div', { className: styles.actions },
      h('button', {
        type: 'submit', className: styles.primary, disabled: saveDisabled,
      }, t('save')),
      button(t('cancel'), () => cancel(token), active?.submitting === true),
    )

  const createForm = active?.kind === 'skill-mode-create'
    ? h('form', {
      className: styles.form, onSubmit: stagedSubmit,
      'data-context-manager-skill-create-form': '',
    },
    h('h4', null, t('skillNew')),
    h('label', { htmlFor: 'cm-skill-create-name', className: styles.label }, t('fieldId')),
    h('input', {
      id: 'cm-skill-create-name', className: styles.input,
      type: 'text', value: active.skillName, disabled: !canSubmit,
      onChange: (event: { currentTarget: { value: string } }) =>
        actions.updateSkillCreateName(active.token, event.currentTarget.value),
    }),
    h('label', { htmlFor: 'cm-skill-mode-create', className: styles.label }, t('skillMode')),
    options(active.mode, mode => actions.updateSkillMode(active.token, mode)),
    h('p', { className: styles.hint }, t('skillExactIdHint')),
    actionRow(active.token, !canSubmit || validateSkillCreate(active) !== 'valid'),
    ) : null

  const editForm = active?.kind === 'skill-mode-edit'
    ? h('form', {
      className: styles.form, onSubmit: stagedSubmit,
      'data-context-manager-skill-edit-form': '',
    },
    h('h4', null, t('skillEdit')),
    h('code', { className: styles.value }, JSON.stringify(active.skillName)),
    h('p', { className: styles.hint }, t('skillMode') + ': ' + active.originalMode),
    h('label', { htmlFor: 'cm-skill-mode-edit', className: styles.label }, t('skillMode')),
    options(active.mode, mode => actions.updateSkillMode(active.token, mode)),
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
      button(t('confirmDelete'), () => stagedSubmit({ preventDefault() {} }),
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
