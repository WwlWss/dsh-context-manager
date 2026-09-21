import type { ContextManagerProfileRemotePort, ContextManagerPromptRemotePort } from './host-ports.js'
import type { ContextManagerService } from '../service/context-manager.js'
import type { ContextManagerPromptLibrary } from '../service/prompt-library.js'

const profilePortCheck: ContextManagerProfileRemotePort = null as unknown as ContextManagerService
const promptPortCheck: ContextManagerPromptRemotePort = null as unknown as ContextManagerPromptLibrary

void profilePortCheck
void promptPortCheck
