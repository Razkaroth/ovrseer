import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ProcessManager } from '../process-manager'
import type { TUIRendererI } from '../types'
import { fakeManagedProcess } from './mocks'

class FakeTUI implements TUIRendererI {
  init = vi.fn()
  destroy = vi.fn()
  render = vi.fn()
  showLogs = vi.fn()
  showStatus = vi.fn()
  selectPrevious = vi.fn()
  selectNext = vi.fn()
  private keyCb?: (key: string) => void
  onKeyPress(cb: (key: string) => void) {
    this.keyCb = cb
  }
  triggerKey(key: string) {
    this.keyCb?.(key)
  }
}

describe('ProcessManager graceful quit', () => {
  let tui: FakeTUI
  let exitSpy: any

  beforeEach(() => {
    vi.useFakeTimers()
    tui = new FakeTUI()
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      // noop to prevent real exit
      return undefined as never
    }) as any)
  })

  afterEach(() => {
    vi.runAllTimers()
    vi.useRealTimers()
    exitSpy.mockRestore()
    vi.clearAllMocks()
  })

  it('performs cleanup then exits after 2 seconds showing status message', async () => {
    const pm = new ProcessManager({ tui })

    const main = fakeManagedProcess({
      isRunning: vi.fn(() => true),
      stop: vi.fn(),
    })
    const dep = fakeManagedProcess({
      isRunning: vi.fn(() => true),
      stop: vi.fn(),
    })
    const cleanup = fakeManagedProcess({
      start: vi.fn(),
      cleanup: vi.fn(),
    })

    pm.addMainProcess('main', main)
    pm.addDependency('dep', dep)
    pm.addCleanupProcess('clean', cleanup)

    pm.startTuiSession()

    // Simulate pressing 'q'
    tui.triggerKey('q')

    // Immediately: processes stopped, cleanup initiated, but async completion pending
    expect(main.stop).toHaveBeenCalled()
    expect(dep.stop).toHaveBeenCalled()
    expect(cleanup.start).toHaveBeenCalled()
    expect(cleanup.cleanup).toHaveBeenCalled()
    // First status call is Ready from startTuiSession; subsequent should include Running cleanup
    const statusArgs = (tui.showStatus as any).mock.calls.map((c: any[]) => c[0])
    expect(statusArgs.some((m: string) => m.toLowerCase().includes('running cleanup'))).toBe(true)
    // Poll microtasks until cleanup finished appears (without advancing 2s timer)
    vi.advanceTimersByTime(0)
    for (let i = 0; i < 10; i++) {
      if (
        (tui.showStatus as any).mock.calls.some((c: any[]) =>
          c[0].toLowerCase().includes('cleanup finished'),
        )
      )
        break
      await Promise.resolve()
      await Promise.resolve()
    }
    const finalStatusArgs = (tui.showStatus as any).mock.calls.map((c: any[]) => c[0])
    expect(finalStatusArgs.some((m: string) => m.toLowerCase().includes('cleanup finished'))).toBe(
      true,
    )
    expect(tui.destroy).not.toHaveBeenCalled()
    expect(exitSpy).not.toHaveBeenCalled()

    // Advance less than 2s (simulate waiting)
    vi.advanceTimersByTime(1999)
    expect(tui.destroy).not.toHaveBeenCalled()
    expect(exitSpy).not.toHaveBeenCalled()

    // Hit the 2s mark to trigger exit
    vi.advanceTimersByTime(1)
    expect(tui.destroy).toHaveBeenCalledTimes(1)
    expect(exitSpy).toHaveBeenCalledTimes(1)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('second q press forces immediate exit (clears delay)', () => {
    const pm = new ProcessManager({ tui })

    const main = fakeManagedProcess({
      isRunning: vi.fn(() => true),
      stop: vi.fn(),
    })

    pm.addMainProcess('main', main)
    pm.startTuiSession()

    tui.triggerKey('q') // initiate graceful quit

    expect(main.stop).toHaveBeenCalledTimes(1)
    expect(tui.destroy).not.toHaveBeenCalled()
    expect(exitSpy).not.toHaveBeenCalled()

    tui.triggerKey('q') // force immediate exit

    expect(tui.destroy).toHaveBeenCalledTimes(1)
    expect(exitSpy).toHaveBeenCalledTimes(1)

    // Advancing timers should not cause additional exits
    const destroyCalls = (tui.destroy as any).mock.calls.length
    const exitCalls = (exitSpy as any).mock.calls.length

    vi.advanceTimersByTime(2500)

    expect((tui.destroy as any).mock.calls.length).toBe(destroyCalls)
    expect((exitSpy as any).mock.calls.length).toBe(exitCalls)
  })
})
