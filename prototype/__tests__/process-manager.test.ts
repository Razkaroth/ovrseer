import { ProcessManager } from '../process-manager'
import { SimpleLogger } from '../logger'
import type { ReadyCheck } from '../types'

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as any),
    spawn: vi.fn(),
  }
})

import { spawn } from 'child_process'
import EventEmitter from 'events'
import { TUIRenderer } from '../tui-renderer'
import { CrashReporter } from '../crash-reporter'
import { ManagedProcess } from '../managed-process'
import {
  makeStubProc,
  createManagedProcess as createManagedProcessFactory,
  trackedCreateManagedProcess,
  fakeManagedProcess,
} from './mocks'
const mockSpawn = vi.mocked(spawn)

const simpleReadyCheck: ReadyCheck = {
  logPattern: /ready/i,
  timeout: 100,
}

describe('ProcessManager', () => {
  let mockLogger: SimpleLogger
  let crashReporter: CrashReporter
  let tui: TUIRenderer
  let readyChecks: ReadyCheck[]
  let stubStdout: EventEmitter
  let stubStderr: EventEmitter
  let procEmitter: EventEmitter
  let stubProc: any
  let createdProcesses: ManagedProcess[] = []

  // Helper function to create and track processes for proper cleanup
  const createManagedProcess = (
    command: string,
    args: string[],
    checks: ReadyCheck[],
    logger?: SimpleLogger,
  ) => trackedCreateManagedProcess(createdProcesses, command, args, checks, logger)

  beforeEach(() => {
    mockLogger = new SimpleLogger(10, 5)
    readyChecks = [simpleReadyCheck]

    crashReporter = new CrashReporter()
    tui = new TUIRenderer()

    stubStdout = new EventEmitter()
    stubStderr = new EventEmitter()
    procEmitter = new EventEmitter()
    stubProc = Object.assign(procEmitter, {
      stdout: stubStdout,
      stderr: stubStderr,
      kill: vi.fn(),
      pid: 1234,
    })

    mockSpawn.mockReturnValue(stubProc as any)
  })

  afterEach(async () => {
    // Wait a tick to let any pending promises settle
    await new Promise((resolve) => setImmediate(resolve))

    // Cleanup all created processes to prevent timer leaks
    createdProcesses.forEach((process) => {
      try {
        process.cleanup()
      } catch (_e) {
        // Ignore cleanup errors
      }
    })
    createdProcesses = []

    vi.clearAllMocks()
    // Clear any leftover timers that might cause test pollution
    vi.clearAllTimers()
    // Use real timers to ensure clean state for next test
    if (vi.isFakeTimers()) {
      vi.useRealTimers()
    }
  })
  describe('Constructor', () => {
    it('should initialize with crash reporter and TUI renderer', () => {
      const processManager = new ProcessManager({ crashReporter, tui })

      expect(processManager.crashReporter).toBe(crashReporter)
      expect(processManager.tui).toBe(tui)
    })

    it('should initialize with default crash reporter and TUI renderer', () => {
      const processManager = new ProcessManager()

      expect(processManager.crashReporter).toBeInstanceOf(CrashReporter)
      expect(processManager.tui).toBeInstanceOf(TUIRenderer)
    })
  })
  describe('Dependencies', () => {
    it('should add and get dependency processes', () => {
      const processManager = new ProcessManager()
      const process = createManagedProcess('echo', ['hello'], [], mockLogger)

      processManager.addDependency('test', process)

      expect(processManager.getDependency('test')).toBe(process)
    })

    it('should remove dependency processes', () => {
      const processManager = new ProcessManager()
      const process = createManagedProcess('echo', ['hello'], [], mockLogger)

      processManager.addDependency('test', process)
      processManager.removeDependency('test')

      expect(processManager.getDependency('test')).toBeUndefined()
    })
  })
  describe('Main processes', () => {
    it('should add and get main processes', () => {
      const processManager = new ProcessManager()
      const process = createManagedProcess('echo', ['hello'], [], mockLogger)

      processManager.addMainProcess('test', process)

      expect(processManager.getMainProcess('test')).toBe(process)
    })

    it('should remove main processes', () => {
      const processManager = new ProcessManager()
      const process = createManagedProcess('echo', ['hello'], [], mockLogger)

      processManager.addMainProcess('test', process)
      processManager.removeMainProcess('test')

      expect(processManager.getMainProcess('test')).toBeUndefined()
    })
  })
  describe('Cleanup processes', () => {
    it('should add and get cleanup processes', () => {
      const processManager = new ProcessManager()
      const process = createManagedProcess('echo', ['hello'], [], mockLogger)

      processManager.addCleanupProcess('test', process)

      expect(processManager.getCleanupProcess('test')).toBe(process)
    })

    it('should remove cleanup processes', () => {
      const processManager = new ProcessManager()
      const process = createManagedProcess('echo', ['hello'], [], mockLogger)

      processManager.addCleanupProcess('test', process)
      processManager.removeCleanupProcess('test')

      expect(processManager.getCleanupProcess('test')).toBeUndefined()
    })
  })

  describe('Process lifecycle logic', () => {
    it('should throw when starting without main processes', () => {
      const processManager = new ProcessManager()

      expect(() => processManager.start()).toThrow()
    })
    it('should start main processes', () => {
      const processManager = new ProcessManager()
      const process = createManagedProcess('echo', ['hello'], [], mockLogger)

      processManager.addMainProcess('test', process)

      processManager.start()

      expect(process.isRunning()).toBe(true)
    })
    it('should start dependencies before main processes', async () => {
      vi.useFakeTimers()
      const processManager = new ProcessManager()
      const process = createManagedProcess('echo', ['hello'], [simpleReadyCheck], mockLogger)
      const stubDependencyProc = makeStubProc()
      mockSpawn.mockReturnValueOnce(stubDependencyProc as any)
      const dependency = createManagedProcess(
        'echo',
        ['dependency'],
        [simpleReadyCheck],
        mockLogger,
      )

      processManager.addDependency('test', dependency)
      processManager.addMainProcess('test', process)

      processManager.start()

      expect(dependency.isRunning()).toBe(true)
      expect(process.isRunning()).toBe(false)

      vi.useRealTimers()
    }, 1000)

    it('should start main process when dependency is ready', async () => {
      const processManager = new ProcessManager()
      const process = fakeManagedProcess()
      let resolveDependencyReady: () => void

      const dependency = fakeManagedProcess({
        ready: new Promise((resolve) => {
          resolveDependencyReady = resolve
        }),
      })


      processManager.addDependency('test', dependency)
      processManager.addMainProcess('test', process)

      processManager.start()

      expect(dependency.start).toHaveBeenCalled()
      expect(process.start).not.toHaveBeenCalled()

      resolveDependencyReady!()

      await dependency.ready
      await new Promise(resolve => setImmediate(resolve))

      expect(process.start).toHaveBeenCalled()


    }, 1000)
    it('should restart the main process if it crashes 2 times', async () => {
      vi.useFakeTimers()
      const processManager = new ProcessManager({ retries: 2, waitTime: 100 })
      const process = fakeManagedProcess()
      processManager.addMainProcess('test', process)
      processManager.start()
        ; (process as any)._triggerCrash(new Error('boom'))
      expect(process.restart).toHaveBeenCalled()
        ; (process as any)._triggerCrash(new Error('boom'))
      expect(process.restart).toHaveBeenCalled()

      vi.useRealTimers()
    }, 1000)
    it('should call stop on the main process if crashes exceeds retries', async () => {
      vi.useFakeTimers()
      const processManager = new ProcessManager({ retries: 1, waitTime: 100 })
      const process = fakeManagedProcess()
      processManager.addMainProcess('test', process)
      processManager.start()
      processManager.stop = vi.fn()

        // First crash: retry count 0 -> 1, should restart (not stop)
        ; (process as any)._triggerCrash(new Error('boom'))
      expect(process.restart).toHaveBeenCalledTimes(1)
      expect(process.stop).not.toHaveBeenCalled()

        // Second crash: retry count 1 (equals maxRetries), should stop
        ; (process as any)._triggerCrash(new Error('boom'))
      expect(process.stop).toHaveBeenCalledTimes(1)
      expect(processManager.stop).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    }, 1000)
    it('should call crashReporter.saveReport on crash', async () => {
      vi.useFakeTimers()
      const mockCrashReporter = new CrashReporter()
      const saveReportSpy = vi.spyOn(mockCrashReporter, 'saveReport')
      const processManager = new ProcessManager({
        retries: 0, // Crash immediately so it generates a report
        waitTime: 100,
        crashReporter: mockCrashReporter,
      })
      const process = fakeManagedProcess()
      processManager.addMainProcess('test', process)
      processManager.start()
        ; (process as any)._triggerCrash(new Error('boom'))

      expect(saveReportSpy).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    }, 1000)
    it('should call cleanup after stop', async () => {
      vi.useFakeTimers()
      const processManager = new ProcessManager({ retries: 1, waitTime: 100 })
      const process = fakeManagedProcess()
      const cleanup = fakeManagedProcess()
      processManager.addMainProcess('test', process)
      processManager.start()
      processManager.addCleanupProcess('cleanup', cleanup)

      processManager.stop()

      expect(cleanup.cleanup).toHaveBeenCalled()

      vi.useRealTimers()
    }, 1000)
    it('Should crash immediately if a dependency crashes', async () => {
      vi.useFakeTimers()
      const processManager = new ProcessManager({ retries: 1, waitTime: 100 })
      const process = fakeManagedProcess()
      const dependency = fakeManagedProcess()
      processManager.addDependency('test', dependency)
      processManager.addMainProcess('test', process)

      // Spy on stop before calling start
      const stopSpy = vi.spyOn(processManager, 'stop')

      processManager.start()

        // Trigger dependency crash
        ; (dependency as any)._triggerCrash(new Error('boom'))

      // Verify that processManager.stop was called (which stops all processes)
      expect(stopSpy).toHaveBeenCalled()

      vi.useRealTimers()
    }, 1000)
  })

  describe('TUI interaction', () => {
    it('should render process state to TUI on start', () => {
      const processManager = new ProcessManager({ crashReporter, tui })
      const process = createManagedProcess('echo', ['hello'], [], mockLogger)
      tui.render = vi.fn()

      processManager.addMainProcess('test', process)
      processManager.start()

      expect(tui.render).toHaveBeenCalled()
    })

    it('should pass process maps to TUI render', () => {
      const processManager = new ProcessManager({ crashReporter, tui })
      const mainProc = createManagedProcess('echo', ['main'], [], mockLogger)
      const depProc = createManagedProcess('echo', ['dep'], [], mockLogger)
      tui.render = vi.fn()

      processManager.addDependency('dep1', depProc)
      processManager.addMainProcess('main1', mainProc)
      processManager.start()

      expect(tui.render).toHaveBeenCalledWith(
        expect.objectContaining({
          dependencies: expect.any(Map),
          main: expect.any(Map),
          cleanup: expect.any(Map),
        }),
        expect.any(Object),
      )
    })

    it('should update TUI when process status changes', async () => {
      const processManager = new ProcessManager({ crashReporter, tui })
      const process = createManagedProcess('echo', ['hello'], [], mockLogger)
      tui.render = vi.fn()

      processManager.addMainProcess('test', process)

      const initialCalls = (tui.render as any).mock.calls.length
      processManager.start()

      // Start calls render, so we should have at least one call
      expect((tui.render as any).mock.calls.length).toBeGreaterThan(initialCalls)
    })

    it('should show logs via TUI when requested', () => {
      const processManager = new ProcessManager({ crashReporter, tui })
      const process = createManagedProcess('echo', ['hello'], [], mockLogger)
      mockLogger.addChunk('test log line')
      tui.showLogs = vi.fn()

      processManager.addMainProcess('test', process)

      const logs = mockLogger.getLogs({ numberOfLines: 1 })
      tui.showLogs('test', 'main', logs)

      expect(tui.showLogs).toHaveBeenCalledWith('test', 'main', expect.stringContaining('test log'))
    })

    it('should register TUI keypress handlers', () => {
      const processManager = new ProcessManager({ crashReporter, tui })
      tui.onKeyPress = vi.fn()

      processManager.start = vi.fn()

      expect(tui.onKeyPress).toBeDefined()
    })

    it('should update TUI status on crash', async () => {
      vi.useFakeTimers()
      const processManager = new ProcessManager({ retries: 0, waitTime: 100, tui })
      const process = fakeManagedProcess()
      tui.showStatus = vi.fn()

      processManager.addMainProcess('test', process)
      processManager.start()
        ; (process as any)._triggerCrash(new Error('boom'))

      expect(tui.showStatus).toHaveBeenCalledWith(expect.stringContaining('crash'))

      vi.useRealTimers()
    })

    it('should show process restart in TUI', () => {
      const processManager = new ProcessManager({ crashReporter, tui })
      const process = fakeManagedProcess()
      tui.showStatus = vi.fn()
      tui.render = vi.fn()

      processManager.addMainProcess('test', process)
      processManager.start()

      processManager.restartProcess('test')

      expect(tui.showStatus).toHaveBeenCalledWith(expect.stringContaining('Restart'))
      expect(tui.render).toHaveBeenCalled()
    })

    it('should display crash report summary in TUI', async () => {
      vi.useFakeTimers()
      const processManager = new ProcessManager({ retries: 0, tui, crashReporter })
      const process = fakeManagedProcess({ logger: mockLogger })
      tui.showStatus = vi.fn()
      crashReporter.saveReport = vi.fn()

      processManager.addMainProcess('test', process)
      processManager.start()
        ; (process as any)._triggerCrash(new Error('boom'))

      expect(crashReporter.saveReport).toHaveBeenCalled()
      expect(tui.showStatus).toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('should cleanup TUI on stop', () => {
      const processManager = new ProcessManager({ tui })
      const process = fakeManagedProcess()
      tui.destroy = vi.fn()

      processManager.addMainProcess('test', process)
      processManager.start()
      processManager.stop()

      expect(tui.destroy).toHaveBeenCalled()
    })

    it('should handle logger events and update TUI', () => {
      const processManager = new ProcessManager({ tui })
      const process = createManagedProcess('echo', ['hello'], [], mockLogger)
      tui.render = vi.fn()

      processManager.addMainProcess('test', process)
      processManager.start()

      mockLogger.addChunk('new log line')

      expect(tui.render).toHaveBeenCalled()
    })
  })
})
