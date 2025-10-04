import { describe, it, expect, vi } from 'vitest'
import { ProcessManager } from '../process-manager'
import type { ManagedProcessI, ProcessStatus } from '../types'

function makeMockProcess(id: string, opts: { finishedDelay?: number } = {}): ManagedProcessI {
  let status: ProcessStatus = 'created'
  const logListeners: Array<(chunk: string) => void> = []
  const errListeners: Array<(chunk: string) => void> = []
  let readyResolve: () => void = () => {}
  const ready = new Promise<void>((res) => (readyResolve = res))
  let finishedResolve: () => void = () => {}
  const finished = new Promise<void>((res) => (finishedResolve = res))

  return {
    logger: {
      onLog(l) {
        logListeners.push(l)
        return () => {}
      },
      onError(l) {
        errListeners.push(l)
        return () => {}
      },
      getLogs() {
        return `[logs ${id}]`
      },
      addChunk() {},
      reset() {},
    },
    ready,
    finished,
    start: vi.fn(() => {
      status = 'running'
      setTimeout(() => {
        status = 'ready'
        readyResolve()
      }, 0)
    }),
    stop: vi.fn(() => {
      status = 'stopped'
    }),
    kill: vi.fn(),
    isRunning: vi.fn(() => status === 'running' || status === 'ready'),
    getStatus: vi.fn(() => status),
    runReadyChecks: vi.fn(async () => {}),
    prepareForRestart: vi.fn(() => {
      status = 'created'
    }),
    restart: vi.fn(() => {
      status = 'created'
      status = 'running'
      setTimeout(() => {
        status = 'ready'
        readyResolve()
      }, 0)
    }),
    cleanup: vi.fn(() => {
      setTimeout(() => {
        finishedResolve()
      }, opts.finishedDelay ?? 10)
    }),
    onExit: vi.fn(),
    onCrash: vi.fn(),
    onReady: vi.fn((cb: () => void) => {
      if (status === 'ready') cb()
    }),
  }
}

describe('ProcessManager enhancements', () => {
  it('Ctrl-R triggers restartAll (handled equivalently to R)', async () => {
    const keypressHandlers: Array<(k: string) => void> = []
    const pm = new ProcessManager({
      tui: {
        init: vi.fn(),
        destroy: vi.fn(),
        render: vi.fn(),
        onKeyPress: (cb: any) => {
          keypressHandlers.push(cb)
        },
        showLogs: vi.fn(),
        showStatus: vi.fn(),
        showInstructions: vi.fn(),
        selectPrevious: vi.fn(),
        selectNext: vi.fn(),
      } as any,
    })

    const dep = makeMockProcess('dep')
    const main = makeMockProcess('main')
    pm.addDependency('dep', dep)
    pm.addMainProcess('main', main)

    pm.startTuiSession()
    // simulate started state
    pm.start()
    await new Promise((r) => setTimeout(r, 5))

    const depStartCalls = (dep.start as any).mock.calls.length
    const mainStartCalls = (main.start as any).mock.calls.length

    // Fire Ctrl-R
    keypressHandlers.forEach((h) => h('C-r'))
    await new Promise((r) => setTimeout(r, 25))

    expect((dep.start as any).mock.calls.length).toBeGreaterThan(depStartCalls)
    expect((main.start as any).mock.calls.length).toBeGreaterThan(mainStartCalls)
  })

  it('restartAll auto-starts when nothing running', async () => {
    const statusCalls: string[] = []
    const pm = new ProcessManager({
      tui: {
        init: vi.fn(),
        destroy: vi.fn(),
        render: vi.fn(),
        onKeyPress: vi.fn(),
        showLogs: vi.fn(),
        showStatus: (m: string) => {
          statusCalls.push(m)
        },
        showInstructions: vi.fn(),
        selectPrevious: vi.fn(),
        selectNext: vi.fn(),
      } as any,
    })
    const dep = makeMockProcess('dep')
    const main = makeMockProcess('main')
    pm.addDependency('dep', dep)
    pm.addMainProcess('main', main)

    // Nothing started yet
    pm.restartAll()
    expect(statusCalls[0]).toContain('Starting all processes')
    // Allow async dependency start sequencing before main starts
    await new Promise((r) => setTimeout(r, 5))
    expect((dep.start as any).mock.calls.length).toBeGreaterThan(0)
    expect((main.start as any).mock.calls.length).toBeGreaterThan(0)
  })

  it('awaits cleanup finished with timeout', async () => {
    const statusCalls: string[] = []
    const pm = new ProcessManager({
      cleanupTimeout: 50,
      tui: {
        init: vi.fn(),
        destroy: vi.fn(),
        render: vi.fn(),
        onKeyPress: vi.fn(),
        showLogs: vi.fn(),
        showStatus: (m: string) => {
          statusCalls.push(m)
        },
        showInstructions: vi.fn(),
        selectPrevious: vi.fn(),
        selectNext: vi.fn(),
      } as any,
    })
    const main = makeMockProcess('main')
    const cleanup = makeMockProcess('cleanup', { finishedDelay: 10 })
    pm.addMainProcess('main', main)
    pm.addCleanupProcess('cleanup', cleanup)

    pm.start()
    await new Promise((r) => setTimeout(r, 5))
    pm.stop()
    await new Promise((r) => setTimeout(r, 100))

    expect(statusCalls.some((m) => m.toLowerCase().includes('cleanup finished'))).toBe(true)
  })
})
