import {ProcessLogger} from '../logger';
import type {ReadyCheck} from '../types';

vi.mock('child_process', async importOriginal => {
	const actual = await importOriginal();
	return {
		...(actual as any),
		spawn: vi.fn(),
	};
});

import {spawn} from 'child_process';
import EventEmitter from 'events';
import {ProcessUnit} from '../process-unit';

const mockSpawn = vi.mocked(spawn);

import {
	makeStubProc,
	trackedCreateProcessUnit,
} from './mocks';

describe('ProcessUnit - stdin functionality', () => {
	let mockLogger: ProcessLogger;
	let stubStdout: EventEmitter;
	let stubStderr: EventEmitter;
	let procEmitter: EventEmitter;
	let stubProc: any;
	let createdProcesses: ProcessUnit[] = [];

	const createProcessUnit = (
		command: string,
		args: string[],
		checks: ReadyCheck[],
		logger?: ProcessLogger,
	) =>
		trackedCreateProcessUnit(createdProcesses, command, args, checks, logger);

	beforeEach(() => {
		mockLogger = new ProcessLogger(10, 5);

		stubStdout = new EventEmitter();
		stubStderr = new EventEmitter();
		procEmitter = new EventEmitter();
		stubProc = Object.assign(procEmitter, {
			stdout: stubStdout,
			stderr: stubStderr,
			kill: vi.fn(() => true),
			pid: 1234,
		});

		mockSpawn.mockReturnValue(stubProc as any);
	});

	afterEach(async () => {
		await new Promise(resolve => setImmediate(resolve));

		createdProcesses.forEach(process => {
			try {
				process.cleanup();
			} catch (_e) {
				// Ignore cleanup errors
			}
		});
		createdProcesses = [];

		vi.clearAllMocks();
		vi.clearAllTimers();
		if (vi.isFakeTimers()) {
			vi.useRealTimers();
		}
	});

	describe('sendStdin() - Edge Cases', () => {
		it('should throw if process has not been started', () => {
			const process = createProcessUnit('cat', [], [], mockLogger);

			expect(() => process.sendStdin('test')).toThrow(
				'Process stdin is not available',
			);
		});

		it('should throw if attempting to send to stopped process', async () => {
			const process = createProcessUnit('cat', [], [], mockLogger);
			const mockStdin = {write: vi.fn()};
			stubProc.stdin = mockStdin;

			process.start();
			await process.stop();

			expect(() => process.sendStdin('test')).toThrow(
				'Cannot send stdin to a process that is not running',
			);
		});

		it('should throw with descriptive error if write fails', () => {
			const process = createProcessUnit('cat', [], [], mockLogger);
			const mockStdin = {
				write: vi.fn(() => {
					throw new Error('Write failed: pipe broken');
				}),
			};
			stubProc.stdin = mockStdin;

			process.start();

			expect(() => process.sendStdin('test')).toThrow(
				'Failed to write to stdin: Write failed: pipe broken',
			);
		});

		it('should handle empty string input', () => {
			const process = createProcessUnit('cat', [], [], mockLogger);
			const mockStdin = {write: vi.fn()};
			stubProc.stdin = mockStdin;

			process.start();
			process.sendStdin('');

			expect(mockStdin.write).toHaveBeenCalledWith('\n');
		});

		it('should handle multiline input', () => {
			const process = createProcessUnit('cat', [], [], mockLogger);
			const mockStdin = {write: vi.fn()};
			stubProc.stdin = mockStdin;

			process.start();
			process.sendStdin('line1\nline2\nline3');

			expect(mockStdin.write).toHaveBeenCalledWith('line1\nline2\nline3\n');
		});

		it('should handle special characters in input', () => {
			const process = createProcessUnit('cat', [], [], mockLogger);
			const mockStdin = {write: vi.fn()};
			stubProc.stdin = mockStdin;

			process.start();
			const specialInput = '\!@#$%^&*(){}[]|\\:;"\'<>,.?/~`';
			process.sendStdin(specialInput);

			expect(mockStdin.write).toHaveBeenCalledWith(specialInput + '\n');
		});

		it('should handle unicode characters', () => {
			const process = createProcessUnit('cat', [], [], mockLogger);
			const mockStdin = {write: vi.fn()};
			stubProc.stdin = mockStdin;

			process.start();
			const unicodeInput = '你好世界 🌍 émojis';
			process.sendStdin(unicodeInput);

			expect(mockStdin.write).toHaveBeenCalledWith(unicodeInput + '\n');
		});

		it('should properly log both secret and non-secret inputs in sequence', () => {
			const process = createProcessUnit('cat', [], [], mockLogger);
			const mockStdin = {write: vi.fn()};
			stubProc.stdin = mockStdin;

			process.start();
			process.sendStdin('username', false);
			process.sendStdin('password', true);
			process.sendStdin('confirm', false);

			const typedLogs = mockLogger.getTypedLogs();
			expect(typedLogs).toHaveLength(3);
			expect(typedLogs[0].type).toBe('UserInput');
			expect(typedLogs[0].content).toBe('username');
			expect(typedLogs[1].type).toBe('UserInputSecret');
			expect(typedLogs[1].content).toBe('password');
			expect(typedLogs[2].type).toBe('UserInput');
			expect(typedLogs[2].content).toBe('confirm');
		});

		it('should handle rapid sequential stdin writes', () => {
			const process = createProcessUnit('cat', [], [], mockLogger);
			const mockStdin = {write: vi.fn()};
			stubProc.stdin = mockStdin;

			process.start();

			for (let i = 0; i < 100; i++) {
				process.sendStdin(`input${i}`);
			}

			expect(mockStdin.write).toHaveBeenCalledTimes(100);
		});

		it('should throw if stdin is undefined', () => {
			const process = createProcessUnit('cat', [], [], mockLogger);
			stubProc.stdin = undefined;

			process.start();

			expect(() => process.sendStdin('test')).toThrow(
				'Process stdin is not available',
			);
		});
	});

	describe('spawn configuration', () => {
		it('should spawn with stdin pipe enabled', () => {
			const process = createProcessUnit('echo', ['hello'], [], mockLogger);

			process.start();

			expect(mockSpawn).toHaveBeenCalledWith('echo', ['hello'], {
				stdio: ['pipe', 'pipe', 'pipe'],
			});
		});

		it('should allow writing to stdin after spawn', () => {
			const process = createProcessUnit('cat', [], [], mockLogger);
			const mockStdin = {write: vi.fn()};
			stubProc.stdin = mockStdin;

			process.start();

			expect(stubProc.stdin).toBeDefined();
			expect(() => process.sendStdin('test')).not.toThrow();
		});
	});
});