import type { Context } from '@deepseek-ai/cordis'

export interface ContextManagerClientRemoteContribution {
  readonly package: string
  readonly descriptors: readonly unknown[]
}

export interface ContextManagerClientRemote {
  $mount(
    contribution: ContextManagerClientRemoteContribution,
  ): Promise<() => Promise<void>>
}

export interface ContextManagerClientSlots {
  inject(name: string, factory: () => () => void): () => void
  register(
    options: Readonly<Record<string, unknown>>,
    component: (props: Record<string, unknown>) => unknown,
  ): () => void
}

export type ContextManagerClientContext = Context & {
  readonly remote: ContextManagerClientRemote
  readonly slots: ContextManagerClientSlots
}

export declare const inject: readonly ['remote', 'slots']

export declare function apply(
  ctx: ContextManagerClientContext,
): Promise<() => Promise<void>>
