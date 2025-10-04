import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
vi.mock('blessed')
import blessed from 'blessed'
import { TUIRenderer } from '../tui-renderer'
import type { ProcessMap, TUIState } from '../types'
import { fakeManagedProcess } from './mocks'

// These tests exercise the arrow key header skipping logic by simulating the 'keypress' event
// that blessed would emit to the processList widget. We directly invoke the registered handler.

describe('TUIRenderer arrow key navigation header skipping', () => {
  let tui: TUIRenderer

  let mockProcessList: any
  let mockScreen: any

  beforeEach(() => {
    mockProcessList = {
      setItems: vi.fn(function (items) { this.items = items }),
      select: vi.fn(function (this: any, idx: number) { this.selected = idx }),
      focus: vi.fn(),
      on: vi.fn(),
      key: vi.fn(),
      selected: 0,
      items: [],
    }
    mockScreen = { key: vi.fn(), render: vi.fn(), destroy: vi.fn(), append: vi.fn() }
    ;(blessed as any).screen = vi.fn(() => mockScreen)
    ;(blessed as any).list = vi.fn(() => mockProcessList)
    ;(blessed as any).box = vi.fn(() => ({ setContent: vi.fn() }))
    tui = new TUIRenderer()
    tui.init()
  })

  afterEach(() => {
    tui.destroy()
  })

  function buildProcesses(): ProcessMap {
    return {
      dependencies: new Map([
        ['dep1', fakeManagedProcess()],
        ['dep2', fakeManagedProcess()],
      ]),
      main: new Map([
        ['main1', fakeManagedProcess()],
        ['main2', fakeManagedProcess()],
      ]),
      cleanup: new Map([
        ['clean1', fakeManagedProcess()],
      ]),
    }
  }

  function setup(): { keypressHandler: Function; list: any } {
    const processes = buildProcesses()
    const state: TUIState = { selectedProcessId: undefined, selectedProcessType: undefined }
    const cb = vi.fn()
    tui.onKeyPress(cb)
    tui.render(processes, state)

    // Locate keypress handler (accessing private for test)
    const list = mockProcessList
    const keypressHandler = list.on.mock.calls.find((c: any) => c[0] === 'keypress')?.[1]
    return { keypressHandler, list }
  }

  it('never leaves selection on a header when pressing down', async () => {
    const { keypressHandler, list } = setup()

    // Start selection at first real process after initial auto-select (should not be header)
    expect(list.selected).not.toBe(0)

    for (let i = 0; i < 15; i++) {
      keypressHandler('', { name: 'down' })
      await new Promise(r => setImmediate(r))
      // Ensure not a header index: headers at 0, 3, 6 with this dataset
      expect([0, 3, 6]).not.toContain(list.selected)
    }
  })

  it('never leaves selection on a header when pressing up', async () => {
    const { keypressHandler, list } = setup()

    // Move selection to near end by simulating downs
    for (let i = 0; i < 6; i++) {
      keypressHandler('', { name: 'down' })
      // flush async
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setImmediate(r))
    }

    for (let i = 0; i < 10; i++) {
      keypressHandler('', { name: 'up' })
      await new Promise(r => setImmediate(r))
      expect([0, 3, 6]).not.toContain(list.selected)
    }
  })
})
