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
    component: unknown,
  ): () => void
}

export interface ContextManagerClientLocale {
  register(
    namespace: string,
    dictionaries: Readonly<Record<string, Readonly<Record<string, string>>>>,
  ): () => void
  bind(
    namespace: string,
  ): (key: string, params?: Readonly<Record<string, string | number>>) => string
}

export type ContextManagerClientContext = Context & {
  readonly remote: ContextManagerClientRemote
  readonly slots: ContextManagerClientSlots
  readonly locale: ContextManagerClientLocale
}

export declare const inject: readonly ['remote', 'slots', 'locale']

export declare function apply(
  ctx: ContextManagerClientContext,
): Promise<() => Promise<void>>
