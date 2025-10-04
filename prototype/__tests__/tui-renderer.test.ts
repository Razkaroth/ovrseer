import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('blessed')

import blessed from 'blessed'
import { TUIRenderer } from '../tui-renderer'
import { fakeManagedProcess } from './mocks'
import type { ProcessMap, TUIState } from '../types'

describe('TUIRenderer (blessed)', () => {
  let renderer: TUIRenderer
  let mockScreen: any
  let mockProcessList: any
  let mockLogBox: any
  let mockStatusBar: any
  let mockInstructionsBox: any

  beforeEach(() => {
    mockProcessList = {
      setItems: vi.fn((items) => {
        mockProcessList.items = items
      }),
      select: vi.fn(function (this: any, idx: number) {
        this.selected = idx
      }),
      focus: vi.fn(),
      on: vi.fn(),
      key: vi.fn(),
      up: vi.fn(),
      down: vi.fn(),
      selected: 0,
      items: [],
      width: 100,
      height: 30,
    }

    mockLogBox = {
      setContent: vi.fn(),
      focus: vi.fn(),
      width: 100,
      height: 30,
    }

    mockStatusBar = {
      setContent: vi.fn(),
    }

    mockInstructionsBox = {
      setContent: vi.fn(),
    }

    mockScreen = {
      key: vi.fn(),
      render: vi.fn(),
      destroy: vi.fn(),
      append: vi.fn(),
      title: '',
    }

    blessed.screen = vi.fn(() => mockScreen)
    blessed.list = vi.fn(() => mockProcessList)

    let boxCallCount = 0
    blessed.box = vi.fn(() => {
      boxCallCount++
      if (boxCallCount === 1) return mockInstructionsBox
      if (boxCallCount === 2) return mockLogBox
      return mockStatusBar
    })

    renderer = new TUIRenderer()
  })

  afterEach(() => {
    try {
      renderer.destroy()
    } catch (_e) {
      // ignore
    }
    vi.clearAllMocks()
  })

  describe('init()', () => {
    it('creates a blessed screen', () => {
      renderer.init()
      expect(blessed.screen).toHaveBeenCalled()
    })

    it('creates process list widget', () => {
      renderer.init()
      expect(blessed.list).toHaveBeenCalledWith(
        expect.objectContaining({
          label: expect.stringContaining('Process'),
        }),
      )
    })

    it('creates log box widget', () => {
      renderer.init()
      expect(blessed.box).toHaveBeenCalledWith(
        expect.objectContaining({
          label: expect.stringContaining('Log'),
        }),
      )
    })

    it('creates instructions box widget', () => {
      renderer.init()
      expect(blessed.box).toHaveBeenCalledWith(
        expect.objectContaining({
          width: '25%',
          height: '20%',
          top: '80%',
        }),
      )
    })

    it('registers quit key handlers (q, C-c)', () => {
      renderer.init()
      const cb = vi.fn()
      renderer.onKeyPress(cb)
      const calls = (mockScreen.key as any).mock.calls
      const hasQuit = calls.some((c: any[]) => Array.isArray(c[0]) && c[0].includes('q'))
      const hasCtrlC = calls.some((c: any[]) => Array.isArray(c[0]) && c[0].includes('C-c'))
      expect(hasQuit).toBe(true)
      expect(hasCtrlC).toBe(true)
    })

    it('appends widgets to screen', () => {
      renderer.init()
      expect(mockScreen.append).toHaveBeenCalledWith(mockProcessList)
      expect(mockScreen.append).toHaveBeenCalledWith(mockLogBox)
    })

    it('is idempotent - multiple calls safe', () => {
      renderer.init()
      renderer.init()
      expect(blessed.screen).toHaveBeenCalledTimes(1)
    })
  })

  describe('destroy()', () => {
    it('destroys screen if initialized', () => {
      renderer.init()
      renderer.destroy()
      expect(mockScreen.destroy).toHaveBeenCalled()
    })

    it('is safe when not initialized', () => {
      expect(() => renderer.destroy()).not.toThrow()
    })

    it('cleans up internal references', () => {
      renderer.init()
      renderer.destroy()
      renderer.destroy()
      expect(mockScreen.destroy).toHaveBeenCalledTimes(1)
    })
  })

  describe('render()', () => {
    it('updates process list with current processes', () => {
      const processes: ProcessMap = {
        dependencies: new Map([['dep1', fakeManagedProcess()]]),
        main: new Map([['main1', fakeManagedProcess()]]),
        cleanup: new Map([['cleanup1', fakeManagedProcess()]]),
      }
      const state: TUIState = { selectedProcessId: null }

      renderer.init()
      renderer.render(processes, state)

      expect(mockProcessList.setItems).toHaveBeenCalled()
      expect(mockScreen.render).toHaveBeenCalled()
    })

    it('formats process items with status indicators', () => {
      const running = fakeManagedProcess({ getStatus: vi.fn(() => 'running' as any) })
      const crashed = fakeManagedProcess({ getStatus: vi.fn(() => 'crashed' as any) })

      const processes: ProcessMap = {
        dependencies: new Map(),
        main: new Map([
          ['proc1', running],
          ['proc2', crashed],
        ]),
        cleanup: new Map(),
      }

      renderer.init()
      renderer.render(processes, {})

      const items = mockProcessList.setItems.mock.calls[0][0]
      expect(items).toEqual(expect.arrayContaining([expect.stringContaining('running')]))
      expect(items).toEqual(expect.arrayContaining([expect.stringContaining('crashed')]))
    })

    it('highlights selected process', () => {
      const processes: ProcessMap = {
        dependencies: new Map(),
        main: new Map([['main1', fakeManagedProcess()]]),
        cleanup: new Map(),
      }
      const state: TUIState = { selectedProcessId: 'main1', selectedProcessType: 'main' }

      renderer.init()
      renderer.render(processes, state)

      expect(mockProcessList.select).toHaveBeenCalled()
    })

    it('preserves hovered item when re-rendering without state changes', () => {
      const processes: ProcessMap = {
        dependencies: new Map(),
        main: new Map([
          ['main1', fakeManagedProcess()],
          ['main2', fakeManagedProcess()],
        ]),
        cleanup: new Map(),
      }

      renderer.init()

      mockProcessList.selected = 2
      renderer.render(processes, {})

      expect(mockProcessList.select).toHaveBeenCalledWith(2)
    })

    it('updates hovered item to match selected state when provided', () => {
      const processes: ProcessMap = {
        dependencies: new Map(),
        main: new Map([
          ['main1', fakeManagedProcess()],
          ['main2', fakeManagedProcess()],
        ]),
        cleanup: new Map(),
      }

      renderer.init()

      mockProcessList.selected = 2
      renderer.render(processes, { selectedProcessId: 'main1', selectedProcessType: 'main' })

      expect(mockProcessList.select).toHaveBeenCalledWith(1)
    })

    it('emits select event after render to sync logs', () => {
      const processes: ProcessMap = {
        dependencies: new Map(),
        main: new Map([['main1', fakeManagedProcess()]]),
        cleanup: new Map(),
      }

      renderer.init()

      const callback = vi.fn()
      renderer.onKeyPress(callback)

      renderer.render(processes, { selectedProcessId: 'main1', selectedProcessType: 'main' })

      expect(callback).toHaveBeenCalled()
      const selectCall = callback.mock.calls.find((c) => c[0] === 'select')
      expect(selectCall?.[1]).toEqual({ index: 0, processInfo: { id: 'main1', type: 'main' } })
    })

    it('maintains hovered position when process list length increases', () => {
      const processes1: ProcessMap = {
        dependencies: new Map(),
        main: new Map([['main1', fakeManagedProcess()]]),
        cleanup: new Map(),
      }

      const processes2: ProcessMap = {
        dependencies: new Map(),
        main: new Map([
          ['main1', fakeManagedProcess()],
          ['main2', fakeManagedProcess()],
        ]),
        cleanup: new Map(),
      }

      renderer.init()

      mockProcessList.selected = 1
      renderer.render(processes1, {})

      mockProcessList.selected = 1
      renderer.render(processes2, {})

      const lastCall =
        mockProcessList.select.mock.calls[mockProcessList.select.mock.calls.length - 1]
      expect(lastCall[0]).toBe(1)
    })

    it('adjusts hovered position when process list length decreases', () => {
      const processes1: ProcessMap = {
        dependencies: new Map(),
        main: new Map([
          ['main1', fakeManagedProcess()],
          ['main2', fakeManagedProcess()],
        ]),
        cleanup: new Map(),
      }

      const processes2: ProcessMap = {
        dependencies: new Map(),
        main: new Map([['main1', fakeManagedProcess()]]),
        cleanup: new Map(),
      }

      renderer.init()

      mockProcessList.selected = 2
      renderer.render(processes1, {})

      mockProcessList.selected = 2
      renderer.render(processes2, {})

      const lastCall =
        mockProcessList.select.mock.calls[mockProcessList.select.mock.calls.length - 1]
      expect(lastCall[0]).toBeLessThan(2)
    })

    it('groups processes by type (dependencies, main, cleanup)', () => {
      const processes: ProcessMap = {
        dependencies: new Map([['dep1', fakeManagedProcess()]]),
        main: new Map([['main1', fakeManagedProcess()]]),
        cleanup: new Map([['cleanup1', fakeManagedProcess()]]),
      }

      renderer.init()
      renderer.render(processes, {})

      const items = mockProcessList.setItems.mock.calls[0][0]
      expect(items.length).toBeGreaterThanOrEqual(3)
    })

    it('handles empty process maps', () => {
      const processes: ProcessMap = {
        dependencies: new Map(),
        main: new Map(),
        cleanup: new Map(),
      }

      renderer.init()
      expect(() => renderer.render(processes, {})).not.toThrow()
    })

    it('updates screen on each render', () => {
      const processes: ProcessMap = {
        dependencies: new Map(),
        main: new Map([['main1', fakeManagedProcess()]]),
        cleanup: new Map(),
      }

      renderer.init()
      renderer.render(processes, {})
      renderer.render(processes, {})

      expect(mockScreen.render).toHaveBeenCalledTimes(2)
    })
  })

  describe('showLogs()', () => {
    it('displays logs in log box', () => {
      const logs = 'line1\nline2\nline3'
      renderer.init()
      renderer.showLogs('pid', 'main', logs)

      expect(mockLogBox.setContent).toHaveBeenCalledWith(expect.stringContaining('line1'))
      expect(mockScreen.render).toHaveBeenCalled()
    })

    it('handles empty logs', () => {
      renderer.init()
      expect(() => renderer.showLogs('pid', 'main', '')).not.toThrow()
    })

    it('includes process identifier in display', () => {
      renderer.init()
      renderer.showLogs('test-proc', 'main', 'logs')

      expect(mockLogBox.setContent).toHaveBeenCalledWith(expect.stringContaining('test-proc'))
    })

    it('handles multi-line logs with proper formatting', () => {
      const logs = 'line1\nline2\nline3\nline4\nline5'
      renderer.init()
      renderer.showLogs('pid', 'main', logs)

      expect(mockLogBox.setContent).toHaveBeenCalled()
    })
  })

  describe('onKeyPress()', () => {
    it('registers select event handler on processList', () => {
      const callback = vi.fn()
      renderer.init()
      renderer.onKeyPress(callback)

      expect(mockProcessList.on).toHaveBeenCalledWith('select', expect.any(Function))
    })

    it('calls callback with select event and processInfo when item selected', () => {
      const callback = vi.fn()
      const processes: ProcessMap = {
        dependencies: new Map(),
        main: new Map([['main1', fakeManagedProcess()]]),
        cleanup: new Map(),
      }

      renderer.init()
      renderer.render(processes, {})
      renderer.onKeyPress(callback)

      // onKeyPress registers 'select' handler; simulate blessed emitting selection
      const selectHandler = mockProcessList.on.mock.calls.find((c) => c[0] === 'select')?.[1]
      expect(selectHandler).toBeDefined()
      selectHandler('item text', 1)

      // Our renderer now emits current selection via emitCurrentSelection which uses actual selected index
      // Ensure callback received select
      const selectCalls = callback.mock.calls.filter((c) => c[0] === 'select')
      expect(selectCalls.length).toBeGreaterThan(0)
      expect(selectCalls[0][1]).toEqual({ index: 0, processInfo: { id: 'main1', type: 'main' } })
    })

    it('skips header and emits selection for first process when header clicked', () => {
      const callback = vi.fn()
      const processes: ProcessMap = {
        dependencies: new Map(),
        main: new Map([['main1', fakeManagedProcess()]]),
        cleanup: new Map(),
      }

      renderer.init()
      renderer.render(processes, {})
      renderer.onKeyPress(callback)

      const selectHandler = mockProcessList.on.mock.calls.find((c) => c[0] === 'select')?.[1]
      expect(selectHandler).toBeDefined()
      selectHandler('{bold}Main:{/bold}', 0)

      const selectCalls = callback.mock.calls.filter((c) => c[0] === 'select')
      expect(selectCalls.length).toBe(1)
      expect(selectCalls[0][1]).toEqual({ index: 0, processInfo: { id: 'main1', type: 'main' } })
      expect(mockProcessList.select).toHaveBeenCalledWith(1)
    })

    it('handles action keys (r for restart)', () => {
      const callback = vi.fn()
      renderer.init()
      renderer.onKeyPress(callback)

      expect(mockScreen.key).toHaveBeenCalledWith(
        expect.arrayContaining(['r']),
        expect.any(Function),
      )
    })

    it('handles tab key for focus switching', () => {
      const callback = vi.fn()
      renderer.init()
      renderer.onKeyPress(callback)

      expect(mockScreen.key).toHaveBeenCalledWith(['tab'], expect.any(Function))
    })

    it('handles enter key for viewing logs', () => {
      const callback = vi.fn()
      renderer.init()
      renderer.onKeyPress(callback)

      expect(mockScreen.key).toHaveBeenCalledWith(['enter'], expect.any(Function))
    })

    it('forwards q key to callback', () => {
      const callback = vi.fn()
      renderer.init()
      renderer.onKeyPress(callback)
      const qHandler = mockScreen.key.mock.calls.find((call) => call[0][0] === 'q')?.[1]
      expect(qHandler).toBeDefined()
      qHandler?.()
      expect(callback).toHaveBeenCalledWith('q')
    })
  })

  describe('showStatus()', () => {
    it('displays status message in status bar', () => {
      renderer.init()
      renderer.showStatus('All systems operational')

      expect(mockStatusBar.setContent).toHaveBeenCalledWith(
        expect.stringContaining('All systems operational'),
      )
      expect(mockScreen.render).toHaveBeenCalled()
    })

    it('handles empty status messages', () => {
      renderer.init()
      expect(() => renderer.showStatus('')).not.toThrow()
    })

    it('updates status on subsequent calls', () => {
      renderer.init()
      renderer.showStatus('Status 1')
      renderer.showStatus('Status 2')

      expect(mockStatusBar.setContent).toHaveBeenCalledTimes(2)
      expect(mockStatusBar.setContent).toHaveBeenLastCalledWith(expect.stringContaining('Status 2'))
    })
  })

  describe('neo-blessed integration', () => {
    it('configures screen with correct options', () => {
      renderer.init()

      expect(blessed.screen).toHaveBeenCalledWith(
        expect.objectContaining({
          smartCSR: true,
        }),
      )
    })

    it('configures process list as scrollable', () => {
      renderer.init()

      expect(blessed.list).toHaveBeenCalledWith(
        expect.objectContaining({
          scrollable: true,
        }),
      )
    })

    it('configures log box as scrollable', () => {
      renderer.init()

      expect(blessed.box).toHaveBeenCalledWith(
        expect.objectContaining({
          scrollable: true,
        }),
      )
    })

    it('uses borders for visual separation', () => {
      renderer.init()

      expect(blessed.list).toHaveBeenCalledWith(
        expect.objectContaining({
          border: expect.objectContaining({ type: 'line' }),
        }),
      )
    })
  })

  describe('header navigation', () => {
    it('skips headers when navigating down', () => {
      const processes: ProcessMap = {
        dependencies: new Map([['dep1', fakeManagedProcess()]]),
        main: new Map([['main1', fakeManagedProcess()]]),
        cleanup: new Map(),
      }

      renderer.init()
      renderer.render(processes, {})
      mockProcessList.selected = 1

      renderer.selectNext()

      expect(mockProcessList.select).toHaveBeenCalledWith(3)
    })

    it('skips headers when navigating up', () => {
      const processes: ProcessMap = {
        dependencies: new Map([['dep1', fakeManagedProcess()]]),
        main: new Map([['main1', fakeManagedProcess()]]),
        cleanup: new Map(),
      }

      renderer.init()
      renderer.render(processes, {})
      mockProcessList.selected = 3

      renderer.selectPrevious()

      expect(mockProcessList.select).toHaveBeenCalledWith(1)
    })

    it('stays on first valid item when navigating up from first item', () => {
      const processes: ProcessMap = {
        dependencies: new Map([['dep1', fakeManagedProcess()]]),
        main: new Map(),
        cleanup: new Map(),
      }

      renderer.init()
      renderer.render(processes, {})
      mockProcessList.selected = 1
      mockProcessList.select.mockClear()

      renderer.selectPrevious()

      expect(mockProcessList.select).not.toHaveBeenCalled()
    })

    it('stays on last valid item when navigating down from last item', () => {
      const processes: ProcessMap = {
        dependencies: new Map([['dep1', fakeManagedProcess()]]),
        main: new Map(),
        cleanup: new Map(),
      }

      renderer.init()
      renderer.render(processes, {})
      mockProcessList.selected = 1
      mockProcessList.select.mockClear()

      renderer.selectNext()

      expect(mockProcessList.select).not.toHaveBeenCalled()
    })

    it('prevents action keys on headers (restart)', () => {
      const callback = vi.fn()
      const processes: ProcessMap = {
        dependencies: new Map(),
        main: new Map([['main1', fakeManagedProcess()]]),
        cleanup: new Map(),
      }

      renderer.init()
      renderer.render(processes, {})
      renderer.onKeyPress(callback)
      mockProcessList.selected = 0

      const restartHandler = mockScreen.key.mock.calls.find((call) => call[0][0] === 'r')?.[1]
      restartHandler?.()

      expect(callback).not.toHaveBeenCalledWith('r', expect.anything())
    })

    it('prevents action keys on headers (enter)', () => {
      const callback = vi.fn()
      const processes: ProcessMap = {
        dependencies: new Map(),
        main: new Map([['main1', fakeManagedProcess()]]),
        cleanup: new Map(),
      }

      renderer.init()
      renderer.render(processes, {})
      renderer.onKeyPress(callback)
      mockProcessList.selected = 0

      const enterHandler = mockScreen.key.mock.calls.find((call) => call[0][0] === 'enter')?.[1]
      enterHandler?.()

      expect(callback).not.toHaveBeenCalledWith('enter', expect.anything())
    })
  })
})
