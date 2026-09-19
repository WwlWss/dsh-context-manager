import { Service, type Context } from '@deepseek-ai/cordis'

import {
  observeNativePromptPlacementCompatibility,
} from '../adapters/prompt-placement.js'
import type { PromptPlacement } from '../domain/model.js'

export type PromptPlacementCapabilityChannel = 'system-prompt' | 'runtime-context'

export type PromptPlacementCapabilitySnapshot =
  | {
      readonly status: 'unavailable'
    }
  | {
      readonly status: 'available'
      readonly placements: Readonly<
        Record<PromptPlacement, PromptPlacementCapabilityChannel>
      >
    }

const UNAVAILABLE: PromptPlacementCapabilitySnapshot = Object.freeze({
  status: 'unavailable',
})

const AVAILABLE_PLACEMENTS: Readonly<
  Record<PromptPlacement, PromptPlacementCapabilityChannel>
> = Object.freeze({
  'before-persona': 'system-prompt',
  'after-persona': 'system-prompt',
  'before-tool-guidance': 'system-prompt',
  'after-tool-guidance': 'system-prompt',
  'runtime-context': 'runtime-context',
})

const AVAILABLE: PromptPlacementCapabilitySnapshot = Object.freeze({
  status: 'available',
  placements: AVAILABLE_PLACEMENTS,
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextPromptPlacement: ContextManagerPromptPlacementCapability
  }
}

/**
 * Model-inert Host read service for M4C1 placement capability.
 *
 * Native numeric ranks deliberately stay inside the compatibility adapter.
 * This service exposes only whether the required public system-prompt channels
 * are available and which semantic Context Manager placement uses which native
 * channel. Per-Agent suppression/effectiveness belongs to M4C2.
 */
export class ContextManagerPromptPlacementCapability extends Service {
  private readonly ownerCtx: Context

  constructor(ctx: Context) {
    super(ctx, 'dshContextPromptPlacement')
    this.ownerCtx = ctx
  }

  snapshot(): PromptPlacementCapabilitySnapshot {
    const compatibility = observeNativePromptPlacementCompatibility(this.ownerCtx)
    return compatibility.status === 'unavailable' ? UNAVAILABLE : AVAILABLE
  }
}
