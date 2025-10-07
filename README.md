# Ovrseer

**A production-ready process orchestration and observability framework for Node.js**

Ovrseer is a powerful process manager that goes beyond simple spawning—it provides fine-grained lifecycle control, real-time log analysis, crash recovery, and an interactive terminal UI. Built for complex multi-process applications where understanding what's happening across your entire stack is critical.

## Why Ovrseer?

**For complex local development environments:**

- Run databases, caches, microservices, and workers as a coordinated system
- Track readiness across dependencies before starting main processes
- Visualize logs, flag patterns, and process health in real-time

**For production-grade process orchestration:**

- Event-driven architecture with 15+ lifecycle events
- Structured crash reporting with automatic recovery
- Extensible logging and monitoring integrations (Datadog, Sentry, custom analytics)

**For debugging and observability:**

- Pattern-based log flags with color coding and context windows
- Interactive TUI for selecting processes, filtering logs, and inspecting state
- Keyboard-driven navigation and controls (restart, stop, flag view)

## Key Features

### 🎯 Three-Phase Lifecycle Management

```ts
pm.addDependency('postgres', postgresProcess); // Phase 1: Infrastructure
pm.addMainProcess('api-server', apiProcess); // Phase 2: Main application
pm.addCleanupProcess('backup', backupProcess); // Phase 3: Graceful shutdown
```

**Dependencies** start first and must become "ready" (via readiness checks) before main processes begin. **Main processes** are your application workloads. **Cleanup processes** run during shutdown for graceful teardown (backups, cache flushes, connection draining).

### 🚩 Advanced Flag System

Pattern-based log analysis with visual indicators:

```ts
logger.addFlag('database-ready', {
	pattern: /connected to postgres/i,
	color: 'green',
	contextWindowSize: 3, // Show 3 lines before/after match
});

logger.addFlag('critical-errors', {
	pattern: /FATAL|PANIC/i,
	color: 'red',
	targetCount: 0, // Alert if count exceeds target
	contextWindowSize: 5,
});

logger.addFlag('slow-queries', {
	pattern: /query took (\d+)ms/i,
	color: 'yellow',
	targetCount: 10, // Track queries, alert after 10
});
```

Flags are **tracked in real-time** and displayed in the TUI. Press `f` to open the flag panel and see all matches with context.

### 🖥️ Interactive TUI

Built with Ink, the TUI provides:

- **Process list** with status indicators (🟢 running, 🔴 crashed, ⏸️ stopped)
- **Live log streaming** for selected process
- **Flag panel** (`f` key) showing all matched patterns with context windows
- **Keyboard controls:**
  - `↑/↓` or `j/k`: Navigate processes
  - `Enter`: View process logs
  - `r`: Restart selected process
  - `R`: Restart all processes
  - `s`: Stop selected process
  - `q`: Quit application

### 📊 Event-Driven Architecture

Subscribe to 15+ lifecycle events:

```ts
pm.on('process:spawn', ({name, pid}) => {
	console.log(`${name} started with PID ${pid}`);
});

pm.on('process:ready', ({name, duration}) => {
	metrics.timing('process.ready', duration, {process: name});
});

pm.on('process:crash', ({name, report}) => {
	sentry.captureException(new Error(`Process ${name} crashed`), {
		extra: {
			message: report.errorMessage ?? undefined,
			stack: report.errorStack ?? undefined,
			logs: report.logs,
			timestamp: report.timestamp,
		},
	});
});

pm.on('flag:matched', ({processName, flagName, line}) => {
	if (flagName === 'critical-errors') {
		slack.alert(`Critical error in ${processName}: ${line}`);
	}
});
```

Events include: `process:spawn`, `process:ready`, `process:exit`, `process:crash`, `process:restart`, `lifecycle:dependencies-ready`, `lifecycle:main-started`, `lifecycle:cleanup-started`, `flag:matched`, and more.

### 🔄 Intelligent Crash Recovery

