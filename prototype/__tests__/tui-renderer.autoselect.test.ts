import { TUIRenderer } from '../tui-renderer'
import type { ProcessMap, TUIState } from '../types'
import { fakeManagedProcess } from './mocks'

// Blessed requires a TTY; we stub minimal screen methods via actual init then destroy safely after.

describe('TUIRenderer auto-selection', () => {
  let tui: TUIRenderer
  beforeEach(() => {
    tui = new TUIRenderer()
    tui.init()
  })
  afterEach(() => {
    tui.destroy()
  })

  function buildProcesses(count: number): ProcessMap {
    const deps = new Map()
    const mains = new Map()
    for (let i = 0; i < count; i++) {
      mains.set(`main-${i}`, fakeManagedProcess())
    }
    return { dependencies: deps, main: mains, cleanup: new Map() }
  }

  it('emits select immediately after first render', () => {
    const processes = buildProcesses(2)
    const state: TUIState = { selectedProcessId: undefined, selectedProcessType: undefined }

    const cb = vi.fn()
    tui.onKeyPress(cb)
    tui.render(processes, state)

    // Allow any async emit (setImmediate) to flush
    return new Promise<void>((resolve) => setImmediate(() => {
      expect(cb).toHaveBeenCalled()
      const calls = cb.mock.calls.filter(c => c[0] === 'select')
      expect(calls.length).toBeGreaterThanOrEqual(1)
      const meta = calls[0][1]
      expect(meta.processInfo.id.startsWith('main-')).toBe(true)
      resolve()
    }))
  })
})
