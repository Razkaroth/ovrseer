import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProcessManager } from '../process-manager'
import type { ManagedProcessI, ProcessStatus } from '../types'

function makeMockProcess(id: string): ManagedProcessI {
  let status: ProcessStatus = 'created'
  const logListeners: Array<(chunk: string) => void> = []
  const errListeners: Array<(chunk: string) => void> = []
  let readyResolve: () => void = () => {}
  const ready = new Promise<void>((res) => (readyResolve = res))
  const finished = Promise.resolve()

  return {
    logger: {
      onLog(l) { logListeners.push(l); return () => {} },
      onError(l) { errListeners.push(l); return () => {} },
      getLogs() { return `[logs ${id}]` },
      addChunk() {},
      reset() {},
    },
    ready,
    finished,
    start: vi.fn(() => { status = 'running'; setTimeout(() => { status = 'ready'; readyResolve() }, 0) }),
    stop: vi.fn(() => { status = 'stopped' }),
    kill: vi.fn(),
    isRunning: vi.fn(() => status === 'running' || status === 'ready'),
    getStatus: vi.fn(() => status),
    runReadyChecks: vi.fn(async () => {}),
    prepareForRestart: vi.fn(() => { status = 'created' }),
    restart: vi.fn(() => { status = 'created'; status = 'running'; setTimeout(() => { status = 'ready'; readyResolve() }, 0) }),
    cleanup: vi.fn(),
    onExit: vi.fn(),
    onCrash: vi.fn(),
    onReady: vi.fn((cb: () => void) => { /* simulate immediate if ready */ if (status === 'ready') cb() }),
  }
}

describe('ProcessManager.restartAll', () => {
  let pm: ProcessManager
  let showStatus = vi.fn()
  let render = vi.fn()

  beforeEach(() => {
    showStatus = vi.fn()
    render = vi.fn()
    pm = new ProcessManager({ waitTime: 5, tui: {
      init: vi.fn(),
      destroy: vi.fn(),
      render: (p, s) => render(p, s),
      onKeyPress: vi.fn(),
      showLogs: vi.fn(),
      showStatus: (m: string) => showStatus(m),
      showInstructions: vi.fn(),
      selectPrevious: vi.fn(),
      selectNext: vi.fn(),
    } as any })
  })

  it('restarts dependencies before main and does not destroy TUI', async () => {
    const depA = makeMockProcess('depA')
    const mainA = makeMockProcess('mainA')
    pm.addDependency('depA', depA)
    pm.addMainProcess('mainA', mainA)

    // start
    pm.start()

    // Wait a tick for ready promises
    await new Promise((r) => setTimeout(r, 5))

    // Capture initial calls count
    const depStartCalls = (depA.start as any).mock.calls.length
    const mainStartCalls = (mainA.start as any).mock.calls.length

    pm.restartAll()

    // Advance timers
    await new Promise((r) => setTimeout(r, 50))

    // Should not call destroy
    const tui = pm['tui'] as any
    expect(tui.destroy).not.toHaveBeenCalled()

    // Starts should have increased
    expect((depA.start as any).mock.calls.length).toBeGreaterThan(depStartCalls)
    expect((mainA.start as any).mock.calls.length).toBeGreaterThan(mainStartCalls)

    // Status messages sequence contains staged phases
    const messages = showStatus.mock.calls.map((c) => c[0])
    expect(messages.some((m: string) => m.toLowerCase().includes('starting dependencies'))).toBe(true)
    expect(messages.some((m: string) => m.toLowerCase().includes('starting main'))).toBe(true)
    expect(messages.some((m: string) => m.includes('All processes restarted'))).toBe(true)
  })
})
