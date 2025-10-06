# Ovrseer - Process Orchestrator

`Ovrseer` is the central orchestrator that manages complex multi-process systems with fine-grained lifecycle control, crash recovery, and event-driven notifications. It coordinates three distinct process groups and ensures correct startup order, readiness synchronization, and graceful shutdown.

## Core Concepts

### Three-Phase Lifecycle

Ovrseer organizes processes into three groups, each with different lifecycle semantics:

1. **Dependencies** (`addDependency`): Infrastructure components that must be running and ready before main processes start

   - Examples: PostgreSQL, Redis, Kafka, Docker containers
   - Must pass readiness checks before main phase begins
   - If any dependency fails, startup is aborted

2. **Main Processes** (`addMainProcess`): Your application workloads

   - Examples: API servers, web services, background workers
   - Start only after all dependencies are ready
   - Monitored continuously for crashes with automatic restart

3. **Cleanup Processes** (`addCleanupProcess`): Graceful shutdown tasks
   - Examples: Database backups, cache flushes, connection draining
   - Execute during shutdown after main processes stop
   - Run to completion before final termination

### Lifecycle Flow

```
Start Called
    ↓
Spawn Dependencies (parallel)
    ↓
Wait for All Dependencies Ready
    ↓
Emit: lifecycle:dependencies-ready
    ↓
Spawn Main Processes (parallel)
    ↓
Emit: lifecycle:main-started
    ↓
Running State (monitor for crashes)
    ↓
Stop Called or SIGINT/SIGTERM
    ↓
Stop Main Processes (SIGTERM)
    ↓
Emit: lifecycle:main-stopped
    ↓
Spawn Cleanup Processes (parallel)
    ↓
Emit: lifecycle:cleanup-started
    ↓
Wait for Cleanup Completion
    ↓
Emit: lifecycle:cleanup-complete
    ↓
Stop Dependencies (SIGTERM)
    ↓
Exit
```

## Constructor

```ts
new Ovrseer(options?: ProcessManagerOptions)
```

### Options

```ts
type ProcessManagerOptions = {
	retries?: number;
	retryDelay?: number;
	cleanupTimeout?: number;
	crashReporter?: CrashReporterI;
};
```

| Option           | Type             | Default               | Description                                                    |
| ---------------- | ---------------- | --------------------- | -------------------------------------------------------------- |
| `retries`        | `number`         | `3`                   | Maximum number of automatic restarts per process after crashes |
| `retryDelay`     | `number`         | `1000`                | Milliseconds to wait between restart attempts                  |
| `cleanupTimeout` | `number`         | `5000`                | Milliseconds to wait for each cleanup process to complete      |
| `crashReporter`  | `CrashReporterI` | `new CrashReporter()` | Custom crash reporter implementation                           |

### Example

```ts
const pm = new Ovrseer({
	retries: 5,
	retryDelay: 2000,
	cleanupTimeout: 60000,
});
```

## API Methods

### Process Management

#### `addDependency(id: string, process: ProcessUnitI): void`

Register a dependency process. Dependencies start first and must become ready before main processes begin.

```ts
const db = new ProcessUnit(
	'docker',
	['run', 'postgres:15'],
	readyChecks,
	logger,
);
pm.addDependency('postgres', db);
```

#### `addMainProcess(id: string, process: ProcessUnitI): void`

Register a main application process. Main processes start after all dependencies are ready.

```ts
const api = new ProcessUnit('node', ['dist/server.js'], readyChecks, logger);
pm.addMainProcess('api', api);
```

#### `addCleanupProcess(id: string, process: ProcessUnitI): void`

Register a cleanup process. Cleanup processes run during shutdown after main processes stop.

```ts
const backup = new ProcessUnit(
	'node',
	['scripts/backup.js'],
	readyChecks,
	logger,
);
pm.addCleanupProcess('backup', backup);
```

#### `removeDependency(id: string): void`

#### `removeMainProcess(id: string): void`

#### `removeCleanupProcess(id: string): void`

Remove a process from its group. Cleans up event handlers.

```ts
pm.removeMainProcess('api');
```

### Lifecycle Control

#### `async start(): Promise<void>`

Start the orchestration:

1. Spawn all dependency processes
2. Wait for all dependencies to become ready (pass readiness checks)
3. If any dependency fails, abort and throw error
4. Spawn all main processes
5. Enter running state

```ts
await pm.start();
```

#### `async stop(): Promise<void>`

Stop all processes gracefully:

1. Send SIGTERM to all main processes
2. Wait for main processes to exit
3. Spawn and wait for all cleanup processes
4. Send SIGTERM to all dependencies
5. Exit

```ts
await pm.stop();
```

#### `async restartProcess(id: string, type?: TUIProcessType): Promise<void>`

