# ProcessLogger - Log Management and Analysis

`ProcessLogger` is a powerful log management system that captures stdout/stderr, maintains circular buffers for efficient memory usage, and provides pattern-based flag tracking with context windows. It transforms passive log collection into active monitoring and analysis.

## Core Features

- **Circular Buffer**: Memory-efficient storage of recent log lines
- **Real-time Streaming**: Event-based log and error listeners
- **Flag System**: Pattern matching with color coding, counters, and context windows
- **Context Windows**: Capture surrounding lines when patterns match
- **Flexible Retrieval**: Query logs with pagination, ordering, and filtering

## Constructor

```ts
new ProcessLogger(
	maxBufferSize: number,
	maxLogSize: number,
	defaultSeparator?: string
)
```

### Parameters

| Parameter          | Type     | Default | Description                              |
| ------------------ | -------- | ------- | ---------------------------------------- |
| `maxBufferSize`    | `number` | -       | Total lines to retain in circular buffer |
| `maxLogSize`       | `number` | -       | Maximum lines for recent log queries     |
| `defaultSeparator` | `string` | `'\n'`  | Line delimiter for splitting chunks      |

### Example

```ts
import {ProcessLogger} from '@ovrseer/core';

const logger = new ProcessLogger(1000, 100, '\n');
```

This creates a logger that:

- Stores last 1000 log lines in memory
- Returns up to 100 lines for "recent logs" queries
- Splits incoming data by newline

## API Methods

### Log Capture

#### `addChunk(chunk: string, isError?: boolean): void`

Add raw log data (called automatically by ProcessUnit).

```ts
logger.addChunk('Server started on port 3000\n', false);
logger.addChunk('ERROR: Connection refused\n', true);
```

**Parameters**:

- `chunk`: Raw log data (may contain multiple lines)
- `isError`: `true` for stderr, `false` for stdout

**Behavior**:

1. Split chunk by separator into lines
2. Add each line to circular buffer
3. Test each line against all flags
4. Emit `log` or `error` event for each line
5. If flag matches, emit `flag:matched` event with context

### Log Retrieval

#### `getLogs(options?: GetLogsOptions): string[]`

Retrieve buffered log lines with flexible filtering.

```ts
type GetLogsOptions = {
	index?: number;
	numberOfLines?: number;
	separator?: string;
	mostRecentFirst?: boolean;
};
```

| Option            | Type      | Default            | Description                           |
| ----------------- | --------- | ------------------ | ------------------------------------- |
| `index`           | `number`  | `0`                | Starting index (0 = oldest in buffer) |
| `numberOfLines`   | `number`  | `maxLogSize`       | Max lines to return                   |
| `separator`       | `string`  | `defaultSeparator` | Join lines with this separator        |
| `mostRecentFirst` | `boolean` | `true`             | Reverse order (newest first)          |

**Examples**:

```ts
const recent = logger.getLogs({numberOfLines: 50});

const oldest = logger.getLogs({
	index: 0,
	numberOfLines: 100,
	mostRecentFirst: false,
});

const middle = logger.getLogs({
	index: 100,
	numberOfLines: 50,
});

const asString = logger.getLogs({
	numberOfLines: 100,
	separator: '\n',
});
```

#### `getContextWindow(logIndex: number, windowSize: number): string[]`

Get surrounding lines for a specific log index (used internally by flags).

```ts
const context = logger.getContextWindow(500, 3);
```

Returns `windowSize` lines before and after the given index.

### Flag Management

#### `addFlag(name: string, flag: LogFlag): void`

Register a pattern-based flag for tracking.

```ts
type LogFlag = {
	pattern: RegExp;
	color: 'red' | 'green' | 'yellow' | 'blue' | 'purple' | 'orange';
	contextWindowSize?: number;
	targetCount?: number;
};
```

| Property            | Type     | Required | Description                                      |
| ------------------- | -------- | -------- | ------------------------------------------------ |
| `pattern`           | `RegExp` | Yes      | Pattern to match against log lines               |
| `color`             | `string` | Yes      | Visual indicator in TUI                          |
| `contextWindowSize` | `number` | No       | Lines before/after match to capture              |
| `targetCount`       | `number` | No       | Alert threshold (flag exceeds if count > target) |

