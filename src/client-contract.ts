export type {
  ContextManagerClientContext,
  ContextManagerClientRemote,
  ContextManagerClientRemoteContribution,
  ContextManagerRemoteContribution,
} from './client/context.js'

export declare const inject: readonly ['remote', 'slots', 'locale']

export declare function apply(
  ctx: import('./client/context.js').ContextManagerClientContext,
): Promise<() => Promise<void>>
