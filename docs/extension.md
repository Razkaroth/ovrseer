# Extensions & Real-World Integrations

## Overview

Ovrseer is designed for production environments and provides multiple extension points for integrating with your existing observability, monitoring, and alerting infrastructure. The primary extension interfaces are:

- **CrashReporterI** - Custom crash report generation, storage, and forwarding
- **ProcessLoggerI** - Custom log handling, parsing, and streaming
- **TUIRendererI** - Custom terminal interfaces or UI integrations

This guide covers real-world integration patterns with popular monitoring services (Datadog, Sentry, Slack), log aggregation systems (Elasticsearch, Splunk), and custom alerting workflows.

## Extension Points

### CrashReporterI

```ts
interface CrashReporterI {
	generateReport(
		processId: string,
		process: ProcessUnitI,
		type: ReportType,
		context?: Record<string, any>,
	): CrashReport;

	saveReport(report: CrashReport): Promise<void>;
	getReports(): CrashReport[];
	clearReports(): void;
	getReportsDir(): string;
}
```

### ProcessLoggerI

```ts
interface ProcessLoggerI {
	onLog(callback: (line: string) => void): void;
	getLogs(): string;
	addFlag(name: string, config: FlagConfig): void;
	getFlags(): Map<string, FlagState>;
	getAllFlags(): Map<string, FlagState>;
	onFlagMatch(callback: (name: string, match: FlagMatch) => void): void;
	onFlagTargetReached(callback: (name: string, state: FlagState) => void): void;
}
```

### TUIRendererI

```ts
interface TUIRendererI {
	init(): void;
	destroy(): void;
	render(processes: ProcessMap, state: TUIState): void;
	onKeyPress(callback: (key: string, meta?: TUIKeyPressMeta) => void): void;
	showLogs(processId: string, processType: TUIProcessType, logs: string): void;
	showStatus(message: string): void;
}
```

## Real-World Integration Patterns

### 1. Sentry Crash Reporting

Send crash reports to Sentry with full context including logs, environment, and process metadata.

```ts
import * as Sentry from '@sentry/node';
import type {
	CrashReporterI,
	CrashReport,
	ProcessUnitI,
	ReportType,
} from '@ovrseer/core';

class SentryCrashReporter implements CrashReporterI {
	private reports: CrashReport[] = [];

	constructor(dsn: string, environment: string) {
		Sentry.init({
			dsn,
			environment,
			tracesSampleRate: 1.0,
		});
	}

	generateReport(
		processId: string,
		process: ProcessUnitI,
		type: ReportType,
		context?: Record<string, any>,
	): CrashReport {
		const logs = (() => {
			try {
				return process.logger.getLogs();
			} catch {
				return 'No logs available';
			}
		})();

		return {
			timestamp: new Date().toISOString(),
			processId,
			processType: context?.processType || 'main',
			type,
			errorMessage:
				context?.errorMessage || context?.error?.message || String(type),
			errorStack: context?.error?.stack,
			logs,
			status: process.getStatus(),
			retryCount: context?.retryCount,
			context,
		};
	}

	async saveReport(report: CrashReport): Promise<void> {
		this.reports.push(report);

		Sentry.withScope(scope => {
			scope.setTag('process_id', report.processId);
			scope.setTag('process_type', report.processType);
			scope.setTag('crash_type', report.type);
			scope.setTag('retry_count', report.retryCount || 0);

			scope.setContext('process', {
				id: report.processId,
				type: report.processType,
				status: report.status,
				retryCount: report.retryCount,
			});

			scope.setContext('logs', {
				recent: report.logs.split('\n').slice(-50).join('\n'),
			});

			if (report.context) {
				scope.setContext('additional', report.context);
			}

			const error = new Error(report.errorMessage);
			error.stack = report.errorStack || error.stack;

			Sentry.captureException(error);
		});

		await Sentry.flush(2000);
	}

	getReports(): CrashReport[] {
		return [...this.reports];
	}

	clearReports(): void {
		this.reports = [];
	}

	getReportsDir(): string {
		return 'sentry://reports';
	}
}

const manager = new Ovrseer({
	crashReporter: new SentryCrashReporter(
		process.env.SENTRY_DSN!,
		process.env.NODE_ENV!,
	),
	retries: 3,
});
```

