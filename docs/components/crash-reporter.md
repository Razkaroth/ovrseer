# CrashReporter - Crash Analysis and Reporting

`CrashReporter` captures detailed information when processes crash, generating structured reports with exit codes, signals, recent logs, and metadata. The default implementation persists reports to disk for post-mortem analysis, but it's designed to be extended for integration with error tracking services.

## Core Features

- **Structured Reports**: Exit codes, signals, timestamps, and recent logs
- **Automatic Capture**: Triggered automatically by ProcessUnit on crash
- **Disk Persistence**: JSON reports saved to temporary directory by default
- **In-Memory Cache**: Query reports programmatically
- **Extensible**: Implement custom reporters for Sentry, Rollbar, custom backends

## Crash Report Structure

```ts
type CrashReport = {
	processId: string;
	processType: 'dependency' | 'main' | 'cleanup';
	type: ReportType;
	command: string;
	args: string[];
	errorMessage: string;
	errorStack?: string;
	logs: string;
	timestamp: string;
	status: ProcessStatus;
	retryCount?: number;
	context?: Record<string, any>;
};
```

| Field          | Type                                  | Description                                           |
| -------------- | ------------------------------------- | ----------------------------------------------------- |
| `processId`    | `string`                              | Unique process identifier                             |
| `processType`  | `"dependency" \| "main" \| "cleanup"` | Process group the process belonged to                 |
| `type`         | `ReportType`                          | Report classification (e.g., `crash`, `oom`, `error`) |
| `command`      | `string`                              | Executable command                                    |
| `args`         | `string[]`                            | Command arguments                                     |
| `errorMessage` | `string`                              | Error message or summary                              |
| `errorStack`   | `string?`                             | Optional stack trace string                           |
| `logs`         | `string`                              | Concatenated logs (plain text)                        |
| `timestamp`    | `string`                              | ISO timestamp string when report was generated        |
| `status`       | `ProcessStatus`                       | Process status at crash (e.g., `running`, `crashed`)  |
| `retryCount`   | `number?`                             | Optional number of retries attempted                  |
| `context`      | `object?`                             | Optional custom metadata                              |

## Constructor

```ts
new CrashReporter(reportsDir?: string)
```

### Parameters

| Parameter    | Type     | Default                             | Description                |
| ------------ | -------- | ----------------------------------- | -------------------------- |
| `reportsDir` | `string` | `os.tmpdir()/ovrseer/crash-reports` | Directory for report files |

### Example

```ts
import {CrashReporter} from '@ovrseer/core';
import path from 'path';

const reporter = new CrashReporter(path.join(process.cwd(), 'crash-reports'));
```

## API Methods

### Report Generation

#### `generateReport(processId: string, process: ProcessUnitI, processType: string, context?: Record<string, any>): CrashReport`

Generate a crash report for a failed process.

```ts
const report = reporter.generateReport('api-server', apiProcess, 'main', {
	environment: 'production',
	version: '1.2.3',
});
```

**Parameters**:

- `processId`: Unique identifier for the process
- `process`: ProcessUnit instance (provides logs, command, exit info)
- `processType`: Process group type
- `context`: Optional custom metadata

**Called automatically** by Ovrseer when a process crashes.

#### `async saveReport(report: CrashReport): Promise<void>`

Persist a crash report to disk.

```ts
await reporter.saveReport(report);
```

**Default behavior**:

- Creates JSON file: `{processId}-{timestamp}.json`
- Example: `api-server-2025-10-06T12-30-45-123Z.json`
- Ensures reports directory exists
- Also stores in in-memory cache

### Report Retrieval

#### `getReports(): CrashReport[]`

Get all crash reports from in-memory cache.

```ts
const reports = reporter.getReports();

for (const report of reports) {
	console.log(`Process: ${report.processId}`);
	console.log(`Exit Code: ${report.exitCode}`);
	console.log(`Signal: ${report.signal}`);
	console.log(`Timestamp: ${report.timestamp}`);
	console.log(`Last Logs:`, report.lastLogs.slice(-5));
}
```

#### `getLastReport(): CrashReport | undefined`

Get the most recent crash report.

```ts
const lastCrash = reporter.getLastReport();
if (lastCrash) {
	console.error('Last crash:', lastCrash.processId);
	console.error('Exit code:', lastCrash.exitCode);
}
```

#### `getReportsByProcessId(processId: string): CrashReport[]`

Get all reports for a specific process.

```ts
const apiCrashes = reporter.getReportsByProcessId('api-server');
console.log(`API server crashed ${apiCrashes.length} times`);
```

#### `clearReports(): void`

Clear in-memory report cache (does not delete disk files).

```ts
reporter.clearReports();
```

### Filesystem Access

#### `getReportsDir(): string`

Get the directory where reports are saved.

```ts
const dir = reporter.getReportsDir();
console.log('Crash reports saved to:', dir);
```

#### `listReportFiles(): Promise<string[]>`

