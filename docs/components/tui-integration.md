# TUI Integration (Ink)

## Overview

`@ovrseer/tui-ink` provides a production-ready terminal user interface that displays real-time process status, logs, and flags in an interactive, keyboard-driven interface. Built on React Ink, the TUI transforms Ovrseer's event stream into a rich visual dashboard for development and debugging.

The TUI is not just a status display—it's a **fully interactive control panel** for your process orchestration system, with live flag monitoring, expandable log views, and direct process control.

## Key Features

- **Real-time process monitoring** across all three lifecycle phases (dependencies, main, cleanup)
- **Interactive flag panel** with expandable match views and context windows
- **Live log streaming** with on-demand full log views
- **Keyboard-driven controls** for restarting, stopping, and inspecting processes
- **Event-driven updates** synchronized with Ovrseer's lifecycle
- **Crash reporting integration** with immediate visual feedback

## Architecture

The TUI consists of three layers:

1. **InkTUIWrapper** - Base renderer implementing the `TUIRendererI` interface
2. **InkTUI** - Manager integration layer that subscribes to Ovrseer events
3. **InkTUIRenderer** - React component tree for visual layout

```
┌─────────────────────────────────────────┐
│  InkTUI (Event Handler)                 │
│  - Subscribes to 15+ Ovrseer events     │
│  - Manages keyboard input routing       │
│  - Handles flag panel state             │
└─────────────┬───────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────┐
│  InkTUIWrapper (Renderer)               │
│  - Manages Ink render instance          │
│  - Handles re-render cycles             │
│  - Provides render/showLogs/showStatus  │
└─────────────┬───────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────┐
│  InkTUIRenderer (React Component)       │
│  - Process list layout                  │
│  - Flag panel rendering                 │
│  - Status bar and log viewer            │
└─────────────────────────────────────────┘
```

## Basic Usage

```ts
import {Ovrseer, ProcessUnit, ProcessLogger} from '@ovrseer/core';
import {InkTUI} from '@ovrseer/tui-ink';

const manager = new Ovrseer({retries: 3});
const tui = new InkTUI();

const dbLogger = new ProcessLogger(1000, 100);
dbLogger.addFlag('errors', {
	pattern: /error/i,
	color: 'red',
	targetCount: 0,
	contextWindowSize: 5,
});

const db = new ProcessUnit(
	'node',
	['db-server.js'],
	[{logPattern: /listening/, timeout: 5000}],
	dbLogger,
);

manager.addDependency('database', db);

tui.init();
tui.attachToManager(manager);
manager.start();
```

The TUI will now display real-time status updates, process states, and flag matches as your processes run.

## Keyboard Controls

### Global Controls

| Key             | Action          | Description                             |
| --------------- | --------------- | --------------------------------------- |
| `q` or `Ctrl+C` | Quit            | Stops all processes and exits           |
| `s`             | Start           | Starts the Ovrseer manager              |
| `r`             | Restart Process | Restarts the currently selected process |
| `R` or `Ctrl+R` | Restart All     | Restarts all main processes             |

### Process Navigation

| Key                    | Action         | Description                              |
| ---------------------- | -------------- | ---------------------------------------- |
| `↑`/`↓` or Mouse Click | Select Process | Navigate through process list            |
| `Enter`                | View Logs      | Opens full log view for selected process |

### Flag Panel Controls

| Key                     | Action            | Description                                   |
| ----------------------- | ----------------- | --------------------------------------------- |
| `f`                     | Toggle Flag Panel | Expands/collapses flag panel                  |
| `↑`/`↓` (in flag panel) | Navigate Flags    | Move between flags and matches                |
| `Enter` (in flag panel) | Expand/Collapse   | Toggle flag match expansion or context window |

## Event Integration

The TUI subscribes to all Ovrseer events and updates the display in real-time:

### Lifecycle Events

```ts
manager:started     → "Manager started"
manager:stopping    → "Stopping all processes..."
manager:stopped     → "All processes stopped"
manager:restarting  → "Restarting all processes..."
```

### Process Events

```ts
process:ready       → "Process {id} is ready" + re-render
process:crashed     → "Process {id} crashed: {error}" + re-render
process:started     → Re-render process list
process:stopping    → Re-render process list
process:stopped     → Re-render process list
process:restarting  → "Restarting process {id}..." + re-render
process:log         → Auto-update logs if viewing that process
```

### Dependency & Cleanup Events

