import { TYPERT_REMOTE } from '../lib/typert.remote-client.js'
import { createContextManagerClientPlugin } from '../src/client/plugin.js'

const plugin = createContextManagerClientPlugin(TYPERT_REMOTE)

export const inject = plugin.inject
export const apply = plugin.apply
