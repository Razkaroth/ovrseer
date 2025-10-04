import type { TUIRendererI, ProcessMap, TUIState, TUIProcessType, TUIKeyPressMeta } from './types'
import blessed from 'blessed'
import type { Widgets } from 'blessed'

export class TUIRenderer implements TUIRendererI {
  private screen: Widgets.Screen | null = null
  private processList: Widgets.ListElement | null = null
  private logBox: Widgets.BoxElement | null = null
  private statusBar: Widgets.BoxElement | null = null
  private instructionsBox: Widgets.BoxElement | null = null
  private initialized = false
  private isRendering = false
  private pendingRender = false
  private processIndex: Array<{ id: string; type: TUIProcessType }> = []
  private shouldEmitSelectEvent = true
  private headerIndices: Set<number> = new Set()
  private selectionCallback?: (key: string, meta?: TUIKeyPressMeta) => void

  init(): void {
    if (this.initialized) return

    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Process Manager',
    })

    this.processList = blessed.list({
      parent: this.screen,
      label: ' Processes ',
      top: 0,
      left: 0,
      width: '25%',
      height: '80%',
      scrollable: true,
      keys: true,
      mouse: true,
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        selected: {
          bg: 'blue',
        },
        border: {
          fg: 'cyan',
        },
      },
    })

    this.instructionsBox = blessed.box({
      parent: this.screen,
      top: '80%',
      left: 0,
      width: '25%',
      height: '20%',
      content: `↑/↓ navigate  enter logs\nr restart selected  R/Ctrl-R restart all\nq quit (twice=force)`,
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        border: {
          fg: 'cyan',
        },
      },
    })

    this.logBox = blessed.box({
      parent: this.screen,
      label: ' Logs ',
      top: 0,
      left: '25%',
      width: '75%',
      height: '80%',
      scrollable: true,
      keys: true,
      mouse: true,
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        border: {
          fg: 'cyan',
        },
      },
    })

    this.statusBar = blessed.box({
      parent: this.screen,
      top: '80%',
      left: '25%',
      width: '75%',
      height: '20%',
      content: 'q: quit (twice=force) | r restart | R/Ctrl-R restart all',
      style: {
        fg: 'white',
        bg: 'blue',
      },
    })

    this.screen.append(this.processList)
    this.screen.append(this.instructionsBox)
    this.screen.append(this.logBox)
    this.screen.append(this.statusBar)

    this.initialized = true
  }

  destroy(): void {
    if (!this.screen) return

    try {
      this.screen.destroy()
    } catch (_e) {
      // ignore
    }

    this.screen = null
    this.processList = null
    this.logBox = null
    this.statusBar = null
    this.instructionsBox = null
    this.initialized = false
  }

  render(processes: ProcessMap, state: TUIState): void {
    if (!this.processList || !this.screen) return

    if (this.isRendering) {
      this.pendingRender = true
      return
    }

    this.isRendering = true

    try {
      const items: string[] = []
      const newProcessIndex: Array<{ id: string; type: TUIProcessType }> = []
      const processIndexToItemIndex: number[] = []
      const newHeaderIndices: Set<number> = new Set()

      if (processes.dependencies.size > 0) {
        newHeaderIndices.add(items.length)
        items.push('{bold}Dependencies:{/bold}')
        for (const [id, proc] of processes.dependencies) {
          const status = proc.getStatus()
          const statusIcon = this.getStatusIcon(status)
          processIndexToItemIndex.push(items.length)
          items.push(`  ${statusIcon} ${id} [${status}]`)
          newProcessIndex.push({ id, type: 'dependency' })
        }
      }

      if (processes.main.size > 0) {
        newHeaderIndices.add(items.length)
        items.push('{bold}Main:{/bold}')
        for (const [id, proc] of processes.main) {
          const status = proc.getStatus()
          const statusIcon = this.getStatusIcon(status)
          processIndexToItemIndex.push(items.length)
          items.push(`  ${statusIcon} ${id} [${status}]`)
          newProcessIndex.push({ id, type: 'main' })
        }
      }

      if (processes.cleanup.size > 0) {
        newHeaderIndices.add(items.length)
        items.push('{bold}Cleanup:{/bold}')
        for (const [id, proc] of processes.cleanup) {
          const status = proc.getStatus()
          const statusIcon = this.getStatusIcon(status)
          processIndexToItemIndex.push(items.length)
          items.push(`  ${statusIcon} ${id} [${status}]`)
          newProcessIndex.push({ id, type: 'cleanup' })
        }
      }

      this.headerIndices = newHeaderIndices

      // Set list items and index mapping
      this.processList.setItems(items)
      this.processIndex = newProcessIndex

      // Prevent recursive select event while we adjust selection
      this.shouldEmitSelectEvent = false

      let targetIndex: number
      const currentBlessedSelection = (this.processList as any).selected
      targetIndex = currentBlessedSelection !== undefined ? currentBlessedSelection : 0

      // If state provides a selected process, prefer that
      if (state.selectedProcessId && state.selectedProcessType) {
        const idx = this.processIndex.findIndex(
          (p) => p.id === state.selectedProcessId && p.type === state.selectedProcessType,
        )
        if (idx >= 0 && idx < processIndexToItemIndex.length) {
          targetIndex = processIndexToItemIndex[idx]
        }
      }

      if (targetIndex >= items.length) {
        targetIndex = Math.max(0, items.length - 1)
      }

      targetIndex = this.skipHeaders(targetIndex, items.length)

      this.processList.select(targetIndex)

      this.shouldEmitSelectEvent = true

      this.screen.render()
      // Emit selection after render so initial logs show
      this.emitCurrentSelection()
    } finally {
      this.isRendering = false

      if (this.pendingRender) {
        this.pendingRender = false
        setImmediate(() => this.render(processes, state))
      }
    }
  }

  onKeyPress(callback: (key: string, meta?: TUIKeyPressMeta) => void): void {
    if (!this.screen || !this.processList) return

    // Persist callback for programmatic emission
    this.selectionCallback = callback

    this.processList.on('select', (_item: Widgets.BlessedElement, index: number) => {
      if (!this.shouldEmitSelectEvent) return

      let effectiveIndex = index
      if (this.headerIndices.has(effectiveIndex)) {
        const items = (this.processList as any).items || []
        this.shouldEmitSelectEvent = false
        effectiveIndex = this.skipHeaders(effectiveIndex, items.length)
        this.processList!.select(effectiveIndex)
        this.shouldEmitSelectEvent = true
        if (this.headerIndices.has(effectiveIndex)) return
      }

      this.emitCurrentSelection()
    })

    // Arrow navigation should auto-emit selection without needing enter
    this.processList.on('keypress', (_ch: string, key: any) => {
      if (key?.name === 'up' || key?.name === 'down') {
        setImmediate(() => {
          const list: any = this.processList
          const items = list.items || []
          let current = list.selected
          if (current === undefined) return

          // Determine direction based on key pressed
          const direction = key.name === 'down' ? 1 : -1

          // If landed on a header, move further in the same direction
          if (this.headerIndices.has(current)) {
            this.shouldEmitSelectEvent = false
            current = this.advanceToNextSelectable(current, direction, items.length)
            list.select(current)
            this.shouldEmitSelectEvent = true
          }

          // If still header (edge cases), try opposite direction fallback
          if (this.headerIndices.has(current)) {
            this.shouldEmitSelectEvent = false
            current = this.advanceToNextSelectable(current, direction * -1, items.length)
            list.select(current)
            this.shouldEmitSelectEvent = true
          }

          if (!this.headerIndices.has(current)) {
            this.emitCurrentSelection()
          }
        })
      }
    })

    this.screen.key(['r'], () => {
      const selected = (this.processList as any).selected
      if (this.headerIndices.has(selected)) return
      const map = this.getItemIndexToProcessIndex()
      const idx = map.get(selected)
      if (idx !== undefined) {
        const processInfo = this.processIndex[idx]
        if (processInfo) callback('r', { processInfo })
      }
    })

    this.screen.key(['R'], () => {
      callback('R')
    })

    this.screen.key(['C-r'], () => {
      callback('C-r')
    })

    this.screen.key(['tab'], () => {
      callback('tab')
    })

    // Keep enter for any explicit actions consumers may still expect
    this.screen.key(['enter'], () => {
      const selected = (this.processList as any).selected
      if (this.headerIndices.has(selected)) return
      const map = this.getItemIndexToProcessIndex()
      const idx = map.get(selected)
      if (idx !== undefined) {
        const processInfo = this.processIndex[idx]
        if (processInfo) callback('enter', { processInfo })
      }
    })

    this.screen.key(['q'], () => {
      callback('q')
    })

    this.screen.key(['C-c'], () => {
      callback('C-c')
    })

    this.processList.focus()
  }

  showLogs(processId: string, processType: TUIProcessType, logs: string): void {
    if (!this.logBox || !this.screen) return

    const content = `{bold}${processType}:${processId}{/bold}\n\n${logs}`
    this.logBox.setContent(content)
    this.screen.render()
  }

  showStatus(message: string): void {
    if (!this.statusBar || !this.screen) return

    this.statusBar.setContent(message)
    this.screen.render()
  }

  showInstructions(message: string): void {
    if (!this.instructionsBox || !this.screen) return
    this.instructionsBox.setContent(message)
    this.screen.render()
  }

  selectPrevious(): void {
    if (!this.processList || !this.screen) return

    const currentIndex = (this.processList as any).selected
    let targetIndex = currentIndex - 1

    while (targetIndex >= 0 && this.headerIndices.has(targetIndex)) {
      targetIndex--
    }

    if (targetIndex >= 0 && targetIndex !== currentIndex) {
      this.shouldEmitSelectEvent = false
      this.processList.select(targetIndex)
      this.shouldEmitSelectEvent = true
      this.emitCurrentSelection()
    }

    this.screen.render()
  }

  selectNext(): void {
    if (!this.processList || !this.screen) return

    const currentIndex = (this.processList as any).selected
    const items = (this.processList as any).items || []
    const maxIndex = items.length - 1
    let targetIndex = currentIndex + 1

    while (targetIndex <= maxIndex && this.headerIndices.has(targetIndex)) {
      targetIndex++
    }

    if (targetIndex <= maxIndex && targetIndex !== currentIndex) {
      this.shouldEmitSelectEvent = false
      this.processList.select(targetIndex)
      this.shouldEmitSelectEvent = true
      this.emitCurrentSelection()
    }

    this.screen.render()
  }

  private emitCurrentSelection(): void {
    if (!this.selectionCallback || !this.processList) return
    const selected = (this.processList as any).selected
    if (this.headerIndices.has(selected)) return
    const map = this.getItemIndexToProcessIndex()
    const idx = map.get(selected)
    if (idx === undefined) return
    const processInfo = this.processIndex[idx]
    if (!processInfo) return
    this.selectionCallback('select', { index: idx, processInfo })
  }

  private advanceToNextSelectable(start: number, direction: number, max: number): number {
    let idx = start
    while (idx >= 0 && idx < max && this.headerIndices.has(idx)) {
      idx += direction
    }
    if (idx < 0 || idx >= max) return start
    return idx
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'running':
        return '▶'
      case 'stopped':
        return '■'
      case 'crashed':
        return '✖'
      case 'starting':
        return '⋯'
      case 'stopping':
        return '⋯'
      default:
        return '○'
    }
  }

  private skipHeaders(index: number, maxIndex: number): number {
    let targetIndex = index

    while (targetIndex < maxIndex && this.headerIndices.has(targetIndex)) {
      targetIndex++
    }

    if (targetIndex >= maxIndex) {
      targetIndex = index - 1
      while (targetIndex >= 0 && this.headerIndices.has(targetIndex)) {
        targetIndex--
      }
    }

    return Math.max(0, targetIndex)
  }

  private getItemIndexToProcessIndex(): Map<number, number> {
    const map = new Map<number, number>()
    const items = (this.processList as any)?.items || []
    let processIndex = 0

    for (let i = 0; i < items.length; i++) {
      if (this.headerIndices.has(i)) continue
      map.set(i, processIndex)
      processIndex++
    }

    return map
  }
}