```ts
dependency:failed   → "Dependency {id} failed: {error}"
cleanup:started     → "Running cleanup processes..."
cleanup:finished    → "Cleanup finished"
cleanup:timeout     → "Cleanup process {id} timeout: {error}"
```

### State Updates

```ts
state:update        → Full re-render with updated process map
status:message      → Update status bar message
```

## Flag Panel Deep Dive

The flag panel provides **interactive log analysis** without leaving the TUI. When you press `f`, the panel expands to show all flags for the selected process:

```
┌─ Flags for web-server ────────────────┐
│ ⚠ errors (0/0 matches) [red]          │
│ → requests (127 matches) [yellow]     │
│   ├─ GET /api/users                    │
│   ├─ POST /api/orders                  │
│   └─ ...                               │
│ ✓ slow-queries (0 matches) [orange]   │
└────────────────────────────────────────┘
```

### Flag Panel State

The TUI maintains several pieces of flag panel state:

```ts
interface TUIState {
	flagPanelSize?: 'collapsed' | 'expanded';
	flagPanelFocused?: boolean;
	selectedFlagNode?: string; // e.g., "flag:errors" or "flag:errors:match:0"
	expandedFlagNodes?: Set<string>; // Which flags show their matches
	matchContextVisible?: Set<string>; // Which matches show context windows
}
```

### Flag Navigation Pattern

```ts
// User presses 'f' to expand flag panel
flagPanelSize: 'collapsed' → 'expanded'
flagPanelFocused: true
selectedFlagNode: 'flag:errors' // First flag auto-selected

// User presses ↓ to navigate
selectedFlagNode: 'flag:errors' → 'flag:requests'

// User presses Enter to expand flag matches
expandedFlagNodes: Set(['flag:requests'])
// Now showing individual matches under 'requests' flag

// User navigates to a match and presses Enter
matchContextVisible: Set(['flag:requests:match:0'])
// Now showing context window (surrounding log lines)
```

### Building the Flat Flag Tree

The TUI flattens the hierarchical flag structure for keyboard navigation:

```ts
buildFlatFlagTree(): string[]
// Returns: [
//   'flag:errors',
//   'flag:requests',
//   'flag:requests:match:0',
//   'flag:requests:match:1',
//   'flag:slow-queries'
// ]
```

This enables seamless up/down navigation through both flags and their matches.

## Advanced Patterns

### Custom TUI Integration

You can extend `InkTUIWrapper` to customize rendering behavior:

```ts
import {InkTUIWrapper} from '@ovrseer/tui-ink';
import type {ProcessMap, TUIState} from '@ovrseer/tui-ink';

class CustomTUI extends InkTUIWrapper {
	render(processes: ProcessMap, state: TUIState): void {
		// Add custom metrics before rendering
		const metrics = this.calculateMetrics(processes);
		console.log('Custom metrics:', metrics);

		super.render(processes, state);
	}

	private calculateMetrics(processes: ProcessMap) {
		let totalMemory = 0;
		for (const [id, proc] of processes.main) {
			// Hypothetical memory tracking
			totalMemory += proc.getMemoryUsage?.() || 0;
		}
		return {totalMemory};
	}
}
```

### Programmatic Process Selection

Select a specific process programmatically:

```ts
tui.onKeyPress((key, meta) => {
	if (key === 'custom-command') {
		// Trigger selection of a specific process
		const processInfo = {id: 'database', type: 'dependency'};
		meta = {processInfo};
		// Manually call the internal select handler
	}
});
```

### Event-Driven External Monitoring

Forward TUI status updates to external systems:

```ts
class MonitoringTUI extends InkTUI {
	attachToManager(manager: OvrseerI): void {
		super.attachToManager(manager);

		// Add extra monitoring
		manager.on('process:crashed', async data => {
			await fetch('https://monitoring.example/alerts', {
				method: 'POST',
				body: JSON.stringify({
					alert: 'process_crashed',
					processId: data.id,
					error: data.error.message,
					timestamp: new Date().toISOString(),
				}),
			});
		});
	}
}
```

### Graceful Shutdown Integration

Ensure the TUI cleans up properly on exit:

```ts
tui.init();
tui.attachToManager(manager);

process.on('SIGINT', async () => {
	console.log('\nShutting down gracefully...');
	await manager.stop();
	tui.destroy();
	process.exit(0);
});

manager.start();
```

### Multi-Manager TUI (Advanced)

Switch between multiple Ovrseer instances:

