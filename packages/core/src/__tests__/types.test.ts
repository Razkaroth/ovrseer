import {describe, it, expect} from 'vitest';
import type {
	ProcessStatus,
	ProcessUnitI,
	StopSignal,
	FlagColor,
	Flag,
	FlagMatch,
	FlagState,
	ReadyCheck,
	ProcessManagerEvents,
	OvrseerI,
	ReportType,
	CrashReport,
	TUIProcessType,
	ProcessMap,
	TUIState,
} from '../types.js';

describe('Core Types', () => {
	describe('ProcessStatus Type', () => {
		it('should allow all valid status values', () => {
			const statuses: ProcessStatus[] = [
				'created',
				'running',
				'ready',
				'stopping',
				'stopped',
				'completed',
				'failedByReadyCheck',
				'crashed',
				'couldNotSpawn',
			];

			statuses.forEach(status => {
				expect(status).toBeDefined();
				expect(typeof status).toBe('string');
			});
		});

		it('should be usable in type guards', () => {
			const checkStatus = (status: string): status is ProcessStatus => {
				return [
					'created',
					'running',
					'ready',
					'stopping',
					'stopped',
					'completed',
					'failedByReadyCheck',
					'crashed',
					'couldNotSpawn',
				].includes(status);
			};

			expect(checkStatus('running')).toBe(true);
			expect(checkStatus('invalid')).toBe(false);
		});
	});

	describe('StopSignal Type', () => {
		it('should allow valid signal values', () => {
			const signals: StopSignal[] = ['SIGINT', 'SIGTERM', 'SIGKILL'];

			signals.forEach(signal => {
				expect(signal).toBeDefined();
				expect(typeof signal).toBe('string');
			});
		});
	});

	describe('FlagColor Type', () => {
		it('should allow all valid color values', () => {
			const colors: FlagColor[] = [
				'green',
				'blue',
				'red',
				'yellow',
				'teal',
				'purple',
				'orange',
			];

			colors.forEach(color => {
				expect(color).toBeDefined();
				expect(typeof color).toBe('string');
			});
		});
	});

	describe('Flag Type', () => {
		it('should accept minimal flag configuration', () => {
			const flag: Flag = {
				pattern: /test/,
				color: 'red',
			};

			expect(flag.pattern).toBeDefined();
			expect(flag.color).toBe('red');
		});

		it('should accept full flag configuration with optional fields', () => {
			const flag: Flag = {
				pattern: 'test string',
				color: 'blue',
				targetCount: 5,
				contextWindowSize: 3,
			};

			expect(flag.pattern).toBe('test string');
			expect(flag.color).toBe('blue');
			expect(flag.targetCount).toBe(5);
			expect(flag.contextWindowSize).toBe(3);
		});

		it('should accept RegExp pattern', () => {
			const flag: Flag = {
				pattern: /error/i,
				color: 'red',
			};

			expect(flag.pattern).toBeInstanceOf(RegExp);
		});

		it('should accept string pattern', () => {
			const flag: Flag = {
				pattern: 'ERROR',
				color: 'red',
			};

			expect(typeof flag.pattern).toBe('string');
		});

		it('should accept zero targetCount', () => {
			const flag: Flag = {
				pattern: /test/,
				color: 'green',
				targetCount: 0,
			};

			expect(flag.targetCount).toBe(0);
		});

		it('should accept large targetCount', () => {
			const flag: Flag = {
				pattern: /test/,
				color: 'green',
				targetCount: 1000000,
			};

			expect(flag.targetCount).toBe(1000000);
		});
	});

	describe('FlagMatch Type', () => {
		it('should have required properties', () => {
			const match: FlagMatch = {
				logIndex: 42,
				matchedText: 'ERROR occurred',
				timestamp: Date.now(),
				contextWindowSize: 5,
			};

			expect(match.logIndex).toBe(42);
			expect(match.matchedText).toBe('ERROR occurred');
			expect(typeof match.timestamp).toBe('number');
			expect(match.contextWindowSize).toBe(5);
		});

		it('should accept zero logIndex', () => {
			const match: FlagMatch = {
				logIndex: 0,
				matchedText: 'test',
				timestamp: Date.now(),
				contextWindowSize: 1,
			};

			expect(match.logIndex).toBe(0);
		});

		it('should accept empty matched text', () => {
			const match: FlagMatch = {
				logIndex: 0,
				matchedText: '',
				timestamp: Date.now(),
				contextWindowSize: 0,
			};

			expect(match.matchedText).toBe('');
		});

		it('should accept unicode in matched text', () => {
			const match: FlagMatch = {
				logIndex: 0,
				matchedText: '🔥 Error 🔥',
				timestamp: Date.now(),
				contextWindowSize: 1,
			};

			expect(match.matchedText).toContain('🔥');
		});
	});

	describe('FlagState Type', () => {
		it('should contain flag, count, and matches', () => {
			const state: FlagState = {
				flag: {
					pattern: /ERROR/,
					color: 'red',
				},
				count: 3,
				matches: [
					{
						logIndex: 0,
						matchedText: 'ERROR 1',
						timestamp: Date.now(),
						contextWindowSize: 2,
					},
					{
						logIndex: 5,
						matchedText: 'ERROR 2',
						timestamp: Date.now(),
						contextWindowSize: 2,
					},
				],
			};

			expect(state.flag).toBeDefined();
			expect(state.count).toBe(3);
			expect(state.matches).toHaveLength(2);
		});

		it('should accept zero count', () => {
			const state: FlagState = {
				flag: {pattern: /test/, color: 'green'},
				count: 0,
				matches: [],
			};

			expect(state.count).toBe(0);
			expect(state.matches).toHaveLength(0);
		});

		it('should accept large count', () => {
			const state: FlagState = {
				flag: {pattern: /test/, color: 'green'},
				count: 999999,
				matches: [],
			};

			expect(state.count).toBe(999999);
		});
	});

	describe('ReadyCheck Type', () => {
		it('should have required properties', () => {
			const check: ReadyCheck = {
				logPattern: /ready/i,
				timeout: 5000,
			};

			expect(check.logPattern).toBeDefined();
			expect(check.timeout).toBe(5000);
		});

		it('should accept passIfNotFound option', () => {
			const check: ReadyCheck = {
				logPattern: /ready/,
				timeout: 1000,
				passIfNotFound: true,
			};

			expect(check.passIfNotFound).toBe(true);
		});

		it('should accept string pattern', () => {
			const check: ReadyCheck = {
				logPattern: 'ready',
				timeout: 1000,
			};

			expect(typeof check.logPattern).toBe('string');
		});

		it('should accept zero timeout', () => {
			const check: ReadyCheck = {
				logPattern: /ready/,
				timeout: 0,
			};

			expect(check.timeout).toBe(0);
		});

		it('should accept very large timeout', () => {
			const check: ReadyCheck = {
				logPattern: /ready/,
				timeout: 3600000,
			};

			expect(check.timeout).toBe(3600000);
		});
	});

	describe('TUIProcessType Type', () => {
		it('should allow all valid process type values', () => {
			const types: TUIProcessType[] = ['dependency', 'main', 'cleanup'];

			types.forEach(type => {
				expect(type).toBeDefined();
				expect(typeof type).toBe('string');
			});
		});
	});

	describe('ReportType Type', () => {
		it('should allow all valid report type values', () => {
			const types: ReportType[] = [
				'crash',
				'cleanupFailed',
				'dependencyFailed',
				'maxRetriesExceeded',
			];

			types.forEach(type => {
				expect(type).toBeDefined();
				expect(typeof type).toBe('string');
			});
		});
	});

	describe('CrashReport Type', () => {
		it('should have required properties', () => {
			const report: CrashReport = {
				timestamp: new Date().toISOString(),
				processId: 'test-process',
				processType: 'main',
				type: 'crash',
				errorMessage: 'Process crashed',
				logs: 'log line 1\nlog line 2',
				status: 'crashed',
			};

			expect(report.timestamp).toBeDefined();
			expect(report.processId).toBe('test-process');
			expect(report.processType).toBe('main');
			expect(report.type).toBe('crash');
			expect(report.errorMessage).toBe('Process crashed');
			expect(report.logs).toBeDefined();
			expect(report.status).toBe('crashed');
		});

		it('should accept optional errorStack', () => {
			const report: CrashReport = {
				timestamp: new Date().toISOString(),
				processId: 'test',
				processType: 'main',
				type: 'crash',
				errorMessage: 'Error',
				errorStack: 'Error: Test\n  at Object.<anonymous>',
				logs: '',
				status: 'crashed',
			};

			expect(report.errorStack).toBeDefined();
		});

		it('should accept optional retryCount', () => {
			const report: CrashReport = {
				timestamp: new Date().toISOString(),
				processId: 'test',
				processType: 'main',
				type: 'maxRetriesExceeded',
				errorMessage: 'Max retries exceeded',
				logs: '',
				status: 'crashed',
				retryCount: 3,
			};

			expect(report.retryCount).toBe(3);
		});

		it('should accept optional context', () => {
			const report: CrashReport = {
				timestamp: new Date().toISOString(),
				processId: 'test',
				processType: 'dependency',
				type: 'dependencyFailed',
				errorMessage: 'Dependency failed',
				logs: '',
				status: 'crashed',
				context: {
					additionalInfo: 'Custom context',
					metadata: {foo: 'bar'},
				},
			};

			expect(report.context).toBeDefined();
			expect(report.context?.additionalInfo).toBe('Custom context');
		});

		it('should accept empty logs', () => {
			const report: CrashReport = {
				timestamp: new Date().toISOString(),
				processId: 'test',
				processType: 'main',
				type: 'crash',
				errorMessage: 'Error',
				logs: '',
				status: 'crashed',
			};

			expect(report.logs).toBe('');
		});

		it('should accept very long logs', () => {
			const longLogs = 'line\n'.repeat(10000);
			const report: CrashReport = {
				timestamp: new Date().toISOString(),
				processId: 'test',
				processType: 'main',
				type: 'crash',
				errorMessage: 'Error',
				logs: longLogs,
				status: 'crashed',
			};

			expect(report.logs.length).toBeGreaterThan(40000);
		});
	});

	describe('ProcessManagerEvents Type', () => {
		it('should define manager:started event', () => {
			const event: ProcessManagerEvents['manager:started'] = {
				timestamp: Date.now(),
			};

			expect(event.timestamp).toBeDefined();
		});

		it('should define manager:stopping event', () => {
			const event: ProcessManagerEvents['manager:stopping'] = {
				timestamp: Date.now(),
			};

			expect(event.timestamp).toBeDefined();
		});

		it('should define manager:stopped event', () => {
			const event: ProcessManagerEvents['manager:stopped'] = {
				timestamp: Date.now(),
			};

			expect(event.timestamp).toBeDefined();
		});

		it('should define process:added event', () => {
			const event: ProcessManagerEvents['process:added'] = {
				id: 'test-process',
				type: 'main',
				timestamp: Date.now(),
			};

			expect(event.id).toBe('test-process');
			expect(event.type).toBe('main');
		});

		it('should define process:stopped event', () => {
			const event: ProcessManagerEvents['process:stopped'] = {
				id: 'test-process',
				type: 'main',
				code: 0,
				signal: null,
				timestamp: Date.now(),
			};

			expect(event.code).toBe(0);
			expect(event.signal).toBeNull();
		});

		it('should define process:crashed event', () => {
			const event: ProcessManagerEvents['process:crashed'] = {
				id: 'test-process',
				type: 'main',
				error: new Error('Crash'),
				retryCount: 1,
				timestamp: Date.now(),
			};

			expect(event.error).toBeInstanceOf(Error);
			expect(event.retryCount).toBe(1);
		});

		it('should define state:update event', () => {
			const event: ProcessManagerEvents['state:update'] = {
				processes: {
					dependencies: new Map(),
					main: new Map(),
					cleanup: new Map(),
				},
				timestamp: Date.now(),
			};

			expect(event.processes).toBeDefined();
			expect(event.processes.dependencies).toBeInstanceOf(Map);
		});

		it('should define process:log event', () => {
			const event: ProcessManagerEvents['process:log'] = {
				id: 'test-process',
				type: 'main',
				message: 'Log message',
				isError: false,
				timestamp: Date.now(),
			};

			expect(event.message).toBe('Log message');
			expect(event.isError).toBe(false);
		});
	});

	describe('ProcessMap Type', () => {
		it('should contain all three process type maps', () => {
			const map: ProcessMap = {
				dependencies: new Map(),
				main: new Map(),
				cleanup: new Map(),
			};

			expect(map.dependencies).toBeInstanceOf(Map);
			expect(map.main).toBeInstanceOf(Map);
			expect(map.cleanup).toBeInstanceOf(Map);
		});

		it('should allow adding entries to maps', () => {
			const map: ProcessMap = {
				dependencies: new Map(),
				main: new Map(),
				cleanup: new Map(),
			};

			const mockProcess = {} as ProcessUnitI;
			map.main.set('test', mockProcess);

			expect(map.main.get('test')).toBe(mockProcess);
		});
	});

	describe('TUIState Type', () => {
		it('should accept minimal state', () => {
			const state: TUIState = {};

			expect(state).toBeDefined();
		});

		it('should accept full state', () => {
			const state: TUIState = {
				selectedProcessId: 'test-process',
				selectedProcessType: 'main',
				showHelp: true,
				logScrollOffset: 100,
				filter: 'error',
			};

			expect(state.selectedProcessId).toBe('test-process');
			expect(state.selectedProcessType).toBe('main');
			expect(state.showHelp).toBe(true);
			expect(state.logScrollOffset).toBe(100);
			expect(state.filter).toBe('error');
		});

		it('should accept null selectedProcessId', () => {
			const state: TUIState = {
				selectedProcessId: null,
			};

			expect(state.selectedProcessId).toBeNull();
		});

		it('should accept zero logScrollOffset', () => {
			const state: TUIState = {
				logScrollOffset: 0,
			};

			expect(state.logScrollOffset).toBe(0);
		});

		it('should accept negative logScrollOffset', () => {
			const state: TUIState = {
				logScrollOffset: -10,
			};

			expect(state.logScrollOffset).toBe(-10);
		});

		it('should accept empty filter', () => {
			const state: TUIState = {
				filter: '',
			};

			expect(state.filter).toBe('');
		});
	});

	describe('Type Compatibility', () => {
		it('should allow ProcessStatus in arrays', () => {
			const statuses: ProcessStatus[] = ['running', 'stopped', 'crashed'];

			expect(statuses).toHaveLength(3);
		});

		it('should allow ProcessManagerEvents in handlers', () => {
			type EventHandler<K extends keyof ProcessManagerEvents> = (
				data: ProcessManagerEvents[K],
			) => void;

			const handler: EventHandler<'process:crashed'> = data => {
				expect(data.error).toBeInstanceOf(Error);
			};

			handler({
				id: 'test',
				type: 'main',
				error: new Error('test'),
				timestamp: Date.now(),
			});
		});

		it('should allow creating maps of processes', () => {
			const processMap: Map<string, ProcessStatus> = new Map();
			processMap.set('proc1', 'running');
			processMap.set('proc2', 'stopped');

			expect(processMap.size).toBe(2);
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty strings', () => {
			const report: CrashReport = {
				timestamp: '',
				processId: '',
				processType: 'main',
				type: 'crash',
				errorMessage: '',
				logs: '',
				status: 'crashed',
			};

			expect(report.timestamp).toBe('');
			expect(report.errorMessage).toBe('');
		});

		it('should handle very large numbers', () => {
			const match: FlagMatch = {
				logIndex: Number.MAX_SAFE_INTEGER,
				matchedText: 'test',
				timestamp: Date.now(),
				contextWindowSize: Number.MAX_SAFE_INTEGER,
			};

			expect(match.logIndex).toBe(Number.MAX_SAFE_INTEGER);
		});

		it('should handle special characters in strings', () => {
			const report: CrashReport = {
				timestamp: new Date().toISOString(),
				processId: 'test-\n\t\r',
				processType: 'main',
				type: 'crash',
				errorMessage: 'Error\nwith\nnewlines',
				logs: 'log\twith\ttabs',
				status: 'crashed',
			};

			expect(report.errorMessage).toContain('\n');
			expect(report.logs).toContain('\t');
		});

		it('should handle unicode in strings', () => {
			const match: FlagMatch = {
				logIndex: 0,
				matchedText: '🎉 Success! 你好',
				timestamp: Date.now(),
				contextWindowSize: 1,
			};

			expect(match.matchedText).toContain('🎉');
			expect(match.matchedText).toContain('你好');
		});
	});
});