**Examples**:

```ts
logger.addFlag('errors', {
	pattern: /error|exception/i,
	color: 'red',
	contextWindowSize: 5,
	targetCount: 0,
});

logger.addFlag('slow-queries', {
	pattern: /query took (\d+)ms/i,
	color: 'yellow',
	targetCount: 10,
	contextWindowSize: 2,
});

logger.addFlag('requests', {
	pattern: /GET|POST|PUT|DELETE/i,
	color: 'blue',
});

logger.addFlag('database-ready', {
	pattern: /database system is ready/i,
	color: 'green',
	contextWindowSize: 3,
});
```

#### `removeFlag(name: string): void`

Remove a flag by name.

```ts
logger.removeFlag('slow-queries');
```

#### `getFlags(): Map<string, FlagMatch>`

Retrieve all flags with their match data.

```ts
type FlagMatch = {
	flag: LogFlag;
	matches: Array<{
		line: string;
		lineIndex: number;
		context: string[];
	}>;
	matchCount: number;
	exceeded: boolean;
};
```

**Example**:

```ts
const flags = logger.getFlags();

for (const [name, data] of flags) {
	console.log(`Flag: ${name}`);
	console.log(`  Matches: ${data.matchCount}`);
	console.log(`  Exceeded: ${data.exceeded}`);
	console.log(`  Color: ${data.flag.color}`);

	if (data.exceeded) {
		console.warn(
			`  ⚠ Target exceeded: ${data.matchCount} > ${data.flag.targetCount}`,
		);
	}

	for (const match of data.matches) {
		console.log(`    [${match.lineIndex}] ${match.line}`);
		if (match.context.length > 0) {
			console.log(`      Context:`, match.context);
		}
	}
}
```

#### `clearFlags(): void`

Reset all flag match counts and data.

```ts
logger.clearFlags();
```

### Event Listeners

#### `onLog(callback: (line: string) => void): void`

Subscribe to stdout log lines (real-time).

```ts
logger.onLog(line => {
	console.log(`[LOG] ${line}`);
});
```

#### `onError(callback: (line: string) => void): void`

Subscribe to stderr log lines (real-time).

```ts
logger.onError(line => {
	console.error(`[ERROR] ${line}`);
});
```

#### `onFlagMatch(callback: (data: FlagMatchEvent) => void): void`

Subscribe to flag match events.

```ts
type FlagMatchEvent = {
	flagName: string;
	line: string;
	lineIndex: number;
	matchCount: number;
	context: string[];
	flag: LogFlag;
};
```

**Example**:

```ts
logger.onFlagMatch(({flagName, line, matchCount, flag}) => {
	if (flag.targetCount !== undefined && matchCount > flag.targetCount) {
		console.warn(
			`⚠ Flag "${flagName}" exceeded target: ${matchCount}/${flag.targetCount}`,
		);
		console.warn(`  Line: ${line}`);
		sendAlert(`Alert: ${flagName} exceeded threshold`);
	}
});
```

## Flag System Deep Dive

The flag system is the most powerful feature of ProcessLogger. It enables real-time log analysis and alerting.

### Pattern Matching

Flags use JavaScript regex patterns:

```ts
logger.addFlag('http-errors', {
	pattern: /HTTP\/\d\.\d" [45]\d\d/,
	color: 'red',
});

logger.addFlag('api-calls', {
	pattern: /api\.example\.com\/v\d+/,
	color: 'blue',
});

logger.addFlag('performance', {
	pattern: /completed in (\d+)ms/i,
	color: 'yellow',
});
```

**Tips**:

- Use case-insensitive matching: `/error/i`
- Capture groups for extraction: `/took (\d+)ms/`
- Word boundaries: `/\bfatal\b/i`
- Avoid greedy quantifiers: use `.*?` instead of `.*`

### Context Windows

Context windows capture surrounding lines when a pattern matches:

```ts
logger.addFlag('crashes', {
	pattern: /FATAL|PANIC/i,
	color: 'red',
	contextWindowSize: 5,
});
```

If line 100 matches, context includes lines 95-99 (before) and 101-105 (after).

**In TUI**, context windows are displayed when you press `f` to open the flag panel:

```
crashes (red) - 2 matches [target: not set]
  [line 100] FATAL: Out of memory
    Context:
      [95] Allocating buffer...
      [96] Buffer size: 1024MB
      [97] Available memory: 512MB
      [98] WARNING: Low memory
      [99] Attempting allocation...
      [101] Process terminating
      [102] Cleanup handlers running
      [103] Exit code: 137
      [104] Process exited
      [105] Restarting...
```

### Target Counts

Target counts define alert thresholds:

```ts
logger.addFlag('auth-failures', {
	pattern: /authentication failed/i,
	color: 'yellow',
	targetCount: 5,
});
```

**Behavior**:

- Match count starts at 0
- Increments each time pattern matches
- Flag is "exceeded" when `matchCount > targetCount`
- Exceeded flags are highlighted in TUI with ⚠ indicator

**Use cases**:

- Error thresholds: `targetCount: 0` (any match is an alert)
- Rate limiting: `targetCount: 100` (alert after 100 occurrences)
- Quality metrics: `targetCount: 10` (acceptable failure rate)

**Example with alerts**:

```ts
logger.addFlag('database-errors', {
	pattern: /database.*error/i,
	color: 'red',
	targetCount: 0,
	contextWindowSize: 5,
});

logger.onFlagMatch(({flagName, matchCount, flag, line, context}) => {
	if (flag.targetCount !== undefined && matchCount > flag.targetCount) {
		const alert = {
			severity: 'critical',
			service: 'database',
			message: `Database errors detected: ${matchCount} occurrences`,
			sample: line,
			context: context,
			timestamp: new Date(),
		};

		sendToMonitoring(alert);
	}
});
```

### Color Coding

Colors provide visual categorization in the TUI:

- **Red**: Errors, failures, critical issues
- **Yellow**: Warnings, slow performance, rate limits
- **Green**: Success, ready states, confirmations
- **Blue**: Informational, requests, general activity
- **Purple**: Background jobs, async operations
- **Orange**: Retries, fallbacks, degraded states

## Real-World Examples

### Error Tracking

```ts
const logger = new ProcessLogger(2000, 200);

logger.addFlag('critical', {
	pattern: /FATAL|CRITICAL|EMERGENCY/i,
	color: 'red',
	targetCount: 0,
	contextWindowSize: 10,
});

logger.addFlag('errors', {
	pattern: /ERROR|EXCEPTION/i,
	color: 'red',
	targetCount: 10,
	contextWindowSize: 5,
});

logger.addFlag('warnings', {
	pattern: /WARN|WARNING/i,
	color: 'yellow',
	targetCount: 50,
});

logger.onFlagMatch(({flagName, matchCount, flag}) => {
	if (matchCount > (flag.targetCount ?? Infinity)) {
		datadogClient.increment('app.log_threshold_exceeded', {flag: flagName});
	}
});
```

### Performance Monitoring

```ts
logger.addFlag('slow-queries', {
	pattern: /query executed in (\d{3,})ms/i,
	color: 'yellow',
	targetCount: 5,
	contextWindowSize: 3,
});

logger.addFlag('very-slow-queries', {
	pattern: /query executed in (\d{4,})ms/i,
	color: 'red',
	targetCount: 0,
	contextWindowSize: 5,
});

logger.onFlagMatch(({line, flag}) => {
	const match = line.match(/query executed in (\d+)ms/i);
	if (match) {
		const duration = parseInt(match[1]);
		metrics.timing('database.query_duration', duration);
	}
});
```

### Request Tracking