Restart a single process. If `type` is not provided, searches all groups.

```ts
await pm.restartProcess('api', 'main');
```

#### `async restartAll(): Promise<void>`

Restart the entire system:

1. Stop all processes (skips cleanup phase)
2. Reset retry counts
3. Start everything again

```ts
await pm.restartAll();
```

### State Queries

#### `getProcess(id: string, type?: TUIProcessType): ProcessUnitI | undefined`

Retrieve a process by ID. Searches all groups if type not specified.

```ts
const apiProcess = pm.getProcess('api', 'main');
const logs = apiProcess?.logger.getLogs({numberOfLines: 100});
```

#### `getAllProcesses(): Map<string, {process: ProcessUnitI, type: TUIProcessType}>`

Get all registered processes with their types.

```ts
const all = pm.getAllProcesses();
for (const [id, {process, type}] of all) {
	console.log(`${id} (${type}): ${process.getState()}`);
}
```

## Event System

Ovrseer emits detailed events for every lifecycle change. Subscribe using `on` or `addEventListener`.

### Event Types

#### Process Lifecycle Events

```ts
pm.on(
	'process:spawn',
	(data: {name: string; pid: number; timestamp: number}) => {},
);
```

Emitted when a process starts. Includes process ID.

```ts
pm.on(
	'process:ready',
	(data: {name: string; duration: number; timestamp: number}) => {},
);
```

Emitted when a process passes all readiness checks. `duration` is time from spawn to ready in milliseconds.

```ts
pm.on(
	'process:exit',
	(data: {
		name: string;
		exitCode: number | null;
		signal: string | null;
		timestamp: number;
	}) => {},
);
```

Emitted when a process exits (clean or crash).

```ts
pm.on(
	'process:crash',
	(data: {
		name: string;
		exitCode: number | null;
		signal: string | null;
		report: CrashReport;
		timestamp: number;
	}) => {},
);
```

Emitted when a process crashes (non-zero exit or signal). Includes full crash report.

```ts
pm.on(
	'process:restart',
	(data: {
		name: string;
		retryCount: number;
		maxRetries: number;
		timestamp: number;
	}) => {},
);
```

Emitted when a process is being restarted after a crash.

```ts
pm.on(
	'process:log',
	(data: {name: string; line: string; timestamp: number}) => {},
);
```

Emitted for every log line from any process.

```ts
pm.on(
	'flag:matched',
	(data: {
		processName: string;
		flagName: string;
		line: string;
		matchCount: number;
		targetCount?: number;
		context: string[];
		timestamp: number;
	}) => {},
);
```

Emitted when a log flag pattern matches. Includes context window lines.

#### Lifecycle Phase Events

```ts
pm.on('lifecycle:dependencies-ready', (data: {timestamp: number}) => {});
```

All dependencies are ready. Main processes will start next.

```ts
pm.on('lifecycle:main-started', (data: {timestamp: number}) => {});
```

All main processes have spawned.

```ts
pm.on('lifecycle:main-stopped', (data: {timestamp: number}) => {});
```

All main processes have stopped. Cleanup will start next.

```ts
pm.on('lifecycle:cleanup-started', (data: {timestamp: number}) => {});
```

Cleanup processes have spawned.

```ts
pm.on('lifecycle:cleanup-complete', (data: {timestamp: number}) => {});
```

All cleanup processes have finished.

```ts
pm.on(
	'lifecycle:error',
	(data: {
		phase: 'dependencies' | 'main' | 'cleanup';
		error: Error;
		timestamp: number;
	}) => {},
);
```

An error occurred during lifecycle management.

#### State Update Events

```ts
pm.on(
	'state:update',
	(data: {
		processes: {
			dependencies: Map<string, ProcessUnitI>;
			main: Map<string, ProcessUnitI>;
			cleanup: Map<string, ProcessUnitI>;
		};
		timestamp: number;
	}) => {},
);
```

Emitted whenever process state changes (added, removed, status change).

```ts
pm.on(
	'process:added',
	(data: {
		id: string;
		type: 'dependency' | 'main' | 'cleanup';
		timestamp: number;
	}) => {},
);
```

Emitted when a process is registered.

```ts
pm.on(
	'process:removed',
	(data: {
		id: string;
		type: 'dependency' | 'main' | 'cleanup';
		timestamp: number;
	}) => {},
);
```

Emitted when a process is removed.

### Unsubscribing

```ts
const handler = data => console.log(data);
pm.on('process:crash', handler);
pm.off('process:crash', handler);
```

## Crash Recovery

### Automatic Restart Policy

When a process crashes:

1. **Detect crash**: Exit code !== 0 or signal present
2. **Generate report**: CrashReporter captures details
3. **Emit event**: `process:crash` with full report
4. **Check retries**: Compare retry count to `maxRetries`
5. **Restart or fail**:
   - If retries remain: wait `retryDelay` ms, increment count, restart
   - If retries exhausted: mark permanently failed, don't restart

### Retry Counters

Retry counters are per-process and reset on successful start or `restartAll()`.

```ts
const pm = new Ovrseer({retries: 3, retryDelay: 2000});

pm.on('process:restart', ({name, retryCount, maxRetries}) => {
	console.log(`${name} restarting: attempt ${retryCount}/${maxRetries}`);
});

pm.on('process:crash', ({name, exitCode}) => {
	console.error(`${name} crashed with code ${exitCode}`);
});
```

If a process crashes 4 times, it's permanently stopped (3 retries = 4 total attempts).

### Custom Crash Handling

Integrate with error tracking services:

```ts
pm.on('process:crash', async ({name, exitCode, signal, report}) => {
	await fetch('https://sentry.io/api/events', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${process.env.SENTRY_TOKEN}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			message: `Process ${name} crashed`,
			level: 'error',
			extra: {
				exitCode,
				signal,
				lastLogs: report.lastLogs,
				timestamp: report.timestamp,
			},
		}),
	});
});
```

## Integration Examples

### Datadog Metrics

```ts
import {StatsD} from 'hot-shots';

const statsd = new StatsD();

pm.on('process:spawn', ({name}) => {
	statsd.increment('process.spawn', {process: name});
});

pm.on('process:ready', ({name, duration}) => {
	statsd.timing('process.ready_time', duration, {process: name});
});

pm.on('process:crash', ({name}) => {
	statsd.increment('process.crash', {process: name});
});

pm.on('flag:matched', ({processName, flagName}) => {
	if (flagName === 'errors') {
		statsd.increment('app.errors', {process: processName});
	}
});
```

### Slack Alerts

```ts
pm.on('process:crash', async ({name, exitCode, report}) => {
	await fetch(process.env.SLACK_WEBHOOK_URL, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({
			text: `🚨 Process crashed: ${name}`,
			attachments: [
				{
					color: 'danger',
					fields: [
						{title: 'Exit Code', value: exitCode, short: true},
						{
							title: 'Time',
							value: new Date(report.timestamp).toISOString(),
							short: true,
						},
						{
							title: 'Last Logs',
							value: `\`\`\`${report.lastLogs.slice(-5).join('\n')}\`\`\``,
							short: false,
						},
					],
				},
			],
		}),
	});
});
```

### Custom Lifecycle Hooks

```ts
pm.on('lifecycle:dependencies-ready', async () => {
	console.log('Running database migrations...');
	await runMigrations();
	console.log('Seeding test data...');
	await seedData();
});

pm.on('lifecycle:main-started', () => {
	console.log('Application fully started, triggering health checks...');
	setTimeout(runHealthChecks, 5000);
});

pm.on('lifecycle:cleanup-started', () => {
	console.log('Cleanup phase initiated, saving state...');
});
```

## Best Practices

### 1. Use Specific Process IDs

Choose descriptive IDs that reflect the process role:

```ts
pm.addDependency('postgres-main', dbProcess);
pm.addMainProcess('auth-api', authService);
pm.addCleanupProcess('redis-flush', flushScript);
```

### 2. Handle Dependency Failures

Dependencies that fail readiness checks will abort startup:

```ts
try {
	await pm.start();
} catch (error) {
	console.error('Failed to start:', error);
	process.exit(1);
}
```

### 3. Set Appropriate Retry Policies

Choose retry limits based on process characteristics:

- **Infrastructure**: High retries (databases, caches)
- **Application**: Medium retries (API servers)
- **One-shot tasks**: Low or zero retries (migrations)

```ts
const pm = new Ovrseer({
	retries: 5,
	retryDelay: 3000,
});
```

### 4. Monitor Lifecycle Events

Always subscribe to key events:

```ts
pm.on('lifecycle:dependencies-ready', () => {});
pm.on('process:crash', () => {});
pm.on('lifecycle:error', () => {});
```

### 5. Graceful Shutdown

Handle process signals to trigger cleanup:

```ts
process.on('SIGINT', async () => {
	console.log('Received SIGINT, stopping...');
	await pm.stop();
	process.exit(0);
});

process.on('SIGTERM', async () => {
	console.log('Received SIGTERM, stopping...');
	await pm.stop();
	process.exit(0);
});
```

## See Also

- **[ProcessUnit](process-unit.md)**: Individual process wrapper
- **[ProcessLogger](process-logger.md)**: Log management and flags
- **[CrashReporter](crash-reporter.md)**: Crash handling and reporting
- **[TUI Integration](tui-integration.md)**: Interactive terminal UI