```ts
const pm = new Ovrseer({
	retries: 5, // Retry crashed processes up to 5 times
	retryDelay: 2000, // Wait 2s between restarts
});
```

Crash reports are automatically generated with:

- Optional `errorMessage` and `errorStack` (if available)
- `logs`: newline-separated string of recent log lines
- `timestamp`: ISO 8601 string
- Process metadata and persisted diagnostics for post-mortem analysis

### 🔍 Readiness Checks

Processes can define when they're "ready" using pattern matching or exit-based checks:

```ts
const dbProcess = new ProcessUnit(
	'docker',
	['run', 'postgres:15'],
	[
		{
			logPattern: /database system is ready to accept connections/i,
			timeout: 30000,
		},
		{logPattern: /listening on port 5432/i, timeout: 30000},
	],
	dbLogger,
);
```

If a dependency fails readiness checks, main processes won't start.

## Installation

```bash
npm install @ovrseer/core @ovrseer/tui-ink
```

**Note:** `@ovrseer/tui-ink` requires `react@^19.0.0` as a peer dependency. Install React 19:

```bash
npm install react@^19.2.0
```

## Quick Example: Multi-Process Setup

```ts
import {Ovrseer, ProcessUnit, ProcessLogger} from '@ovrseer/core';
import {InkTUI} from '@ovrseer/tui-ink';

const pm = new Ovrseer({retries: 3});
const tui = new InkTUI();

const dbLogger = new ProcessLogger(1000, 100);
dbLogger.addFlag('ready', {
	pattern: /database is ready/i,
	color: 'green',
	contextWindowSize: 3,
});
dbLogger.addFlag('errors', {
	pattern: /error|exception/i,
	color: 'red',
	targetCount: 0,
});

const db = new ProcessUnit(
	'docker',
	['run', '--rm', 'postgres:15'],
	[{logPattern: /database is ready/i, timeout: 30000}],
	dbLogger,
);

const apiLogger = new ProcessLogger(1000, 100);
apiLogger.addFlag('requests', {
	pattern: /GET|POST|PUT|DELETE/i,
	color: 'yellow',
});

const api = new ProcessUnit(
	'node',
	['dist/server.js'],
	[{logPattern: /Server listening/i, timeout: 10000}],
	apiLogger,
);

const cleanupLogger = new ProcessLogger(500, 50);
const cleanup = new ProcessUnit(
	'node',
	['scripts/backup.js'],
	[{logPattern: /Backup complete/i, timeout: 60000}],
	cleanupLogger,
);

pm.addDependency('postgres', db);
pm.addMainProcess('api', api);
pm.addCleanupProcess('backup', cleanup);

tui.init();
tui.attachToManager(pm);
pm.start();
```

**What happens:**

1. Postgres starts and waits for "database is ready" log line
2. Once ready, API server starts
3. User interacts with TUI to view logs, flags, restart processes
4. On shutdown (Ctrl+C), backup script runs before process termination

## Architecture

```
┌─────────────┐
│   Ovrseer   │  Orchestrates lifecycle, manages processes
└──────┬──────┘
       │
   ┌───┴────┐
   ▼        ▼
┌────────┐ ┌────────┐
│  TUI   │ │ Events │  UI + Event emitters
└────────┘ └────────┘
       │
   ────┴──── Process Groups
   │   │   │
   ▼   ▼   ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Dependencies │ │ Main Process │ │   Cleanup    │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
   ┌───┴───┐        ┌───┴───┐        ┌───┴───┐
   ▼       ▼        ▼       ▼        ▼       ▼
┌────┐  ┌────┐   ┌────┐  ┌────┐   ┌────┐  ┌────┐
│Unit│  │Unit│   │Unit│  │Unit│   │Unit│  │Unit│
└─┬──┘  └─┬──┘   └─┬──┘  └─┬──┘   └─┬──┘  └─┬──┘
  │       │        │       │        │       │
  ▼       ▼        ▼       ▼        ▼       ▼
Logger  Logger   Logger  Logger   Logger  Logger
  │       │        │       │        │       │
  ▼       ▼        ▼       ▼        ▼       ▼
Flags   Flags    Flags   Flags    Flags   Flags
```

