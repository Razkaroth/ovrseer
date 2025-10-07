import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrashReporter, NoopCrashReporter } from '../crash-reporter';
import { ProcessLogger } from '../logger';
import { fakeProcessUnit } from './mocks';
import type { CrashReport } from '../types';
import { join } from 'path';
import { tmpdir } from 'os';

const { mockWriteFile, mockMkdir } = vi.hoisted(() => {
	return {
		mockWriteFile: vi.fn(),
		mockMkdir: vi.fn(),
	};
});

vi.mock('fs/promises', () => ({
	default: {
		writeFile: mockWriteFile,
		mkdir: mockMkdir,
	},
	writeFile: mockWriteFile,
	mkdir: mockMkdir,
}));

describe('CrashReporter', () => {
	let crashReporter: CrashReporter;
	let mockLogger: ProcessLogger;

	beforeEach(() => {
		crashReporter = new CrashReporter();
		mockLogger = new ProcessLogger(10, 5);
		vi.clearAllMocks();
		mockWriteFile.mockResolvedValue(undefined);
		mockMkdir.mockResolvedValue(undefined);
	});

	it('initially has no reports', () => {
		expect(crashReporter.getReports()).toEqual([]);
	});

	it('uses default tmp directory when no reportsDir provided', () => {
		const defaultDir = join(tmpdir(), 'ovrseer', 'crash-reports');
		expect(crashReporter.getReportsDir()).toBe(defaultDir);
	});

	it('uses custom reportsDir when provided', () => {
		const customDir = '/custom/path/reports';
		const customReporter = new CrashReporter(customDir);
		expect(customReporter.getReportsDir()).toBe(customDir);
	});

	describe('generateReport()', () => {
		it('generates a report with required fields', () => {
			mockLogger.onError(() => { }); // Add error listener to prevent unhandled error
			mockLogger.addChunk('log1');
			mockLogger.addChunk('error1', true);
			const process = fakeProcessUnit({
				logger: mockLogger,
				getStatus: vi.fn(() => 'crashed' as any),
			});

			const report = crashReporter.generateReport('pid', process, 'crash');

			expect(report.processId).toBe('pid');
			expect(report.type).toBe('crash');
			expect(report.logs).toEqual(expect.any(String));
			expect(report.status).toBe('crashed');
			expect(report.timestamp).toBeDefined();
		});

		it('includes context and retryCount when provided', () => {
			const process = fakeProcessUnit({ logger: mockLogger });
			const report = crashReporter.generateReport(
				'pid',
				process,
				'maxRetriesExceeded',
				{
					retryCount: 3,
				},
			);
			expect(report.retryCount).toBe(3);
			expect(report.context).toBeDefined();
		});
	});

	describe('saveReport()', () => {
		it('saves report in memory and attempts to persist', async () => {
			const report: CrashReport = {
				timestamp: new Date().toISOString(),
				processId: 'p',
				processType: 'main',
				type: 'crash',
				errorMessage: 'err',
				logs: 'logs',
				status: 'crashed',
			};

			await crashReporter.saveReport(report);
			const reports = crashReporter.getReports();
			expect(reports).toContain(report);
			expect(mockMkdir).toHaveBeenCalled();
			expect(mockWriteFile).toHaveBeenCalled();
		});

		it('handles write failures gracefully', async () => {
			mockWriteFile.mockRejectedValueOnce(new Error('disk full'));

			const report: CrashReport = {
				timestamp: new Date().toISOString(),
				processId: 'p',
				processType: 'main',
				type: 'crash',
				errorMessage: 'err',
				logs: 'logs',
				status: 'crashed',
			};

			await expect(crashReporter.saveReport(report)).resolves.not.toThrow();
			expect(crashReporter.getReports()).toContain(report);
		});
	});

	describe('getReports() and clearReports()', () => {
		it('returns a copy of reports and clearReports empties', async () => {
			const report: CrashReport = {
				timestamp: new Date().toISOString(),
				processId: 'p',
				processType: 'main',
				type: 'crash',
				errorMessage: 'err',
				logs: 'logs',
				status: 'crashed',
			};
			await crashReporter.saveReport(report);
			const list = crashReporter.getReports();
			expect(list).toHaveLength(1);
			list.push({} as any);
			expect(crashReporter.getReports()).toHaveLength(1);

			crashReporter.clearReports();
			expect(crashReporter.getReports()).toHaveLength(0);
		});
	});
});

describe('NoopCrashReporter', () => {
	let crashReporter: NoopCrashReporter;
	let mockLogger: ProcessLogger;

	beforeEach(() => {
		crashReporter = new NoopCrashReporter();
		mockLogger = new ProcessLogger(10, 5);
		vi.clearAllMocks();
	});

	it('Can be instantiated', () => {
		expect(crashReporter).toBeInstanceOf(NoopCrashReporter);
	});

	it('generates a Noop report', () => {
		mockLogger.onError(() => { }); // Add error listener to prevent unhandled error
		mockLogger.addChunk('log1');
		mockLogger.addChunk('error1', true);
		const process = fakeProcessUnit({
			logger: mockLogger,
			getStatus: vi.fn(() => 'crashed' as any),
		});

		const report = crashReporter.generateReport('pid', process, 'crash', {});

		expect(report.processId).toBe('pid');
		expect(report.processType).toBe('main');
		expect(report.type).toBe('crash');
		expect(report.status).toBe('crashed');
		expect(report.timestamp).toBeDefined();
		expect(report.context).toEqual({});
		expect(report.retryCount).toBe(0);
		expect(report.errorMessage).toBe('No error message available (NoopCrashReporter)');
		expect(report.errorStack).toBe('No error stack available (NoopCrashReporter)');
		expect(report.logs).toEqual("No logs available (NoopCrashReporter)");
	})
});