### 2. Datadog Metrics & Events

Stream process metrics and crash events to Datadog for centralized monitoring.

```ts
import {StatsD} from 'hot-shots';
import type {
	CrashReporterI,
	CrashReport,
	ProcessUnitI,
	ReportType,
} from '@ovrseer/core';

class DatadogCrashReporter implements CrashReporterI {
	private reports: CrashReport[] = [];
	private dogstatsd: StatsD;

	constructor(host: string, port: number, prefix: string) {
		this.dogstatsd = new StatsD({
			host,
			port,
			prefix,
			globalTags: {
				service: 'ovrseer',
				env: process.env.NODE_ENV || 'development',
			},
		});
	}

	generateReport(
		processId: string,
		process: ProcessUnitI,
		type: ReportType,
		context?: Record<string, any>,
	): CrashReport {
		const logs = (() => {
			try {
				return process.logger.getLogs();
			} catch {
				return 'No logs available';
			}
		})();

		return {
			timestamp: new Date().toISOString(),
			processId,
			processType: context?.processType || 'main',
			type,
			errorMessage:
				context?.errorMessage || context?.error?.message || String(type),
			errorStack: context?.error?.stack,
			logs,
			status: process.getStatus(),
			retryCount: context?.retryCount,
			context,
		};
	}

	async saveReport(report: CrashReport): Promise<void> {
		this.reports.push(report);

		this.dogstatsd.increment('process.crash', 1, {
			process_id: report.processId,
			process_type: report.processType,
			crash_type: report.type,
			retry_count: String(report.retryCount || 0),
		});

		this.dogstatsd.event('Process Crashed', report.errorMessage, {
			alert_type: 'error',
			tags: [
				`process_id:${report.processId}`,
				`process_type:${report.processType}`,
				`crash_type:${report.type}`,
			],
		});

		if (report.retryCount !== undefined) {
			this.dogstatsd.gauge('process.retry_count', report.retryCount, {
				process_id: report.processId,
			});
		}
	}

	getReports(): CrashReport[] {
		return [...this.reports];
	}

	clearReports(): void {
		this.reports = [];
	}

	getReportsDir(): string {
		return 'datadog://events';
	}
}

const manager = new Ovrseer({
	crashReporter: new DatadogCrashReporter('localhost', 8125, 'ovrseer.'),
	retries: 3,
});
```

### 3. Slack Alerting

Send crash alerts to Slack with formatted messages including logs and context.

```ts
import {WebClient} from '@slack/web-api';
import type {
	CrashReporterI,
	CrashReport,
	ProcessUnitI,
	ReportType,
} from '@ovrseer/core';

class SlackCrashReporter implements CrashReporterI {
	private reports: CrashReport[] = [];
	private slack: WebClient;
	private channel: string;

	constructor(token: string, channel: string) {
		this.slack = new WebClient(token);
		this.channel = channel;
	}

	generateReport(
		processId: string,
		process: ProcessUnitI,
		type: ReportType,
		context?: Record<string, any>,
	): CrashReport {
		const logs = (() => {
			try {
				return process.logger.getLogs();
			} catch {
				return 'No logs available';
			}
		})();

		return {
			timestamp: new Date().toISOString(),
			processId,
			processType: context?.processType || 'main',
			type,
			errorMessage:
				context?.errorMessage || context?.error?.message || String(type),
			errorStack: context?.error?.stack,
			logs,
			status: process.getStatus(),
			retryCount: context?.retryCount,
			context,
		};
	}

	async saveReport(report: CrashReport): Promise<void> {
		this.reports.push(report);

		const emoji = report.type === 'timeout' ? '⏱️' : '💥';
		const recentLogs = report.logs.split('\n').slice(-10).join('\n');

		try {
			await this.slack.chat.postMessage({
				channel: this.channel,
				text: `${emoji} Process Crash: ${report.processId}`,
				blocks: [
					{
						type: 'header',
						text: {
							type: 'plain_text',
							text: `${emoji} Process Crashed: ${report.processId}`,
						},
					},
					{
						type: 'section',
						fields: [
							{type: 'mrkdwn', text: `*Type:*\n${report.type}`},
							{type: 'mrkdwn', text: `*Process Type:*\n${report.processType}`},
							{type: 'mrkdwn', text: `*Status:*\n${report.status}`},
							{
								type: 'mrkdwn',
								text: `*Retry Count:*\n${report.retryCount || 0}`,
							},
						],
					},
					{
						type: 'section',
						text: {
							type: 'mrkdwn',
							text: `*Error:*\n\`\`\`${report.errorMessage}\`\`\``,
						},
					},
					{
						type: 'section',
						text: {
							type: 'mrkdwn',
							text: `*Recent Logs:*\n\`\`\`${recentLogs}\`\`\``,
						},
					},
					{
						type: 'context',
						elements: [
							{
								type: 'mrkdwn',
								text: `Timestamp: ${report.timestamp}`,
							},
						],
					},
				],
			});
		} catch (e) {
			console.error('Failed to send Slack alert:', e);
		}
	}

	getReports(): CrashReport[] {
		return [...this.reports];
	}

	clearReports(): void {
		this.reports = [];
	}

	getReportsDir(): string {
		return 'slack://alerts';
	}
}

