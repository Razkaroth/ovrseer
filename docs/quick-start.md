# Quick Start Guide

This guide walks you through building a complete multi-process application with Ovrseer, from basic setup to advanced features like flag tracking, crash recovery, and interactive debugging.

## Installation

```bash
npm install @ovrseer/core @ovrseer/tui-ink
```

## Building Your First Application

Let's build a realistic application that manages a database, API server, and background worker.

### Step 1: Create the Project Structure

```
my-app/
├── package.json
├── src/
│   ├── index.ts       # Main orchestration file
│   ├── db.ts          # Database simulation
│   ├── api.ts         # API server
│   └── worker.ts      # Background worker
└── tsconfig.json
```

### Step 2: Set Up Dependencies

**src/db.ts** - Simulates a database with startup delay:

```ts
console.log('Database starting...');
setTimeout(() => console.log('Database connection pool initialized'), 1000);
setTimeout(() => console.log('Database ready to accept connections'), 2000);

setInterval(() => {
	const queries = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
	const query = queries[Math.floor(Math.random() * queries.length)];
	console.log(`Executed ${query} query in ${Math.floor(Math.random() * 50)}ms`);
}, 3000);
```

### Step 3: Set Up Main Processes

**src/api.ts** - API server:

```ts
console.log('API server initializing...');
setTimeout(() => console.log('Routes registered'), 500);
setTimeout(() => console.log('Server listening on port 3000'), 1000);

setInterval(() => {
	const methods = ['GET', 'POST', 'PUT', 'DELETE'];
	const endpoints = ['/users', '/posts', '/comments'];
	const statuses = [200, 201, 400, 500];

	const method = methods[Math.floor(Math.random() * methods.length)];
	const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
	const status = statuses[Math.floor(Math.random() * statuses.length)];

	console.log(`${method} ${endpoint} - ${status}`);

	if (Math.random() < 0.1) {
		console.error('Error: Database query timeout');
	}
}, 2000);
```

**src/worker.ts** - Background job processor:

```ts
console.log('Worker starting...');
setTimeout(() => console.log('Worker connected to queue'), 1000);

let jobCount = 0;
setInterval(() => {
	jobCount++;
	console.log(`Processing job #${jobCount}`);

	setTimeout(() => {
		if (Math.random() < 0.9) {
			console.log(`Job #${jobCount} completed successfully`);
		} else {
			console.error(`Job #${jobCount} failed - retrying`);
		}
	}, 1500);
}, 4000);
```

### Step 4: Orchestrate with Ovrseer

**src/index.ts** - Main orchestration:

```ts
import {Ovrseer, ProcessUnit, ProcessLogger} from '@ovrseer/core';
import {InkTUI} from '@ovrseer/tui-ink';

const pm = new Ovrseer({
	retries: 3,
	retryDelay: 2000,
});

const dbLogger = new ProcessLogger(1000, 100);
dbLogger.addFlag('ready', {
	pattern: /Database ready to accept connections/i,
	color: 'green',
	contextWindowSize: 3,
});
dbLogger.addFlag('slow-queries', {
	pattern: /query in (\d{3,})ms/i,
	color: 'yellow',
	targetCount: 5,
	contextWindowSize: 2,
});

const db = new ProcessUnit(
	'node',
	['dist/db.js'],
	[
		{
			logPattern: /Database ready to accept connections/i,
			timeout: 5000,
		},
	],
	dbLogger,
);

const apiLogger = new ProcessLogger(1000, 100);
apiLogger.addFlag('errors', {
	pattern: /error|exception/i,
	color: 'red',
	targetCount: 0,
	contextWindowSize: 5,
});
apiLogger.addFlag('requests', {
	pattern: /GET|POST|PUT|DELETE/i,
	color: 'blue',
	contextWindowSize: 1,
});
apiLogger.addFlag('4xx-errors', {
	pattern: /400|404|403|401/,
	color: 'yellow',
	targetCount: 10,
});
apiLogger.addFlag('5xx-errors', {
	pattern: /500|502|503/,
	color: 'red',
	targetCount: 0,
});

const api = new ProcessUnit(
	'node',
	['dist/api.js'],
	[
		{
			logPattern: /Server listening on port/i,
			timeout: 3000,
		},
	],
	apiLogger,
);