```ts
const tui = new InkTUI();
const devManager = new Ovrseer();
const testManager = new Ovrseer();

tui.init();
tui.attachToManager(devManager);

// Switch managers at runtime
tui.onKeyPress(async key => {
	if (key === 't') {
		tui.detachFromManager();
		tui.attachToManager(testManager);
		await testManager.start();
	}
	if (key === 'd') {
		tui.detachFromManager();
		tui.attachToManager(devManager);
		await devManager.start();
	}
});
```

## API Reference

### InkTUI

#### Methods

**`init(): void`**

Initializes the Ink render instance. Must be called before `attachToManager`.

**`destroy(): void`**

Unmounts the Ink component and cleans up resources.

**`attachToManager(manager: OvrseerI): void`**

Subscribes to all Ovrseer events and sets up keyboard handlers. Throws if already attached to a manager.

**`detachFromManager(): void`**

Unsubscribes from all Ovrseer events and removes keyboard handlers. Safe to call multiple times.

#### Inherited from InkTUIWrapper

**`render(processes: ProcessMap, state: TUIState): void`**

Re-renders the TUI with updated process data and state.

**`showLogs(processId: string, processType: TUIProcessType, logs: string): void`**

Displays the full log view for a specific process.

**`showStatus(message: string): void`**

Updates the status bar message.

**`onKeyPress(callback: (key: string, meta?: TUIKeyPressMeta) => void): void`**

Registers a keyboard event handler. Called for every key press.

### Types

```ts
interface ProcessMap {
	dependencies: Map<string, ProcessUnitI>;
	main: Map<string, ProcessUnitI>;
	cleanup: Map<string, ProcessUnitI>;
}

interface TUIState {
	selectedProcessId?: string;
	selectedProcessType?: TUIProcessType;
	flagPanelSize?: 'collapsed' | 'expanded';
	flagPanelFocused?: boolean;
	selectedFlagNode?: string;
	expandedFlagNodes?: Set<string>;
	matchContextVisible?: Set<string>;
}

type TUIProcessType = 'dependency' | 'main' | 'cleanup';

interface TUIKeyPressMeta {
	processInfo?: {
		id: string;
		type: TUIProcessType;
	};
}
```

## Best Practices

1. **Always call `init()` before `attachToManager()`**

   ```ts
   // ✓ Correct
   tui.init();
   tui.attachToManager(manager);

   // ✗ Incorrect - will not render
   tui.attachToManager(manager);
   ```

2. **Use flag panel for debugging**

   - Set `targetCount: 0` for errors you want to catch immediately
   - Use distinct colors (`red`, `yellow`, `green`, etc.) for visual scanning
   - Set `contextWindowSize: 5-10` for debugging context

3. **Handle crashes gracefully**

   ```ts
   manager.on('process:crashed', data => {
   	console.error(`Process ${data.id} crashed - check TUI for details`);
   });
   ```

4. **Clean up on exit**

   ```ts
   process.on('SIGINT', async () => {
   	await manager.stop();
   	tui.destroy();
   	process.exit(0);
   });
   ```

5. **Don't block the TUI thread**

   - Avoid heavy computation in `onKeyPress` handlers
   - Use async/await for I/O operations
   - Keep event handlers fast and non-blocking

6. **Use `detachFromManager()` when switching contexts**
   ```ts
   // Before attaching to a new manager
   tui.detachFromManager();
   tui.attachToManager(newManager);
   ```

## Troubleshooting

### TUI not rendering

**Problem:** TUI appears blank or doesn't show processes.

**Solution:** Ensure you call `init()` before `attachToManager()` and that you call `manager.start()` to begin process execution.

### Keyboard controls not working

**Problem:** Pressing keys has no effect.

**Solution:** Check that your terminal supports raw mode input. Some CI environments or non-TTY contexts don't support interactive input.

### Flag panel shows no flags

**Problem:** Flag panel expands but shows empty list.

**Solution:** Ensure you've added flags to the process logger before starting:

```ts
logger.addFlag('errors', {pattern: /error/i, color: 'red'});
```

### Logs not updating in real-time

**Problem:** Log view doesn't refresh when process emits new logs.

**Solution:** The TUI only auto-updates logs for the currently selected process. Press `Enter` to manually refresh the log view.

### Memory growth over time

**Problem:** TUI memory usage increases during long-running sessions.

**Solution:** This is typically due to unbounded log buffers. Configure smaller `maxBufferSize` in ProcessLogger:

```ts
const logger = new ProcessLogger(500, 100); // 500 lines max
```
