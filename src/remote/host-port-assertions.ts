import type {
  ContextManagerChangeRemotePort,
  ContextManagerPinnedSkillRuntimeRemotePort,
  ContextManagerPresetAuthoringRemotePort,
  ContextManagerPresetDirectoryRemotePort,
  ContextManagerProfileRemotePort,
  ContextManagerPromptPlacementRemotePort,
  ContextManagerPromptRemotePort,
  ContextManagerPromptRuntimeRemotePort,
  ContextManagerSessionPresetRemotePort,
  ContextManagerSkillRuntimeRemotePort,
} from './host-ports.js'
import type { ContextManagerChangeTracker } from '../service/change-tracker.js'
import type { ContextManagerService } from '../service/context-manager.js'
import type { ContextManagerPinnedSkillRuntime } from '../service/pinned-skill-runtime.js'
import type { ContextManagerPresetAuthoring } from '../service/preset-authoring.js'
import type { ContextManagerPresetDirectory } from '../service/preset-directory.js'
import type { ContextManagerPromptLibrary } from '../service/prompt-library.js'
import type { ContextManagerPromptPlacementCapability } from '../service/prompt-placement.js'
import type { ContextManagerPromptRuntime } from '../service/prompt-runtime.js'
import type { ContextManagerSessionPresetIdentity } from '../service/session-preset.js'
import type { ContextManagerSkillRuntime } from '../service/skill-runtime.js'

const profilePortCheck: ContextManagerProfileRemotePort = null as unknown as ContextManagerService
const promptPortCheck: ContextManagerPromptRemotePort = null as unknown as ContextManagerPromptLibrary

void profilePortCheck
void promptPortCheck


const presetDirectoryPortCheck: ContextManagerPresetDirectoryRemotePort =
  null as unknown as ContextManagerPresetDirectory
const presetAuthoringPortCheck: ContextManagerPresetAuthoringRemotePort =
  null as unknown as ContextManagerPresetAuthoring
const sessionPresetPortCheck: ContextManagerSessionPresetRemotePort =
  null as unknown as ContextManagerSessionPresetIdentity
const promptPlacementPortCheck: ContextManagerPromptPlacementRemotePort =
  null as unknown as ContextManagerPromptPlacementCapability
const promptRuntimePortCheck: ContextManagerPromptRuntimeRemotePort =
  null as unknown as ContextManagerPromptRuntime
const skillRuntimePortCheck: ContextManagerSkillRuntimeRemotePort =
  null as unknown as ContextManagerSkillRuntime
const pinnedRuntimePortCheck: ContextManagerPinnedSkillRuntimeRemotePort =
  null as unknown as ContextManagerPinnedSkillRuntime
const changePortCheck: ContextManagerChangeRemotePort =
  null as unknown as ContextManagerChangeTracker

void presetDirectoryPortCheck
void presetAuthoringPortCheck
void sessionPresetPortCheck
void promptPlacementPortCheck
void promptRuntimePortCheck
void skillRuntimePortCheck
void pinnedRuntimePortCheck
void changePortCheck