const manager = new Ovrseer({
	crashReporter: new SlackCrashReporter(
		process.env.SLACK_TOKEN!,
		'#infrastructure-alerts',
	),
	retries: 3,
});
```

### 4. Elasticsearch Log Shipping

Stream logs in real-time to Elasticsearch for centralized log aggregation and search.

```ts
import {Client} from '@elastic/elasticsearch';
import {ProcessLogger} from '@ovrseer/core';

class ElasticsearchLogger extends ProcessLogger {
	private client: Client;
	private index: string;
	private processId: string;

	constructor(
		maxBufferSize: number,
		maxLogSize: number,
		esUrl: string,
		index: string,
		processId: string,
	) {
		super(maxBufferSize, maxLogSize);
		this.client = new Client({node: esUrl});
		this.index = index;
		this.processId = processId;

		this.onLog(line => this.shipToElasticsearch(line));
	}

	private async shipToElasticsearch(line: string) {
		try {
			await this.client.index({
				index: this.index,
				document: {
					'@timestamp': new Date().toISOString(),
					message: line,
					process_id: this.processId,
					host: process.env.HOSTNAME || 'unknown',
					environment: process.env.NODE_ENV || 'development',
				},
			});
		} catch (e) {
			console.error('Failed to ship log to Elasticsearch:', e);
		}
	}
}

const dbLogger = new ElasticsearchLogger(
	1000,
	200,
	'http://localhost:9200',
	'ovrseer-logs',
	'database',
);

dbLogger.addFlag('errors', {
	pattern: /error|exception|fatal/i,
	color: 'red',
	targetCount: 0,
});

const db = new ProcessUnit(
	'node',
	['db-server.js'],
	[{logPattern: /listening/, timeout: 5000}],
	dbLogger,
);
```

### 5. PagerDuty Incident Creation

Automatically create PagerDuty incidents when critical processes crash repeatedly.

```ts
import fetch from 'node-fetch';
import {CrashReporter} from '@ovrseer/core';
import type {CrashReport} from '@ovrseer/core';

class PagerDutyCrashReporter extends CrashReporter {
	private integrationKey: string;
	private severityThreshold: number;

	constructor(
		reportsDir: string,
		integrationKey: string,
		severityThreshold: number = 2,
	) {
		super(reportsDir);
		this.integrationKey = integrationKey;
		this.severityThreshold = severityThreshold;
	}

	async saveReport(report: CrashReport): Promise<void> {
		await super.saveReport(report);

		if ((report.retryCount || 0) >= this.severityThreshold) {
			await this.createIncident(report);
		}
	}

	private async createIncident(report: CrashReport) {
		try {
			await fetch('https://events.pagerduty.com/v2/enqueue', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					routing_key: this.integrationKey,
					event_action: 'trigger',
					dedup_key: `ovrseer-${report.processId}-${report.timestamp}`,
					payload: {
						summary: `Process ${report.processId} has crashed ${report.retryCount} times`,
						severity: 'critical',
						source: 'ovrseer',
						component: report.processId,
						group: report.processType,
						class: report.type,
						custom_details: {
							error_message: report.errorMessage,
							process_status: report.status,
							retry_count: report.retryCount,
							recent_logs: report.logs.split('\n').slice(-20).join('\n'),
						},
					},
				}),
			});
		} catch (e) {
			console.error('Failed to create PagerDuty incident:', e);
		}
	}
}