List all report files on disk.

```ts
const files = await reporter.listReportFiles();
console.log('Report files:', files);
```

#### `readReportFile(filename: string): Promise<CrashReport>`

Read a specific report file from disk.

```ts
const report = await reporter.readReportFile(
	'api-server-2025-10-06T12-30-45-123Z.json',
);
console.log(report);
```

## Integration with Ovrseer

CrashReporter is automatically integrated when you create an Ovrseer instance:

```ts
const pm = new Ovrseer({
	retries: 3,
	crashReporter: new CrashReporter('./crash-reports'),
});

pm.on('process:crash', ({name, exitCode, signal, report}) => {
	console.error(`Process ${name} crashed`);
	console.error(`Exit code: ${exitCode}, Signal: ${signal}`);
	console.error(`Report saved to: ${pm.crashReporter?.getReportsDir()}`);
});
```

## Custom Crash Reporters

Extend `CrashReporter` or implement `CrashReporterI` for custom behavior:

### Sentry Integration

```ts
import {CrashReporter} from '@ovrseer/core';
import * as Sentry from '@sentry/node';

class SentryCrashReporter extends CrashReporter {
	async saveReport(report: CrashReport): Promise<void> {
		await super.saveReport(report);

		Sentry.captureException(new Error(`Process ${report.processId} crashed`), {
			level: 'error',
			extra: {
				processId: report.processId,
				processType: report.processType,
				command: report.command,
				args: report.args,
				exitCode: report.exitCode,
				signal: report.signal,
				lastLogs: report.lastLogs,
				context: report.context,
			},
			tags: {
				process_type: report.processType,
				exit_code: report.exitCode?.toString(),
			},
		});
	}
}

const pm = new Ovrseer({
	crashReporter: new SentryCrashReporter(),
});
```

### HTTP Endpoint Reporter

```ts
class HTTPCrashReporter extends CrashReporter {
	constructor(
		private endpoint: string,
		private apiKey: string,
		reportsDir?: string,
	) {
		super(reportsDir);
	}

	async saveReport(report: CrashReport): Promise<void> {
		await super.saveReport(report);

		try {
			await fetch(this.endpoint, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(report),
			});
		} catch (error) {
			console.error('Failed to send crash report to HTTP endpoint:', error);
		}
	}
}

const pm = new Ovrseer({
	crashReporter: new HTTPCrashReporter(
		'https://api.example.com/crashes',
		process.env.API_KEY!,
	),
});
```

### Slack Notifications

```ts
class SlackCrashReporter extends CrashReporter {
	constructor(private webhookUrl: string, reportsDir?: string) {
		super(reportsDir);
	}

	async saveReport(report: CrashReport): Promise<void> {
		await super.saveReport(report);

		const emoji = report.exitCode === 137 ? '💀' : '🚨';
		const color = report.signal ? 'danger' : 'warning';

		await fetch(this.webhookUrl, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
				text: `${emoji} Process crashed: ${report.processId}`,
				attachments: [
					{
						color,
						fields: [
							{title: 'Process Type', value: report.processType, short: true},
							{
								title: 'Exit Code',
								value: report.exitCode?.toString() || 'N/A',
								short: true,
							},
							{title: 'Signal', value: report.signal || 'N/A', short: true},
							{
								title: 'Time',
								value: report.timestamp.toISOString(),
								short: true,
							},
							{
								title: 'Command',
								value: `${report.command} ${report.args.join(' ')}`,
								short: false,
							},
							{
								title: 'Last Logs',
								value: `\`\`\`${report.lastLogs.slice(-10).join('\n')}\`\`\``,
								short: false,
							},
						],
					},
				],
			}),
		});
	}
}

const pm = new Ovrseer({
	crashReporter: new SlackCrashReporter(process.env.SLACK_WEBHOOK_URL!),
});
```

### Database Storage

```ts
import {Pool} from 'pg';

class DatabaseCrashReporter extends CrashReporter {
	constructor(private db: Pool, reportsDir?: string) {
		super(reportsDir);
	}

