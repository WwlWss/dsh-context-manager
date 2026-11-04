declare module 'react' {
  export function createElement(
    type: unknown,
    props?: object | null,
    ...children: unknown[]
  ): unknown

  export function useRef<T>(initialValue: T): { current: T }

  export function useState<T>(initialValue: T): [T, (next: T) => void]

  export function useEffect(
    effect: () => void | (() => void),
    deps?: readonly unknown[],
  ): void

  export function useSyncExternalStore<T>(
    subscribe: (listener: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T,
  ): T
}