const manager = new Ovrseer({
	crashReporter: new PagerDutyCrashReporter(
		'./crash-reports',
		process.env.PAGERDUTY_INTEGRATION_KEY!,
		2,
	),
	retries: 5,
});
```

### 6. Prometheus Metrics Exporter

Expose process health metrics for Prometheus scraping.

```ts
import express from 'express';
import {Ovrseer, ProcessUnit, ProcessLogger} from '@ovrseer/core';
import {register, Counter, Gauge} from 'prom-client';

const processCrashCounter = new Counter({
	name: 'ovrseer_process_crashes_total',
	help: 'Total number of process crashes',
	labelNames: ['process_id', 'process_type', 'crash_type'],
});

const processStatusGauge = new Gauge({
	name: 'ovrseer_process_status',
	help: 'Current process status (1=running, 0=stopped)',
	labelNames: ['process_id', 'process_type'],
});

const processFlagMatchCounter = new Counter({
	name: 'ovrseer_flag_matches_total',
	help: 'Total number of flag matches',
	labelNames: ['process_id', 'flag_name'],
});

const manager = new Ovrseer();

manager.on('process:crashed', data => {
	processCrashCounter.inc({
		process_id: data.id,
		process_type: data.type,
		crash_type: 'crash',
	});
});

manager.on('process:started', data => {
	processStatusGauge.set(
		{
			process_id: data.id,
			process_type: data.type,
		},
		1,
	);
});

manager.on('process:stopped', data => {
	processStatusGauge.set(
		{
			process_id: data.id,
			process_type: data.type,
		},
		0,
	);
});

const dbLogger = new ProcessLogger(1000, 100);
dbLogger.addFlag('errors', {pattern: /error/i, color: 'red'});

dbLogger.onFlagMatch((name, match) => {
	processFlagMatchCounter.inc({
		process_id: 'database',
		flag_name: name,
	});
});

const app = express();

app.get('/metrics', async (req, res) => {
	res.set('Content-Type', register.contentType);
	res.end(await register.metrics());
});

app.listen(9090, () => {
	console.log('Prometheus metrics available at http://localhost:9090/metrics');
});

manager.start();
```

### 7. Custom Structured Logger (JSON)

Output structured JSON logs for ingestion by log aggregation systems.

```ts
import {ProcessLogger} from '@ovrseer/core';
import fs from 'fs';

class StructuredLogger extends ProcessLogger {
	private logFile: fs.WriteStream;
	private processId: string;

	constructor(
		maxBufferSize: number,
		maxLogSize: number,
		logFile: string,
		processId: string,
	) {
		super(maxBufferSize, maxLogSize);
		this.logFile = fs.createWriteStream(logFile, {flags: 'a'});
		this.processId = processId;

		this.onLog(line => this.writeStructuredLog(line));
		this.onFlagMatch((name, match) => this.writeFlagMatch(name, match));
	}

	private writeStructuredLog(line: string) {
		const logEntry = {
			timestamp: new Date().toISOString(),
			process_id: this.processId,
			level: this.inferLogLevel(line),
			message: line,
			host: process.env.HOSTNAME || 'unknown',
			environment: process.env.NODE_ENV || 'development',
		};

		this.logFile.write(JSON.stringify(logEntry) + '\n');
	}

	private writeFlagMatch(name: string, match: any) {
		const flagEntry = {
			timestamp: new Date().toISOString(),
			event_type: 'flag_match',
			process_id: this.processId,
			flag_name: name,
			match_index: match.index,
			matched_line: match.line,
		};

		this.logFile.write(JSON.stringify(flagEntry) + '\n');
	}

	private inferLogLevel(line: string): string {
		if (/error|exception|fatal/i.test(line)) return 'ERROR';
		if (/warn|warning/i.test(line)) return 'WARN';
		if (/info/i.test(line)) return 'INFO';
		if (/debug/i.test(line)) return 'DEBUG';
		return 'INFO';
	}
}

