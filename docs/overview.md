# Overview

Ovrseer is a production-ready process orchestration framework for Node.js applications that need to manage complex multi-process systems. It goes beyond basic process spawning by providing intelligent lifecycle management, real-time observability, structured crash recovery, and an interactive debugging interface.

## Design Philosophy

Ovrseer is built around three core principles:

### 1. Coordinated Lifecycle Management

Modern applications often consist of multiple interdependent services. Ovrseer organizes processes into three distinct groups:

- **Dependencies**: Infrastructure components (databases, message queues, caches) that must be running and ready before the application starts
- **Main Processes**: Your application workloads (web servers, API endpoints, workers)
- **Cleanup Processes**: Graceful shutdown tasks (backups, cache flushes, connection draining)

This three-phase model ensures correct startup order, prevents race conditions, and enables clean shutdowns.

### 2. Deep Observability

Logs are the primary interface for understanding process behavior. Ovrseer treats logs as first-class data:

- **In-memory circular buffers** retain recent log history for instant access
- **Pattern-based flags** highlight important events (errors, slow queries, readiness signals)
- **Context windows** show surrounding log lines when patterns match
- **Real-time event streams** enable integration with monitoring systems

The flag system transforms passive log collection into active monitoring—you define what matters and Ovrseer tracks it automatically.

### 3. Resilience and Recovery

Processes crash. Ovrseer embraces this reality:

- **Automatic restart policies** with configurable retry limits and delays
- **Structured crash reports** capture exit codes, signals, and recent logs
- **Crash persistence** stores reports to disk for post-mortem analysis
- **Event-driven notifications** alert you when things go wrong

Crashes are treated as observable events that can trigger alerts, metrics, or automated responses.

## Architecture

### Component Hierarchy

```
Ovrseer (Orchestrator)
├── ProcessUnit (Process Wrapper)
│   ├── ChildProcess (Node.js spawn)
│   ├── ProcessLogger (Log Management)
│   │   ├── Circular Buffer (Memory-efficient storage)
│   │   └── Flag System (Pattern Matching)
│   ├── CrashReporter (Failure Analysis)
│   └── Readiness Checks (Dependency Coordination)
├── TUI (Optional Interface)
│   ├── Process List (Navigation)
│   ├── Log Viewer (Real-time Streaming)
│   └── Flag Panel (Pattern Overview)
└── Event Emitter (Notification System)
```

### Core Components

#### ProcessUnit

`ProcessUnit` is a stateful wrapper around Node.js `ChildProcess`. It manages:

- **Lifecycle**: spawn, ready, running, stopped, crashed states
- **Readiness**: pattern-based or exit-based checks that signal when a process is ready
- **Restart logic**: automatic retries with exponential backoff
- **Event emission**: broadcasts lifecycle changes to Ovrseer and subscribers

Each ProcessUnit is independent but coordinated by Ovrseer.

#### ProcessLogger

`ProcessLogger` captures and analyzes stdout/stderr:

- **Circular buffer**: Fixed-size in-memory buffer retains the most recent N lines
- **Delimiter handling**: Splits streams by delimiter (default `\n`) to detect complete lines
- **Flag matching**: Tests each line against registered regex patterns
- **Context windows**: Captures surrounding lines when a flag matches
- **Event emission**: Emits `log` and `flag:matched` events

Flags can have **target counts**—if a flag matches more times than its target, it's considered "exceeded" and highlighted in the TUI.

#### CrashReporter

`CrashReporter` generates structured reports when a process exits unexpectedly:

```ts
type CrashReport = {
	processName: string;
	command: string;
	args: string[];
	exitCode: number | null;
	signal: string | null;
	timestamp: Date;
	lastLogs: string[];
};
```

By default, reports are written to `./crash-reports/{processName}-{timestamp}.json`. You can extend CrashReporter to send reports to Sentry, Datadog, or custom backends.

#### Ovrseer

`Ovrseer` is the orchestrator. It:

- **Manages process groups**: Dependencies, main processes, cleanup processes
- **Coordinates startup**: Waits for dependencies to become ready before starting main processes
- **Handles crashes**: Triggers crash reports, decides whether to restart
- **Emits lifecycle events**: `process:spawn`, `process:ready`, `process:crash`, `lifecycle:dependencies-ready`, etc.
- **Coordinates shutdown**: Stops main processes, then runs cleanup processes

Ovrseer exposes an EventEmitter interface with 15+ event types.

### TUI Integration

The optional `@ovrseer/tui-ink` package provides an interactive terminal UI:

- **Process list**: Shows all processes with status indicators (🟢 running, 🔴 crashed, ⏸️ stopped)
- **Log viewer**: Streams logs from the selected process in real-time
- **Flag panel**: Press `f` to see all matched flags with context windows
- **Keyboard controls**:
  - `↑/↓` or `j/k`: Navigate process list
  - `Enter`: Select process and view logs
  - `r`: Restart selected process
  - `R`: Restart all processes
  - `s`: Stop selected process
  - `q`: Quit (triggers cleanup phase)

The TUI implements the `TUI` interface, which means you can build custom UIs using other terminal libraries (blessed, blessed-contrib, terminal-kit).

## Lifecycle Flow

### Startup Sequence

1. **Initialization**: Ovrseer creates internal state for all registered processes
2. **Dependency Phase**:
   - Spawn all dependency processes in parallel
   - Wait for each to signal "ready" (via readiness checks)
   - If any dependency fails or times out, abort startup
   - Emit `lifecycle:dependencies-ready` when all dependencies are ready
3. **Main Phase**:
   - Spawn all main processes in parallel
   - Emit `lifecycle:main-started`
   - Monitor for crashes and apply restart policies
4. **Running State**:
   - Processes run indefinitely
   - Logs are buffered, flags are matched, events are emitted
   - User can interact via TUI or programmatic API

### Shutdown Sequence

1. **Stop Signal**: User presses `q` in TUI or calls `pm.stop()`
2. **Main Process Termination**:
   - Send SIGTERM to all main processes
   - Wait for graceful exit (timeout configurable)
   - Emit `lifecycle:main-stopped`
3. **Cleanup Phase**:
   - Spawn all cleanup processes
   - Wait for each to complete (readiness checks act as completion signals)
   - Emit `lifecycle:cleanup-started`, then `lifecycle:cleanup-complete`
4. **Dependency Termination**:
   - Send SIGTERM to all dependencies
   - Wait for exit
5. **Exit**: Process exits with code 0 (or 1 if errors occurred)

### Crash Handling

When a process exits unexpectedly:

1. **Detect Crash**: Non-zero exit code or signal (SIGKILL, SIGTERM, etc.)
2. **Generate Report**: CrashReporter captures exit info and last logs
3. **Emit Event**: `process:crash` event fired with report data
4. **Restart Decision**:
   - If retries remain, increment retry count and restart after delay
   - If retries exhausted, mark process as permanently failed
5. **Alert**: Subscribers can trigger alerts, metrics, or notifications

## Event System

Ovrseer emits fine-grained events for every lifecycle change:

### Process Events

- `process:spawn`: Process started (includes PID)
- `process:ready`: Process passed readiness checks (includes duration)
- `process:exit`: Process exited (includes exit code, signal)
- `process:crash`: Process crashed (includes crash report)
- `process:restart`: Process is restarting (includes retry count)
- `process:log`: New log line captured (includes line content)
- `flag:matched`: Log flag matched (includes flag name, line, context)

### Lifecycle Events

- `lifecycle:dependencies-ready`: All dependencies are ready
- `lifecycle:main-started`: Main processes have spawned
- `lifecycle:main-stopped`: Main processes have stopped
- `lifecycle:cleanup-started`: Cleanup processes have spawned
- `lifecycle:cleanup-complete`: Cleanup processes have finished
- `lifecycle:error`: Error during lifecycle management

Events enable integration with monitoring systems, alert platforms, and custom automation.

## Readiness Checks

Readiness checks define when a process is considered "ready". There are two types:

### Pattern-Based Readiness

