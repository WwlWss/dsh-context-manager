import { createElement as h } from 'react'
import type { ContextManagerRemoteProfile } from '../remote/types.js'
import type { ContextManagerDrawerProps } from './profile-drawer.js'
import { deriveProfileView, isProfileBeginCurrent } from './profile-view.js'
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
  const canStart = writable && operation.status !== 'running'
    && profileDraft === null && resourceDraft === null
    && profileId !== '__proto__'

  // This is an own-key *read-only projection*, not a discovered native Skill
  // inventory. A code-unit comparison preserves exact configured IDs.
  const rows = Object.entries(profile.skills).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  )

  const capture = (skillName?: string) => {
    const live = readLivePresentationForActions(actions)
    if (!canStart || !isLiveDrawerOpenSession(live, renderedOpenSessionEpoch)
      || live?.pane !== 'profiles'
      || (skillName !== undefined && skillName === '__proto__')) return undefined
    const view = deriveProfileView(snapshot, live.selectedProfileId)
    if (view.selectedId !== profileId) return undefined
    const basis = props.captureProfileMutationBasis()
    const liveProfiles = snapshot.profiles.data?.profiles
    if (!isProfileBeginCurrent(snapshot, basis)
      || liveProfiles === undefined
      || !Object.hasOwn(liveProfiles, profileId)
      || liveProfiles[profileId] !== profile) return undefined
    return basis
  }

  const startCreate = () => {
    const basis = capture()
    if (!basis) return
    actions.beginSkillModeCreate({
      profileId, basis, observedSkillNames: Object.keys(profile.skills),
    })
  }

  const startEdit = (name: string) => {
    const basis = capture(name)
    if (!basis || !Object.hasOwn(profile.skills, name)) return
    actions.beginSkillModeEdit({
      profileId, skillName: name, originalMode: profile.skills[name].mode, basis,
    })
  }

  const startDelete = (name: string) => {
    const basis = capture(name)
    if (!basis || !Object.hasOwn(profile.skills, name)) return
    actions.beginSkillBindingDelete({
      profileId, skillName: name, originalMode: profile.skills[name].mode, basis,
    })
  }

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
          button(t('skillEdit'), () => startEdit(name), !canStart || pathReadOnly,
            { 'data-context-manager-skill-edit': name }),
          button(t('skillDelete'), () => startDelete(name), !canStart || pathReadOnly,
            { 'data-context-manager-skill-delete': name }),
        ))
      }),
    ),
  )
}
