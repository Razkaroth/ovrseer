import type {
	CrashReporterI,
	CrashReport,
	ProcessUnitI,
	ReportType,
} from './types.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ProcessUnit } from './process-unit';
import { ProcessLogger } from './logger.js';
import { cwd } from 'process';
export class CrashReporter implements CrashReporterI {
	private reports: CrashReport[] = [];
	private reportsDir: string;

	constructor(reportsDir?: string) {
		this.reportsDir =
			reportsDir || join(tmpdir(), 'ovrseer', 'crash-reports');
	}

	generateReport(
		processId: string,
		process: ProcessUnitI,
		type: ReportType,
		context?: Record<string, any>,
	): CrashReport {
		let logs = '';
		try {
			logs = process.logger.getLogs();
		} catch {
			// Logger may be empty or out of bounds
			logs = 'No logs available';
		}
		const status = process.getStatus();

		const report: CrashReport = {
			timestamp: new Date().toISOString(),
			processId,
			processType: this.inferProcessType(context),
			type,
			errorMessage:
				context?.errorMessage || context?.error?.message || `Process ${type}`,
			errorStack: context?.error?.stack,
			logs,
			status,
			retryCount: context?.retryCount,
			context,
		};

		return report;
	}

	async saveReport(report: CrashReport): Promise<void> {
		this.reports.push(report);

		try {
			await mkdir(this.reportsDir, { recursive: true });

			const filename = `${report.timestamp.replace(/[:.]/g, '-')}_${report.processId
				}.json`;
			const filepath = join(this.reportsDir, filename);

			await writeFile(filepath, JSON.stringify(report, null, 2), 'utf-8');
		} catch (error) {
			// Fail gracefully - report is still in memory
		}
	}

	getReports(): CrashReport[] {
		return [...this.reports];
	}

	clearReports(): void {
		this.reports = [];
	}

	getReportsDir(): string {
		return this.reportsDir;
	}

	private inferProcessType(
		context?: Record<string, any>,
	): 'dependency' | 'main' | 'cleanup' {
		if (context?.processType) {
			return context.processType;
		}
		return 'main';
	}
}

export class NoopCrashReporter implements CrashReporterI {

	generateReport(
		processId: string,
		process: ProcessUnitI,
		type: ReportType,
		context?: Record<string, any>,
	): CrashReport {
		return {
			timestamp: new Date().toISOString(),
			processId,
			processType: this.inferProcessType(context),
			type,
			errorMessage: 'No error message available (NoopCrashReporter)',
			errorStack: 'No error stack available (NoopCrashReporter)',
			logs: 'No logs available (NoopCrashReporter)',
			status: 'crashed',
			retryCount: 0,
			context,
		};
	}

	saveReport(report: CrashReport): Promise<void> {
		return Promise.resolve();
	}

	clearReports(): void {
		/* noop */
	}

	getReports(): CrashReport[] {
		return [];
	}

	getReportsDir(): string {
		return '';
	}

	private inferProcessType(
		context?: Record<string, any>,
	): 'dependency' | 'main' | 'cleanup' {
		if (context?.processType) {
			return context.processType;
		}
		return 'main';
	}
};