const logger = new StructuredLogger(
	1000,
	200,
	'./logs/database.jsonl',
	'database',
);

logger.addFlag('slow-queries', {
	pattern: /query took (\d+)ms/,
	color: 'yellow',
	targetCount: 0,
});

const db = new ProcessUnit(
	'node',
	['db-server.js'],
	[{logPattern: /listening/, timeout: 5000}],
	logger,
);
```

### 8. Multi-Backend Crash Reporter

Combine multiple crash reporting backends (local file, Sentry, Slack) for redundancy.

```ts
import type {
	CrashReporterI,
	CrashReport,
	ProcessUnitI,
	ReportType,
} from '@ovrseer/core';
import {CrashReporter} from '@ovrseer/core';

class MultiBackendCrashReporter implements CrashReporterI {
	private backends: CrashReporterI[];

	constructor(backends: CrashReporterI[]) {
		this.backends = backends;
	}

	generateReport(
		processId: string,
		process: ProcessUnitI,
		type: ReportType,
		context?: Record<string, any>,
	): CrashReport {
		return this.backends[0].generateReport(processId, process, type, context);
	}

	async saveReport(report: CrashReport): Promise<void> {
		await Promise.allSettled(
			this.backends.map(backend => backend.saveReport(report)),
		);
	}

	getReports(): CrashReport[] {
		return this.backends[0].getReports();
	}

	clearReports(): void {
		this.backends.forEach(backend => backend.clearReports());
	}

	getReportsDir(): string {
		return this.backends.map(b => b.getReportsDir()).join(', ');
	}
}

const manager = new Ovrseer({
	crashReporter: new MultiBackendCrashReporter([
		new CrashReporter('./crash-reports'),
		new SentryCrashReporter(process.env.SENTRY_DSN!, 'production'),
		new SlackCrashReporter(process.env.SLACK_TOKEN!, '#alerts'),
	]),
	retries: 3,
});
```

## Integration Best Practices

### 1. Defensive Implementation

Always handle errors gracefully in extension code to avoid disrupting process supervision:

```ts
async saveReport(report: CrashReport): Promise<void> {
	try {
		await this.sendToExternalService(report);
	} catch (e) {
		console.error('Failed to send crash report (non-fatal):', e);
	}
}
```

### 2. Batching & Rate Limiting

For high-frequency events like logs, implement batching to reduce network overhead:

```ts
class BatchedLogger extends ProcessLogger {
	private batch: string[] = [];
	private batchSize = 50;

	constructor(maxBufferSize: number, maxLogSize: number, endpoint: string) {
		super(maxBufferSize, maxLogSize);

		this.onLog(line => {
			this.batch.push(line);
			if (this.batch.length >= this.batchSize) {
				this.flush();
			}
		});

		setInterval(() => this.flush(), 5000);
	}

	private async flush() {
		if (this.batch.length === 0) return;
		const lines = [...this.batch];
		this.batch = [];

		try {
			await fetch(this.endpoint, {
				method: 'POST',
				body: JSON.stringify({logs: lines}),
			});
		} catch (e) {
			console.error('Failed to flush logs:', e);
		}
	}
}
```

### 3. Contextual Enrichment

Add environment and deployment context to all reports:

```ts
generateReport(
	processId: string,
	process: ProcessUnitI,
	type: ReportType,
	context?: Record<string, any>
): CrashReport {
	const baseReport = super.generateReport(processId, process, type, context);

	return {
		...baseReport,
		context: {
			...baseReport.context,
			deployment_id: process.env.DEPLOYMENT_ID,
			kubernetes_pod: process.env.HOSTNAME,
			kubernetes_namespace: process.env.NAMESPACE,
			git_commit: process.env.GIT_COMMIT,
			region: process.env.AWS_REGION,
		},
	};
}
```

### 4. Sensitive Data Redaction

Redact sensitive information before sending to external services:

```ts
private redactSensitiveData(report: CrashReport): CrashReport {
	const redactedLogs = report.logs.replace(
		/(?:password|token|secret|key)=\S+/gi,
		'$1=***REDACTED***'
	);

	return {
		...report,
		logs: redactedLogs,
		context: this.redactContextKeys(report.context || {}),
	};
}