const workerLogger = new ProcessLogger(1000, 100);
workerLogger.addFlag('connected', {
	pattern: /Worker connected to queue/i,
	color: 'green',
});
workerLogger.addFlag('completed', {
	pattern: /completed successfully/i,
	color: 'green',
	contextWindowSize: 2,
});
workerLogger.addFlag('failures', {
	pattern: /failed - retrying/i,
	color: 'red',
	targetCount: 3,
	contextWindowSize: 3,
});

const worker = new ProcessUnit(
	'node',
	['dist/worker.js'],
	[
		{
			logPattern: /Worker connected to queue/i,
			timeout: 3000,
		},
	],
	workerLogger,
);

pm.addDependency('database', db);
pm.addMainProcess('api', api);
pm.addMainProcess('worker', worker);

pm.on('lifecycle:dependencies-ready', () => {
	console.log('✓ All dependencies ready - starting main processes');
});

pm.on('process:ready', ({name, duration}) => {
	console.log(`✓ ${name} ready after ${duration}ms`);
});

pm.on('process:crash', ({name, exitCode, signal}) => {
	console.error(`✗ ${name} crashed: exitCode=${exitCode}, signal=${signal}`);
});

pm.on(
	'flag:matched',
	({processName, flagName, line, matchCount, targetCount}) => {
		if (targetCount !== undefined && matchCount > targetCount) {
			console.warn(
				`⚠ Flag "${flagName}" in ${processName} exceeded target: ${matchCount}/${targetCount}`,
			);
		}
	},
);

const tui = new InkTUI();
tui.init();
tui.attachToManager(pm);

pm.start();
```

### Step 5: Run the Application

```bash
npm run build
node dist/index.js
```

You'll see the interactive TUI with:

- **Process list** showing database, api, and worker
- **Status indicators** for each process (🟢 = running)
- **Real-time logs** when you select a process
- **Flag panel** (press `f`) showing all matched patterns

## Understanding What's Happening

### 1. Dependency Phase

The database process starts first. Ovrseer waits for the log line "Database ready to accept connections" before proceeding. If the database doesn't become ready within 5 seconds, startup is aborted.

### 2. Main Phase

Once the database is ready, the API and worker processes start in parallel. Each has its own readiness check:

- API waits for "Server listening on port"
- Worker waits for "Worker connected to queue"

### 3. Flag Monitoring

While processes run, flags track important events:

- **Database**:
  - `ready`: Tracks when DB is ready (green)
  - `slow-queries`: Alerts if more than 5 slow queries detected (yellow)
- **API**:
  - `errors`: Alerts on any error (red, target 0)
  - `requests`: Tracks HTTP methods (blue)
  - `4xx-errors`: Alerts after 10 client errors (yellow)
  - `5xx-errors`: Alerts on any server error (red, target 0)
- **Worker**:
  - `connected`: Confirms connection (green)
  - `completed`: Tracks successful jobs (green)
  - `failures`: Alerts after 3 failures (red)

### 4. Crash Recovery

If any process crashes, Ovrseer:

1. Generates a crash report with exit code, signal, and last 100 log lines
2. Emits a `process:crash` event
3. Attempts restart (up to 3 times with 2s delay)
4. Marks process as permanently failed if retries exhausted

## Interactive TUI Features

### Navigation

- **↑/↓** or **j/k**: Move between processes
- **Enter**: Select process and view its logs
- **Esc**: Return to process list

### Process Control

- **r**: Restart selected process
- **R**: Restart all processes
- **s**: Stop selected process
- **q**: Quit (triggers cleanup phase)

### Flag Panel

Press **f** to open the flag panel. You'll see:

```
Flags for "api":
  errors (red) - 3 matches [target: 0] ⚠
    [line 45] Error: Database query timeout
    [line 67] Error: Connection refused
    [line 89] Error: Timeout waiting for response

  requests (blue) - 127 matches
    [line 23] GET /users - 200
    [line 24] POST /posts - 201
    ...

  4xx-errors (yellow) - 8 matches [target: 10]
    [line 34] GET /invalid - 404
    ...
