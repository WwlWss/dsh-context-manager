export interface ContextManagerInteractionSnapshot {
  readonly open: boolean
}

export class ContextManagerInteractionController {
  private snapshot: ContextManagerInteractionSnapshot = Object.freeze({ open: false })
  private readonly listeners = new Set<() => void>()

  readonly getSnapshot = (): ContextManagerInteractionSnapshot => this.snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  open(): void {
    this.publish(true)
  }

  close(): void {
    this.publish(false)
  }

  toggle(): void {
    this.publish(!this.snapshot.open)
  }

  private publish(open: boolean): void {
    if (this.snapshot.open === open) return
    this.snapshot = Object.freeze({ open })
    for (const listener of [...this.listeners]) listener()
  }
}