private redactContextKeys(context: Record<string, any>): Record<string, any> {
	const sensitiveKeys = ['password', 'token', 'secret', 'apiKey'];
	const redacted = {...context};

	for (const key of Object.keys(redacted)) {
		if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
			redacted[key] = '***REDACTED***';
		}
	}

	return redacted;
}
```

### 5. Flag-Driven Alerting

Use flag target counts to trigger specific alerts:

```ts
logger.addFlag('critical-errors', {
	pattern: /CRITICAL|FATAL/i,
	color: 'red',
	targetCount: 1,
});

logger.onFlagTargetReached(async (name, state) => {
	if (name === 'critical-errors') {
		await sendPagerDutyAlert({
			severity: 'critical',
			summary: `Critical error detected in ${processId}`,
			details: state.matches[0].contextWindow.join('\n'),
		});
	}
});
```

### 6. Health Check Integration

Expose process health for load balancers and orchestrators:

```ts
import express from 'express';

const app = express();
const manager = new Ovrseer();

let isHealthy = true;

manager.on('dependency:failed', () => {
	isHealthy = false;
});

manager.on('manager:started', () => {
	isHealthy = true;
});

app.get('/health', (req, res) => {
	if (isHealthy) {
		res.status(200).json({status: 'healthy'});
	} else {
		res.status(503).json({status: 'unhealthy', reason: 'dependency_failed'});
	}
});

app.get('/ready', (req, res) => {
	const allReady = Array.from(manager.getAllProcesses().values()).every(
		p => p.getStatus() === 'running',
	);

	if (allReady) {
		res.status(200).json({status: 'ready'});
	} else {
		res.status(503).json({status: 'not_ready'});
	}
});

app.listen(8080);
```

## Advanced Patterns

### Circuit Breaker for External Services

Prevent cascading failures when external monitoring services are down:

```ts
class CircuitBreakerLogger extends ProcessLogger {
	private failureCount = 0;
	private failureThreshold = 5;
	private resetTimeout = 60000;
	private circuitOpen = false;

	private async shipLog(line: string) {
		if (this.circuitOpen) {
			return;
		}

		try {
			await fetch(this.endpoint, {method: 'POST', body: line});
			this.failureCount = 0;
		} catch (e) {
			this.failureCount++;

			if (this.failureCount >= this.failureThreshold) {
				this.circuitOpen = true;
				console.warn('Circuit breaker opened for log shipping');

				setTimeout(() => {
					this.circuitOpen = false;
					this.failureCount = 0;
					console.info('Circuit breaker reset');
				}, this.resetTimeout);
			}
		}
	}
}
```

### Dynamic Flag Configuration from Remote Config

Load flag configurations from a remote service for runtime updates:

```ts
class RemoteConfigLogger extends ProcessLogger {
	private configUrl: string;

	constructor(maxBufferSize: number, maxLogSize: number, configUrl: string) {
		super(maxBufferSize, maxLogSize);
		this.configUrl = configUrl;

		this.loadRemoteFlags();
		setInterval(() => this.loadRemoteFlags(), 60000);
	}

	private async loadRemoteFlags() {
		try {
			const response = await fetch(this.configUrl);
			const config = await response.json();

			for (const [name, flagConfig] of Object.entries(config.flags)) {
				this.addFlag(name, flagConfig as any);
			}
		} catch (e) {
			console.error('Failed to load remote flag config:', e);
		}
	}
}
```

## Troubleshooting

### Extension errors crashing the manager

**Problem:** Exceptions in extension code cause the manager to fail.

**Solution:** Always wrap extension logic in try/catch blocks and log errors instead of throwing.

### High memory usage with log shipping

**Problem:** Log shipping accumulates memory over time.

**Solution:** Implement batching with fixed-size buffers and periodic flushing.

### Alerts not firing for crashes

**Problem:** Crash reports aren't triggering external alerts.

**Solution:** Ensure `saveReport` is async and awaits network calls. Check for network connectivity and API credentials.

### Duplicate crash reports in Sentry

**Problem:** Same crash appears multiple times in error tracking.

**Solution:** Use unique `dedup_key` based on process ID and timestamp, or implement in-memory deduplication with a short TTL.