```

Flags that exceed their target count are marked with ⚠ and highlighted.

## Adding Cleanup Processes

Cleanup processes run during shutdown to perform graceful teardown:

```ts
const backupLogger = new ProcessLogger(500, 50);
const backup = new ProcessUnit(
	'node',
	['scripts/backup-db.js'],
	[
		{
			logPattern: /Backup complete/i,
			timeout: 60000,
		},
	],
	backupLogger,
);

pm.addCleanupProcess('backup', backup);
```

When you press `q` in the TUI:

1. Main processes (api, worker) receive SIGTERM
2. Cleanup process (backup) starts
3. Ovrseer waits for "Backup complete" log line (up to 60s)
4. Dependencies (database) are terminated
5. Application exits

## Advanced Features

### Event-Driven Integration

Send metrics to monitoring services:

```ts
pm.on('flag:matched', ({processName, flagName, line}) => {
	if (flagName === 'errors') {
		fetch('https://metrics.example.com/api/errors', {
			method: 'POST',
			body: JSON.stringify({
				service: processName,
				message: line,
				timestamp: new Date(),
			}),
		});
	}
});
```

### Custom Crash Handlers

Integrate with error tracking:

```ts
pm.on('process:crash', async ({name, exitCode, signal}) => {
	await fetch('https://sentry.io/api/events', {
		method: 'POST',
		headers: {Authorization: `Bearer ${process.env.SENTRY_TOKEN}`},
		body: JSON.stringify({
			message: `Process ${name} crashed`,
			level: 'error',
			extra: {exitCode, signal},
		}),
	});
});
```

### Programmatic Control

Control processes via API:

```ts
pm.restartProcess('api');
pm.restartAll();
pm.stop();

const apiProcess = pm.getProcess('api');
const logs = apiProcess?.logger.getLogs({numberOfLines: 100});
const flags = apiProcess?.logger.getFlags();
```

## Real-World Scenarios

### Microservices Development

```ts
pm.addDependency('postgres', postgresContainer);
pm.addDependency('redis', redisContainer);
pm.addDependency('kafka', kafkaContainer);

pm.addMainProcess('auth-service', authService);
pm.addMainProcess('user-service', userService);
pm.addMainProcess('notification-service', notificationService);
pm.addMainProcess('analytics-worker', analyticsWorker);

pm.addCleanupProcess('flush-cache', cacheFlushScript);
pm.addCleanupProcess('drain-queue', queueDrainScript);
```

### Integration Testing

```ts
pm.on('lifecycle:dependencies-ready', async () => {
	await runMigrations();
	await seedTestData();
});

pm.on('lifecycle:main-started', async () => {
	const results = await runTestSuite();
	console.log(results);
	pm.stop();
});
```

### Deployment Scripts

```ts
pm.addDependency('build-assets', buildProcess);
pm.addMainProcess('deploy-app', deployProcess);
pm.addMainProcess('smoke-tests', smokeTestProcess);
pm.addCleanupProcess('notify-team', notificationProcess);
```

## Next Steps

- **[Component Documentation](components/)**: Deep dive into ProcessUnit, ProcessLogger, CrashReporter, and Ovrseer APIs
- **[Extension Guide](extension.md)**: Build custom loggers, crash reporters, and TUI integrations
- **[Overview](overview.md)**: Understand the architecture and design philosophy

## Troubleshooting

### Process Won't Start

Check readiness checks:

```ts
const logs = process.logger.getLogs({numberOfLines: 100});
console.log('Recent logs:', logs);
```

Increase timeout:

```ts
[{logPattern: /ready/i, timeout: 30000}];
```

### Flags Not Matching

Test regex patterns:

```ts
const testLine = 'Server listening on port 3000';
console.log(/listening on port/i.test(testLine));
```

Enable verbose logging:

```ts
logger.on('log', line => console.log('LOG:', line));
```

### Crashes Not Recovering

Check retry configuration:

```ts
const pm = new Ovrseer({
	retries: 5,
	retryDelay: 3000,
});
```

Inspect crash reports:

```ts
pm.on('process:crash', ({name, report}) => {
	console.log('Crash report:', report);
	console.log('Last logs:', report.lastLogs);
});
```
