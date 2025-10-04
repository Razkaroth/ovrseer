# Process Manager

A robust process orchestration system with TUI (Terminal User Interface), crash reporting, and lifecycle management for Node.js applications.

## Features

- **Process Orchestration**: Manage dependencies, main processes, and cleanup tasks
- **Crash Reporting**: Automatic crash detection and report generation
- **TUI Interface**: Interactive terminal UI for process monitoring and control
- **Lifecycle Management**: Start, stop, restart, and monitor process health
- **Ready Checks**: Wait for processes to be ready before starting dependents
- **Automatic Retries**: Configurable retry logic for crashed processes
- **Log Management**: Circular buffer logging with configurable size

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ProcessManager                          │
│  - Orchestrates all processes                                │
│  - Handles crashes and retries                               │
│  - Coordinates TUI and crash reporting                       │
└──────────────┬──────────────┬──────────────┬────────────────┘
               │              │              │
     ┌─────────▼────┐  ┌──────▼──────┐  ┌───▼──────────┐
     │ Dependencies │  │    Main     │  │   Cleanup    │
     │  Processes   │  │  Processes  │  │  Processes   │
     └──────────────┘  └─────────────┘  └──────────────┘
            │                 │                 │
            └─────────────────┼─────────────────┘
                              │
                  ┌───────────▼───────────┐
                  │   ManagedProcess      │
                  │  - Wraps child_process│
                  │  - Provides lifecycle │
                  │  - Handles signals    │
                  └───────────────────────┘
```

## Quick Start

```typescript
import { ProcessManager, ManagedProcess } from './process-manager'

const processManager = new ProcessManager({
  retries: 3,
  waitTime: 1000,
})

// Add a dependency (e.g., database)
const db = new ManagedProcess('node', ['./db-server.js'], [], {
  readyCheck: {
    logPattern: /Database ready/,
    timeout: 5000,
  },
})
processManager.addDependency('db', db)

// Add main process
const api = new ManagedProcess('node', ['./api-server.js'], [])
processManager.addMainProcess('api', api)

// Start all processes
processManager.start()

// Start TUI for interactive monitoring
processManager.startTuiSession()
```

## API Reference

### ProcessManager

#### Constructor Options

```typescript
interface ProcessManagerOptions {
  retries?: number // Max retry attempts (default: 3)
  waitTime?: number // Wait time between retries in ms (default: 1000)
  crashReporter?: CrashReporterI
  tui?: TUIRendererI
}
```

#### Methods

- `addDependency(id: string, process: ManagedProcessI)` - Add a dependency process
- `addMainProcess(id: string, process: ManagedProcessI)` - Add a main process
- `addCleanupProcess(id: string, process: ManagedProcessI)` - Add a cleanup process
- `start()` - Start all processes (dependencies → main)
- `stop()` - Stop all processes gracefully
- `restartProcess(id: string, type?: TUIProcessType)` - Restart a specific process
- `restartAll()` - Restart all processes
- `startTuiSession()` - Launch interactive TUI

### ManagedProcess

#### Constructor

```typescript
new ManagedProcess(
  command: string,
  args: string[],
  env: string[],
  options?: {
    readyCheck?: ReadyCheck
    restartOnCrash?: boolean
    maxLogLines?: number
    maxErrorLines?: number
  }
)
```

#### Ready Check

```typescript
interface ReadyCheck {
  logPattern: RegExp | string // Pattern to match in logs
  timeout: number // Timeout in ms
  passIfNotFound?: boolean // Pass if pattern not found (time-based)
}
```

#### Methods

- `start()` - Start the process
- `stop(timeout?: number, signal?: StopSignal)` - Stop gracefully. Will escalate to kill if process does not exit after timeout.
- `kill()` - Force kill
- `restart()` - Restart the process
- `isRunning()` - Check if running
- `getStatus()` - Get current status
- `onExit(callback)` - Register exit handler
- `onCrash(callback)` - Register crash handler
- `onReady(callback)` - Register ready handler

### CrashReporter

#### Constructor

```typescript
new CrashReporter(reportsDir?: string)
// Default: tmpdir()/process-manager/crash-reports
```

#### Methods

- `generateReport(processId, process, type, context?)` - Create crash report
- `saveReport(report)` - Persist report to disk
- `getReports()` - Get all reports
- `clearReports()` - Clear report history
- `getReportsDir()` - Get reports directory path

### TUI Controls

When TUI is active:

- `↑/↓` - Navigate processes
- `Enter` - View logs
- `r` - Restart selected process
- `R` - Restart all processes
- `q` - Quit
- `h` - Show help

## Process Status Flow

```
created → running → ready → completed
                  ↓
                crashed → (retry) → running
                  ↓
           maxRetriesExceeded
```

## Running the Examples

Try the interactive examples:

```bash
# Full stack simulation with dependencies and services
bun run src/cli/utils/process-manager/examples/sample-app.ts

# Crash handling and recovery demonstration
bun run src/cli/utils/process-manager/examples/crash-demo.ts
```

See [examples/README.md](./examples/README.md) for detailed documentation.

## Example Features

The sample apps demonstrate:

- Multiple dependencies with different startup times
- Main processes with varied durations
- Crash scenarios and recovery
- TUI interaction

## Testing

Run tests:

```bash
bun run test src/cli/utils/process-manager/__tests__/
```

Run specific test:

```bash
bun run test src/cli/utils/process-manager/__tests__/process-manager.test.ts
```

## Advanced Usage

### Custom Crash Reporter

```typescript
class CustomCrashReporter implements CrashReporterI {
  async saveReport(report: CrashReport) {
    // Send to monitoring service
    await fetch('https://monitoring.example.com/crashes', {
      method: 'POST',
      body: JSON.stringify(report),
    })
  }
  // ... implement other methods
}

const pm = new ProcessManager({
  crashReporter: new CustomCrashReporter(),
})
```

### Custom TUI Renderer

```typescript
class CustomTUI implements TUIRendererI {
  render(processes: ProcessMap, state: TUIState) {
    // Custom rendering logic
  }
  // ... implement other methods
}
```

## Best Practices

1. **Always define ready checks for dependencies** - Ensures main processes start only when dependencies are ready
2. **Use appropriate retry limits** - Avoid infinite retry loops
3. **Configure log buffer sizes** - Balance memory usage vs. log history
4. **Handle cleanup processes** - Ensure resources are released on shutdown
5. **Monitor crash reports** - Set up alerting for production environments

## Troubleshooting

### Process won't start

- Check command path is correct
- Verify environment variables
- Review ready check configuration

### TUI not updating

- Ensure logger listeners are attached
- Check if process is actually logging to stdout/stderr

### Crash reports not saved

- Verify write permissions to reports directory
- Check disk space availability

## License

Part of the Reforged project.