```ts
logger.addFlag('http-requests', {
	pattern: /(GET|POST|PUT|DELETE|PATCH) \/\S+/,
	color: 'blue',
});

logger.addFlag('slow-requests', {
	pattern: /request completed in (\d{3,})ms/i,
	color: 'yellow',
	targetCount: 20,
});

logger.addFlag('client-errors', {
	pattern: /HTTP\/\d\.\d" 4\d\d/,
	color: 'yellow',
	targetCount: 100,
});

logger.addFlag('server-errors', {
	pattern: /HTTP\/\d\.\d" 5\d\d/,
	color: 'red',
	targetCount: 0,
	contextWindowSize: 5,
});
```

### Readiness Tracking

```ts
logger.addFlag('startup', {
	pattern: /initializing|starting|loading/i,
	color: 'blue',
	contextWindowSize: 2,
});

logger.addFlag('ready', {
	pattern: /ready|listening|accepting connections/i,
	color: 'green',
	contextWindowSize: 3,
});

logger.addFlag('health-check', {
	pattern: /health check (passed|ok)/i,
	color: 'green',
});

logger.addFlag('health-failure', {
	pattern: /health check (failed|error)/i,
	color: 'red',
	targetCount: 0,
	contextWindowSize: 5,
});
```

## Integration Patterns

### Elasticsearch/Datadog Streaming

```ts
class ElasticsearchLogger extends ProcessLogger {
	constructor(
		maxBufferSize: number,
		maxLogSize: number,
		private esClient: Client,
	) {
		super(maxBufferSize, maxLogSize);

		this.onLog(async line => {
			await this.esClient.index({
				index: 'app-logs',
				body: {
					message: line,
					level: 'info',
					timestamp: new Date(),
				},
			});
		});

		this.onError(async line => {
			await this.esClient.index({
				index: 'app-logs',
				body: {
					message: line,
					level: 'error',
					timestamp: new Date(),
				},
			});
		});
	}
}
```

### Sentry Integration

```ts
logger.addFlag('exceptions', {
	pattern: /exception|uncaught/i,
	color: 'red',
	targetCount: 0,
	contextWindowSize: 10,
});

logger.onFlagMatch(({flagName, line, context}) => {
	if (flagName === 'exceptions') {
		Sentry.captureException(new Error(line), {
			extra: {
				context: context,
				timestamp: new Date(),
			},
		});
	}
});
```

### Slack Notifications

```ts
logger.onFlagMatch(async ({flagName, line, matchCount, flag}) => {
	if (flag.targetCount !== undefined && matchCount > flag.targetCount) {
		await fetch(process.env.SLACK_WEBHOOK, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
				text: `⚠ Alert: ${flagName} exceeded threshold`,
				attachments: [
					{
						color: flag.color === 'red' ? 'danger' : 'warning',
						fields: [
							{
								title: 'Count',
								value: `${matchCount}/${flag.targetCount}`,
								short: true,
							},
							{title: 'Sample', value: line, short: false},
						],
					},
				],
			}),
		});
	}
});
```

## Best Practices

### 1. Size Buffers Appropriately

- **Low-traffic processes**: 500-1000 lines
- **Medium-traffic**: 1000-2000 lines
- **High-traffic**: 2000-5000 lines

```ts
const logger = new ProcessLogger(2000, 200);
```

### 2. Use Specific Patterns

Avoid overly broad patterns:

```ts
logger.addFlag('specific-error', {
	pattern: /DatabaseConnectionError: Connection refused/,
	color: 'red',
});
```

### 3. Set Realistic Target Counts

- **Critical errors**: 0
- **Warnings**: 10-50
- **Info**: 100+

```ts
logger.addFlag('errors', {
	pattern: /error/i,
	color: 'red',
	targetCount: 5,
});
```

### 4. Balance Context Window Size

Larger windows provide more info but consume memory:

```ts
logger.addFlag('crashes', {
	pattern: /crash/i,
	color: 'red',
	contextWindowSize: 5,
});
```

### 5. Clear Flags on Restart

Reset counters when restarting:

```ts
process.onRestart(() => {
	logger.clearFlags();
});
```

## See Also

- **[ProcessUnit](process-unit.md)**: Process wrapper that uses ProcessLogger
- **[Ovrseer](ovrseer.md)**: Orchestrator that aggregates log events
- **[TUI Integration](tui-integration.md)**: Visual flag display