```ts
const checks = [
	{logPattern: /server listening on port \d+/i, timeout: 10000},
	{logPattern: /connected to database/i, timeout: 30000},
];
```

The process is ready when **all patterns** have matched within their timeouts.

### Exit-Based Readiness

```ts
const checks = [{timeout: 5000}];
```

The process is ready when it **exits cleanly** (exit code 0) within the timeout.

If a process fails readiness checks (timeout or non-zero exit), it's considered failed and won't block startup if it's not a dependency.

## Flag System

Flags are pattern-based log monitors. Each flag has:

- `pattern`: Regex to match against log lines
- `color`: Visual indicator in TUI (green, red, yellow, blue, purple, orange)
- `contextWindowSize`: Number of lines before/after match to capture
- `targetCount`: Optional threshold for alerting

Example use cases:

- **Readiness signals**: `pattern: /server started/i, color: 'green'`
- **Error tracking**: `pattern: /error|exception/i, color: 'red', targetCount: 0`
- **Performance monitoring**: `pattern: /query took (\d+)ms/i, color: 'yellow', targetCount: 10`
- **Request logging**: `pattern: /GET|POST|PUT|DELETE/i, color: 'blue'`

Flags are independent of readiness checks—they're purely for observability.

## Extension Points

Ovrseer is designed for customization:

### Custom Loggers

Extend `ProcessLogger` to:

- Stream logs to external services (Datadog, Elasticsearch, CloudWatch)
- Add custom flag behaviors (aggregation, alerting)
- Integrate with APM tools (New Relic, Dynatrace)

### Custom Crash Reporters

Extend `CrashReporter` to:

- Send crash data to error tracking services (Sentry, Rollbar)
- Trigger PagerDuty or Slack alerts
- Capture extended diagnostics (heap dumps, profiling data)

### Custom TUI

Implement the `TUI` interface to:

- Build alternative UIs with different libraries
- Add custom panels (metrics dashboards, process trees)
- Integrate with tmux, screen, or terminal multiplexers

See `docs/extension.md` for detailed examples.

## Use Cases

### Local Development Environments

Run full microservices stacks locally with proper startup coordination:

```
Dependencies: postgres, redis, kafka
Main: auth-service, user-service, api-gateway, worker-pool
Cleanup: redis-flush, kafka-drain
```

### Integration Testing

Orchestrate test databases and services, run tests, then tear down:

```ts
pm.on('lifecycle:dependencies-ready', async () => {
	await runMigrations();
	await seedData();
});

pm.on('lifecycle:main-started', async () => {
	await runTests();
	pm.stop();
});
```

### Production Process Management

While tools like PM2 and systemd are designed for production, Ovrseer excels in scenarios where you need:

- Complex multi-process coordination
- Deep log analysis and pattern matching
- Custom monitoring integrations
- Interactive debugging interfaces

### CI/CD Pipeline Orchestration

Run parallel build steps, test suites, or deployment scripts with dependency management and real-time log analysis.

## Repository Structure

```
ovrseer/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── types.ts            # Core interfaces
│   │   │   ├── process-unit.ts     # Process wrapper
│   │   │   ├── logger.ts           # Log management
│   │   │   ├── crash-reporter.ts   # Crash handling
│   │   │   └── ovrseer.ts          # Main orchestrator
│   │   └── __tests__/              # Unit tests
│   ├── tui-ink/
│   │   ├── src/
│   │   │   ├── InkTUI.ts           # TUI implementation
│   │   │   ├── InkTUIRenderer.tsx  # React components
│   │   │   └── InkTUIWrapper.ts    # Wrapper for easy setup
│   │   └── __tests__/              # TUI tests
│   └── example/
│       └── src/
│           └── index.ts            # Full-featured example
├── docs/                           # Documentation
└── prototype/                      # Initial explorations
```

## Next Steps

- **[Quick Start](quick-start.md)**: Build your first multi-process application
- **[Component Docs](components/)**: Deep dive into each component
- **[Extension Guide](extension.md)**: Customize Ovrseer for your needs
