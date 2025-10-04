import { TUIRenderer } from '../tui-renderer'
import type { ProcessMap, TUIState } from '../types'
import { fakeManagedProcess } from './mocks'

function buildProcesses(): ProcessMap {
  return {
    dependencies: new Map(),
    main: new Map([
      ['a', fakeManagedProcess()],
      ['b', fakeManagedProcess()],
      ['c', fakeManagedProcess()],
    ]),
    cleanup: new Map(),
  }
}

describe('TUIRenderer navigation auto-select', () => {
  let tui: TUIRenderer
  beforeEach(() => {
    tui = new TUIRenderer()
    tui.init()
  })
  afterEach(() => {
    tui.destroy()
  })

  it('emits select on selectNext/selectPrevious without enter', async () => {
    const processes = buildProcesses()
    const state: TUIState = { selectedProcessId: undefined, selectedProcessType: undefined }
    const cb = vi.fn()
    tui.onKeyPress(cb)
    tui.render(processes, state)

    await new Promise(r => setImmediate(r))
    cb.mockClear()

    tui.selectNext()
    await new Promise(r => setImmediate(r))
    expect(cb).toHaveBeenCalled()
    const nextCalls = cb.mock.calls.filter(c => c[0] === 'select')
    expect(nextCalls.length).toBe(1)

    cb.mockClear()
    tui.selectPrevious()
    await new Promise(r => setImmediate(r))
    const prevCalls = cb.mock.calls.filter(c => c[0] === 'select')
    expect(prevCalls.length).toBe(1)
  })
})
