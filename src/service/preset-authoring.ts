import { Service, type Context } from '@deepseek-ai/cordis'

import {
  copyNativePreset,
  readNativePresetComposition,
  removeNativePreset,
} from '../adapters/preset-authoring.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextPresetAuthoring: ContextManagerPresetAuthoring
  }
}

/**
 * Narrow Host bridge to DSH-owned AgentPreset authoring.
 *
 * Context Manager does not own preset storage. Every operation resolves the
 * optional native agentPresets capability at call time and delegates the write
 * to DSH, which remains responsible for filesystem containment, writable-root
 * ownership, collision handling, native-default cleanup, and standing mounts.
 */
export class ContextManagerPresetAuthoring extends Service {
  private readonly ownerCtx: Context

  constructor(ctx: Context) {
    super(ctx, 'dshContextPresetAuthoring')
    this.ownerCtx = ctx
  }

  read(id: string): Promise<string> {
    return readNativePresetComposition(this.ownerCtx, id)
  }

  async copy(from: string, id: string, name?: string): Promise<void> {
    await copyNativePreset(this.ownerCtx, from, id, name)
    this.markPresetsChanged()
  }

  async remove(id: string): Promise<void> {
    await removeNativePreset(this.ownerCtx, id)
    this.markPresetsChanged()
  }

  private markPresetsChanged(): void {
    const tracker = this.ownerCtx.get('dshContextChanges') as
      | { markPresets(): void }
      | undefined
    tracker?.markPresets()
  }
}