	async saveReport(report: CrashReport): Promise<void> {
		await super.saveReport(report);

		await this.db.query(
			`INSERT INTO crash_reports (
				process_id, process_type, command, args,
				exit_code, signal, timestamp, last_logs, context
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			[
				report.processId,
				report.processType,
				report.command,
				JSON.stringify(report.args),
				report.exitCode,
				report.signal,
				report.timestamp,
				JSON.stringify(report.lastLogs),
				JSON.stringify(report.context),
			],
		);
	}

	async getRecentCrashes(limit: number = 10): Promise<CrashReport[]> {
		const result = await this.db.query(
			`SELECT * FROM crash_reports
			ORDER BY timestamp DESC
			LIMIT $1`,
			[limit],
		);

		return result.rows.map(row => ({
			processId: row.process_id,
			processType: row.process_type,
			command: row.command,
			args: JSON.parse(row.args),
			exitCode: row.exit_code,
			signal: row.signal,
			timestamp: row.timestamp,
			lastLogs: JSON.parse(row.last_logs),
			context: JSON.parse(row.context || '{}'),
		}));
	}
}

const pool = new Pool({connectionString: process.env.DATABASE_URL});
const pm = new Ovrseer({
	crashReporter: new DatabaseCrashReporter(pool),
});
```

## Real-World Patterns

### Crash Rate Monitoring

```ts
const reporter = new CrashReporter();
const pm = new Ovrseer({crashReporter: reporter});

pm.on('process:crash', () => {
	const reports = reporter.getReports();
	const recentCrashes = reports.filter(
		r => Date.now() - r.timestamp.getTime() < 5 * 60 * 1000,
	);

	if (recentCrashes.length > 5) {
		console.error(
			'⚠ High crash rate detected:',
			recentCrashes.length,
			'crashes in 5 minutes',
		);
		sendPagerDutyAlert('High crash rate');
	}
});
```

### OOM Detection

```ts
pm.on('process:crash', ({report}) => {
	if (report.exitCode === 137 || report.signal === 'SIGKILL') {
		console.error('Likely out-of-memory crash');

		const memoryLogs = report.lastLogs.filter(line =>
			/memory|heap|oom/i.test(line),
		);

		if (memoryLogs.length > 0) {
			console.error('Memory-related logs:', memoryLogs);
		}
	}
});
```

### Crash Grouping

```ts
function groupCrashes(reports: CrashReport[]): Map<string, CrashReport[]> {
	const groups = new Map<string, CrashReport[]>();

	for (const report of reports) {
		const key = `${report.processId}-${report.exitCode}-${report.signal}`;
		const group = groups.get(key) || [];
		group.push(report);
		groups.set(key, group);
	}

	return groups;
}

const reports = reporter.getReports();
const grouped = groupCrashes(reports);

for (const [key, crashes] of grouped) {
	console.log(`${key}: ${crashes.length} occurrences`);
}
```

## Best Practices

### 1. Preserve Context

Include relevant metadata in crash reports:

```ts
const context = {
	environment: process.env.NODE_ENV,
	version: packageJson.version,
	nodeVersion: process.version,
	platform: process.platform,
	memory: process.memoryUsage(),
};

const report = reporter.generateReport('api', apiProcess, 'main', context);
```

### 2. Rotate Report Files

Implement rotation to prevent disk overflow:

```ts
class RotatingCrashReporter extends CrashReporter {
	async saveReport(report: CrashReport): Promise<void> {
		await super.saveReport(report);
		await this.rotateOldReports(30);
	}

	private async rotateOldReports(daysToKeep: number): Promise<void> {
		const files = await this.listReportFiles();
		const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

		for (const file of files) {
			const stat = await fs.stat(path.join(this.getReportsDir(), file));
			if (stat.mtimeMs < cutoff) {
				await fs.unlink(path.join(this.getReportsDir(), file));
			}
		}
	}
}
```

### 3. Redact Sensitive Data

Strip secrets before saving:

```ts
class RedactingCrashReporter extends CrashReporter {
	async saveReport(report: CrashReport): Promise<void> {
		const redacted = {
			...report,
			lastLogs: report.lastLogs.map(line =>
				line
					.replace(/password[=:]\S+/gi, 'password=***')
					.replace(/api[_-]?key[=:]\S+/gi, 'api_key=***')
					.replace(/token[=:]\S+/gi, 'token=***'),
			),
		};

		await super.saveReport(redacted);
	}
}
```

### 4. Alert on Critical Crashes

Distinguish between expected and critical failures:

```ts
pm.on('process:crash', ({report}) => {
	const isCritical =
		report.processType === 'dependency' ||
		report.exitCode === 1 ||
		report.signal === 'SIGSEGV';

	if (isCritical) {
		sendCriticalAlert(report);
	}
});
```

### 5. Analyze Crash Patterns

Periodically analyze crash reports:

```ts
setInterval(() => {
	const reports = reporter.getReports();
	const patterns = analyzeCrashPatterns(reports);

	console.log('Crash analysis:', patterns);
}, 60 * 60 * 1000);

function analyzeCrashPatterns(reports: CrashReport[]) {
	const exitCodes = new Map<number, number>();
	const processes = new Map<string, number>();

	for (const report of reports) {
		if (report.exitCode !== null) {
			exitCodes.set(report.exitCode, (exitCodes.get(report.exitCode) || 0) + 1);
		}
		processes.set(report.processId, (processes.get(report.processId) || 0) + 1);
	}

	return {exitCodes, processes};
}
```

## See Also

- **[ProcessUnit](process-unit.md)**: Process wrapper that triggers crash reports
- **[Ovrseer](ovrseer.md)**: Orchestrator that manages crash reporters
- **[ProcessLogger](process-logger.md)**: Provides logs for crash reports