Each **ProcessUnit** wraps a child process and includes:

- **ProcessLogger**: Circular buffer, flag matching, event emission
- **Readiness checks**: Pattern-based or exit-based
- **Crash reporting**: Via CrashReporter

**Ovrseer** manages the three-phase lifecycle and coordinates state.

## Real-World Use Cases

### Microservices Development Environment

```ts
pm.addDependency('postgres', postgresContainer);
pm.addDependency('redis', redisContainer);
pm.addDependency('kafka', kafkaContainer);

pm.addMainProcess('auth-service', authService);
pm.addMainProcess('user-service', userService);
pm.addMainProcess('notification-service', notificationService);
pm.addMainProcess('worker-pool', workerPool);

pm.addCleanupProcess('flush-redis', redisFlusher);
pm.addCleanupProcess('drain-kafka', kafkaDrainer);
```

### Integration Testing

```ts
pm.on('lifecycle:dependencies-ready', async () => {
	await runMigrations();
	await seedTestData();
});

pm.on('lifecycle:main-started', async () => {
	await runTestSuite();
	pm.stop();
});
```

### Production Monitoring Integration

```ts
import {DatadogLogger} from './custom-loggers.js';
import {SentryReporter} from './custom-reporters.js';

const logger = new DatadogLogger(process.env.DD_API_KEY);
const reporter = new SentryReporter(process.env.SENTRY_DSN);

const process = new ProcessUnit('node', ['app.js'], [], logger, reporter);

pm.on('flag:matched', ({processName, flagName, line}) => {
	if (flagName === 'error' || flagName === 'critical') {
		datadogClient.increment('app.errors', {process: processName});
	}
});
```

## Extending Ovrseer

Ovrseer is designed for extension. Implement custom:

**Custom Loggers** (extend `ProcessLogger`):

- Stream logs to external services (Datadog, Elasticsearch)
- Add custom flag behaviors (alerts, aggregations)
- Integrate with APM tools

**Custom Crash Reporters** (extend `CrashReporter`):

- Send crash data to Sentry, Rollbar, or custom endpoints
- Trigger PagerDuty alerts
- Generate detailed diagnostics (memory dumps, stack traces)

**Custom TUI** (implement `TUI` interface):

- Build alternative UIs (blessed, blessed-contrib, terminal-kit)
- Add custom panels (metrics, graphs, process trees)
- Integrate with tmux or screen

See `docs/extension.md` for detailed examples.

## Documentation

- **[Overview](docs/overview.md)**: Architecture and design philosophy
- **[Quick Start](docs/quick-start.md)**: Complete walkthrough with examples
- **Components:**
  - **[Ovrseer](docs/components/ovrseer.md)**: Main orchestrator
  - **[ProcessUnit](docs/components/process-unit.md)**: Process wrapper with lifecycle
  - **[ProcessLogger](docs/components/process-logger.md)**: Logging and flag system
  - **[CrashReporter](docs/components/crash-reporter.md)**: Crash handling and reporting
  - **[TUI Integration](docs/components/tui-integration.md)**: Terminal UI details
- **[Extension Guide](docs/extension.md)**: Building custom loggers, reporters, and UIs

## Repository Structure

```
ovrseer/
├── packages/
│   ├── core/           # @ovrseer/core - main library
│   ├── tui-ink/        # @ovrseer/tui-ink - Ink-based TUI
│   └── example/        # Full-featured example application
├── docs/               # Documentation
└── prototype/          # Initial prototypes
```

## Development

```bash
pnpm install
turbo run build
turbo run test
turbo run dev          # Watch mode
```

## License

MIT
