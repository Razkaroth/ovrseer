# ProcessUnit - Process Wrapper

`ProcessUnit` is a stateful wrapper around Node.js `ChildProcess` that provides lifecycle management, readiness synchronization, crash detection, and event-driven notifications. It's the fundamental building block for every process managed by Ovrseer.

## Core Features

- **Lifecycle Management**: Spawn, stop, restart, and kill with state tracking
- **Readiness Checks**: Pattern-based or exit-based checks to signal when a process is ready
- **Graceful Shutdown**: SIGTERM → wait → SIGKILL escalation
- **Crash Detection**: Distinguishes clean exits from crashes
- **Event Hooks**: React to ready, exit, crash, and restart events
- **Log Integration**: Automatic stdout/stderr capture via ProcessLogger

## State Machine

ProcessUnit maintains an internal state machine:

```
stopped → starting → ready → running
   ↑          ↓         ↓        ↓
   ←─────────┴─────────┴────────┘
        (stop/crash)
```

States:

- `stopped`: Not running
- `starting`: Spawned but not yet ready
- `ready`: Passed all readiness checks
- `running`: Actively running (no readiness checks)
- `crashed`: Exited unexpectedly

## Constructor

```ts
new ProcessUnit(
	command: string,
	args: string[],
	readyChecks: ReadyCheck[],
	logger: ProcessLoggerI,
	crashReporter?: CrashReporterI
)
```

### Parameters

| Parameter        | Type             | Description                                             |
| ---------------- | ---------------- | ------------------------------------------------------- |
| `command`        | `string`         | Executable command (e.g., `'node'`, `'docker'`, `'sh'`) |
| `args`           | `string[]`       | Command arguments                                       |
| `readyChecks`    | `ReadyCheck[]`   | Array of readiness checks (empty = ready immediately)   |
| `logger`         | `ProcessLoggerI` | Logger instance for capturing stdout/stderr             |
| `crashReporter?` | `CrashReporterI` | Optional crash reporter (defaults to CrashReporter)     |

### Example

```ts
import {ProcessUnit, ProcessLogger} from '@ovrseer/core';

const logger = new ProcessLogger(1000, 100);
const checks = [
	{logPattern: /server listening/i, timeout: 10000},
	{logPattern: /connected to database/i, timeout: 30000},
];

const process = new ProcessUnit('node', ['dist/server.js'], checks, logger);
```

## Readiness Checks

Readiness checks determine when a process is considered "ready". There are two types:

### Pattern-Based Checks

Wait for specific log patterns to appear:

```ts
type ReadyCheck = {
	logPattern: RegExp;
	timeout: number;
};
```

Example:

```ts
const checks = [
	{logPattern: /database ready/i, timeout: 30000},
	{logPattern: /listening on port \d+/i, timeout: 10000},
];
```

The process is ready when **all patterns have matched** within their timeouts.

**Timeout behavior**: If a pattern doesn't match within its timeout, the process is marked as failed and the `onReady` handler is never called.

### Exit-Based Checks

Wait for the process to exit cleanly:

```ts
const checks = [{timeout: 5000}];
```

The process is ready when it **exits with code 0** within the timeout.

**Use case**: Migration scripts, one-shot tasks, initialization processes.

### No Checks

If `readyChecks` is empty, the process is marked ready immediately after spawning:

```ts
const checks = [];
```

## API Methods

### Lifecycle Control

#### `async start(): Promise<void>`

Spawn the process and begin readiness checks.

```ts
await process.start();
```

**Behavior**:

1. Spawn child process with `spawn(command, args)`
2. Pipe stdout/stderr to logger
3. Start readiness checks
4. Update state to `starting`
5. When all checks pass, update state to `ready` and resolve `ready` promise
6. Emit `onReady` callback

**Throws**: If already running or if spawn fails.

#### `async stop(timeout?: number, signal?: StopSignal): Promise<void>`

Gracefully stop the process with escalation.

```ts
await process.stop(5000, 'SIGTERM');
```

**Parameters**:

- `timeout` (default: 5000): Milliseconds to wait before escalation
- `signal` (default: 'SIGTERM'): Initial signal to send

**Behavior**:

1. Send `signal` to process
2. Wait up to `timeout` ms for process to exit
3. If still running, send SIGKILL
4. Resolve when process exits

#### `kill(): void`

Immediately kill the process with SIGKILL.

```ts
process.kill();
```

**Use sparingly**: Prefer `stop()` for graceful termination.

#### `async restart(): Promise<void>`

Stop and restart the process.

```ts
await process.restart();
```

**Behavior**:

1. Call `stop()`
2. Call `prepareForRestart()`
3. Call `start()`

#### `prepareForRestart(): void`

Reset internal state for restart. Called automatically by `restart()`.

```ts
process.prepareForRestart();
```

**Resets**:

- State to `stopped`
- Readiness check state
- `ready` and `finished` promises

### State Queries

#### `isRunning(): boolean`

Returns `true` if process is in `starting`, `ready`, or `running` state.

```ts
if (process.isRunning()) {
	console.log('Process is active');
}
```

#### `getState(): ProcessState`

Returns current state: `'stopped'`, `'starting'`, `'ready'`, `'running'`, or `'crashed'`.

```ts
const state = process.getState();
console.log(`Current state: ${state}`);
```

#### `getPid(): number | undefined`

Returns process ID if running, otherwise `undefined`.

```ts
const pid = process.getPid();
if (pid) {
	console.log(`Process running with PID ${pid}`);
}
```

### Properties

#### `ready: Promise<void>`

Promise that resolves when the process becomes ready (passes all readiness checks).

```ts
await process.start();
await process.ready;
console.log('Process is now ready');
```

**Note**: Resets on each restart.

#### `finished: Promise<void>`

Promise that resolves when the process exits (clean or crash).

```ts
await process.start();
await process.finished;
console.log('Process has exited');
```

#### `logger: ProcessLoggerI`

Access to the associated logger.

```ts
const logs = process.logger.getLogs({numberOfLines: 50});
const flags = process.logger.getFlags();
```

#### `crashReporter: CrashReporterI`

Access to the crash reporter.

```ts
const reports = process.crashReporter.getReports();
```

## Event Hooks

ProcessUnit provides callback-based event hooks. Multiple handlers can be registered.

### `onReady(callback: () => void): void`

Called when the process passes all readiness checks.

```ts
process.onReady(() => {
	console.log('Process is ready!');
	const duration = Date.now() - startTime;
	console.log(`Ready after ${duration}ms`);
});
```

### `onExit(callback: (exitCode: number | null, signal: string | null) => void): void`

Called when the process exits (clean or crash).

```ts
process.onExit((exitCode, signal) => {
	if (exitCode === 0) {
		console.log('Clean exit');
	} else {
		console.error(`Exited with code ${exitCode}, signal ${signal}`);
	}
});
```

### `onCrash(callback: (error: {exitCode: number | null, signal: string | null}) => void): void`

Called when the process crashes (non-zero exit or signal).

```ts
process.onCrash(({exitCode, signal}) => {
	console.error(`Process crashed: code=${exitCode}, signal=${signal}`);
	sendAlert(`Process crashed: ${exitCode || signal}`);
});
```

### `onRestart(callback: () => void): void`

Called when the process is about to restart (after crash or manual restart).

```ts
process.onRestart(() => {
	console.log('Process restarting...');
});
```

## Readiness Check Examples

### Database Dependency

Wait for database to be ready and connected:

```ts
const dbLogger = new ProcessLogger(1000, 100);
const db = new ProcessUnit(
	'docker',
	['run', '--rm', '-p', '5432:5432', 'postgres:15'],
	[
		{logPattern: /database system is ready/i, timeout: 60000},
		{logPattern: /listening on .*:5432/i, timeout: 60000},
	],
	dbLogger,
);

db.onReady(() => console.log('Database ready'));
await db.start();
await db.ready;
```

### Migration Script

Wait for migration to complete:

```ts
const migrationLogger = new ProcessLogger(500, 50);
const migration = new ProcessUnit(
	'node',
	['scripts/migrate.js'],
	[{timeout: 120000}],
	migrationLogger,
);

await migration.start();
await migration.finished;
```

### Web Server

Wait for server to listen:

```ts
const serverLogger = new ProcessLogger(1000, 100);
const server = new ProcessUnit(
	'node',
	['dist/server.js'],
	[{logPattern: /server listening on port \d+/i, timeout: 10000}],
	serverLogger,
);

server.onReady(() => console.log('Server accepting connections'));
await server.start();
```

### No Readiness Check

Start immediately without waiting:

```ts
const workerLogger = new ProcessLogger(1000, 100);
const worker = new ProcessUnit('node', ['dist/worker.js'], [], workerLogger);

await worker.start();
```

## Crash Detection

ProcessUnit distinguishes between clean exits and crashes:

### Clean Exit

- Exit code: 0
- Signal: null
- Triggers: `onExit` (not `onCrash`)

### Crash

- Exit code: non-zero
- Or signal: SIGKILL, SIGTERM, SIGSEGV, etc.
- Triggers: `onExit` and `onCrash`
- Generates crash report

### Example

```ts
process.onExit((exitCode, signal) => {
	console.log(`Exited: code=${exitCode}, signal=${signal}`);
});

process.onCrash(({exitCode, signal}) => {
	console.error(`Crashed: code=${exitCode}, signal=${signal}`);

	const report = process.crashReporter.getLastReport();
	if (report) {
		console.error('Last logs:', report.lastLogs);
	}
});
```

## Integration with Ovrseer

When used with Ovrseer, ProcessUnit events are automatically wired:

```ts
const pm = new Ovrseer();
pm.addMainProcess('api', apiProcess);

pm.on('process:ready', ({name}) => {
	console.log(`${name} is ready`);
});

pm.on('process:crash', ({name, exitCode}) => {
	console.error(`${name} crashed with code ${exitCode}`);
});

await pm.start();
```

Ovrseer handles:

- Automatic restart on crash
- Retry limit enforcement
- Dependency coordination
- Cleanup orchestration

## Advanced Patterns

### Health Checks

Combine readiness checks with periodic health checks:

```ts
process.onReady(async () => {
	setInterval(async () => {
		const response = await fetch('http://localhost:3000/health');
		if (!response.ok) {
			console.error('Health check failed');
			process.restart();
		}
	}, 30000);
});
```

### Conditional Restart

Restart based on exit code:

```ts
process.onExit((exitCode, signal) => {
	if (exitCode === 137) {
		console.warn('Process killed (likely OOM), not restarting');
	} else if (exitCode !== 0) {
		console.log('Restarting after crash...');
		process.restart();
	}
});
```

### Custom Readiness Logic

Extend with custom checks:

```ts
process.onReady(async () => {
	console.log('Basic readiness passed, checking database connection...');

	try {
		await connectToDatabase();
		console.log('Database connection verified');
	} catch (error) {
		console.error('Database connection failed, stopping process');
		process.stop();
	}
});
```

## Best Practices

### 1. Always Define Readiness Checks for Dependencies

Dependencies should have readiness checks to prevent race conditions:

```ts
const db = new ProcessUnit(
	'docker',
	['run', 'postgres'],
	[{logPattern: /ready to accept connections/i, timeout: 30000}],
	dbLogger,
);
```

### 2. Use Appropriate Timeouts

- **Quick services**: 5-10 seconds
- **Databases**: 30-60 seconds
- **Migrations**: 2-5 minutes

```ts
{logPattern: /ready/i, timeout: 10000}
```

### 3. Handle Readiness Failures

Check if ready before proceeding:

```ts
try {
	await process.start();
	await process.ready;
} catch (error) {
	console.error('Process failed to become ready:', error);
	process.kill();
}
```

### 4. Use Graceful Shutdown

Prefer `stop()` over `kill()`:

```ts
await process.stop(10000, 'SIGTERM');
```

### 5. Monitor Crash Patterns

Track crash rates:

```ts
let crashCount = 0;
process.onCrash(() => {
	crashCount++;
	if (crashCount > 5) {
		console.error('Too many crashes, alerting ops team');
		sendAlert('Process crashing repeatedly');
	}
});
```

## See Also

- **[ProcessLogger](process-logger.md)**: Log capture and flag system
- **[CrashReporter](crash-reporter.md)**: Crash report generation
- **[Ovrseer](ovrseer.md)**: Process orchestration
