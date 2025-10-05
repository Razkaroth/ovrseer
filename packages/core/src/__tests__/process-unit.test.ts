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
	createProcessUnit as createManagedProcessFactory,
	trackedCreateProcessUnit,
} from './mocks';

const simpleReadyCheck: ReadyCheck = {
	logPattern: /ready/i,
	timeout: 100,
};

const timeoutReadyCheck: ReadyCheck = {
	logPattern: /ready/i,
	timeout: 100,
};

const passIfNotFoundReadyCheck: ReadyCheck = {
	logPattern: /does not matter/i,
	timeout: 100,
	passIfNotFound: true,
};

describe('ProcessUnit', () => {
	let mockLogger: ProcessLogger;
	let readyChecks: ReadyCheck[];
	let stubStdout: EventEmitter;
	let stubStderr: EventEmitter;
	let procEmitter: EventEmitter;
	let stubProc: any;
	let createdProcesses: ProcessUnit[] = [];

	// Helper function to create and track processes for proper cleanup
	const createProcessUnit = (
		command: string,
		args: string[],
		checks: ReadyCheck[],
		logger?: ProcessLogger,
	) =>
		trackedCreateProcessUnit(createdProcesses, command, args, checks, logger);

	beforeEach(() => {
		mockLogger = new ProcessLogger(10, 5);
		readyChecks = [simpleReadyCheck];

		stubStdout = new EventEmitter();
		stubStderr = new EventEmitter();
		procEmitter = new EventEmitter();
		stubProc = Object.assign(procEmitter, {
			stdout: stubStdout,
			stderr: stubStderr,
			kill: vi.fn(),
			pid: 1234,
		});

		mockSpawn.mockReturnValue(stubProc as any);
	});

	afterEach(async () => {
		// Wait a tick to let any pending promises settle
		await new Promise(resolve => setImmediate(resolve));

		// Cleanup all created processes to prevent timer leaks
		createdProcesses.forEach(process => {
			try {
				process.cleanup();
			} catch (_e) {
				// Ignore cleanup errors
			}
		});
		createdProcesses = [];

		vi.clearAllMocks();
		// Clear any leftover timers that might cause test pollution
		vi.clearAllTimers();
		// Use real timers to ensure clean state for next test
		if (vi.isFakeTimers()) {
			vi.useRealTimers();
		}
	});

	describe('Constructor', () => {
		it('should initialize with correct properties', () => {
			const process = createProcessUnit(
				'echo',
				['hello'],
				readyChecks,
				mockLogger,
			);

			expect(process.command).toEqual('echo');
			expect(process.args).toEqual(['hello']);
			expect(process.readyChecks).toEqual(readyChecks);
			expect(process.logger).toBe(mockLogger);
			expect(process.isRunning()).toBe(false);
			expect(process.getStatus()).toEqual('created');
		});

		it('should create ready and finished promises', () => {
			const process = createProcessUnit(
				'echo',
				['hello'],
				readyChecks,
				mockLogger,
			);

			expect(process.ready).toBeInstanceOf(Promise);
			expect(process.finished).toBeInstanceOf(Promise);
		});
	});

	describe('start() method', () => {
		it('should change status to running when starting the process', () => {
			const process = createProcessUnit(
				'sleep',
				['1'],
				readyChecks,
				mockLogger,
			);

			process.start();

			expect(process.getStatus()).toEqual('running');
		});

		it('should set listeners to process exit events', () => {
			const process = createProcessUnit(
				'echo',
				['hello'],
				readyChecks,
				mockLogger,
			);

			process.start();

			expect(process.process!.listeners('exit').length).toBeGreaterThanOrEqual(
				1,
			);
		});

		it('should set listeners to process error events', () => {
			const process = createProcessUnit(
				'echo',
				['hello'],
				readyChecks,
				mockLogger,
			);

			process.start();

			expect(process.process!.listeners('error').length).toBeGreaterThanOrEqual(
				1,
			);
		});

		it('should set listeners to stdout data events', () => {
			const process = createProcessUnit(
				'echo',
				['hello'],
				readyChecks,
				mockLogger,
			);

			process.start();

			expect(
				process.process!.stdout!.listeners('data').length,
			).toBeGreaterThanOrEqual(1);
		});

		it('should set listeners to stderr data events', () => {
			const process = createProcessUnit(
				'echo',
				['hello'],
				readyChecks,
				mockLogger,
			);

			process.start();

			expect(
				process.process!.stderr!.listeners('data').length,
			).toBeGreaterThanOrEqual(1);
		});

		it('should throw if process is already running', () => {
			const process = createProcessUnit(
				'echo',
				['hello'],
				readyChecks,
				mockLogger,
			);

			process.start();

			expect(() => process.start()).toThrow();
		});

		it('should spawn a child process when is called', () => {
			const process = createProcessUnit(
				'echo',
				['hello'],
				readyChecks,
				mockLogger,
			);

			process.start();

			expect(process.process).not.toBeNull();
		});

		it('should resolve ready promise immediately when no ready checks are provided', async () => {
			const process = createProcessUnit('echo', ['hello'], [], mockLogger);

			process.start();

			await expect(process.ready).resolves.toBeUndefined();
			expect(process.getStatus()).toEqual('ready');
		});

		it('should resolve ready promise when ready check passes', async () => {
			const process = createProcessUnit(
				'echo',
				['ready'],
				[simpleReadyCheck],
				mockLogger,
			);

			process.start();

			// Allow the ready check listeners to be set up before emitting data
			await new Promise(resolve => setImmediate(resolve));

			// Emit the ready data to trigger the ready check
			stubStdout.emit('data', 'ready');

			// Wait for ready promise to resolve
			await expect(process.ready).resolves.toBeUndefined();

			// Check status immediately after ready resolves
			expect(process.getStatus()).toEqual('ready');
		}, 1000);

		it('should reject ready promise when ready check fails', async () => {
			vi.useFakeTimers();

			const process = createProcessUnit(
				'echo',
				['hello'],
				[timeoutReadyCheck],
				mockLogger,
			);

			process.start();

			// Also catch the finished promise rejection to prevent unhandled rejection
			process.finished.catch(() => {}); // Swallow the rejection

			// Advance timers to trigger timeout
			vi.advanceTimersByTime(100);

			await expect(process.ready).rejects.toBeDefined();
			expect(process.getStatus()).toEqual('failedByReadyCheck');

			vi.useRealTimers();
		}, 1000);

		it('should resolve ready promise anyway after timeout if passIfNotFound is true', async () => {
			vi.useFakeTimers();

			const process = createProcessUnit(
				'echo',
				['hello'],
				[passIfNotFoundReadyCheck],
				mockLogger,
			);

			process.start();

			// should start as running
			expect(process.getStatus()).toEqual('running');

			// Advance timers to trigger timeout with passIfNotFound
			vi.advanceTimersByTime(100);

			// after timeout, process should be ready
			await expect(process.ready).resolves.toBeUndefined();
			expect(process.getStatus()).toEqual('ready');

			vi.useRealTimers();
		}, 1000);

		it('should set to couldNotSpawn when could not spawn process', async () => {
			const process = createProcessUnit(
				'echo',
				['hello'],
				[passIfNotFoundReadyCheck],
				mockLogger,
			);

			process.start();

			// should start as running
			expect(process.getStatus()).toEqual('running');

			// Catch the finished promise rejection to prevent unhandled rejection
			process.finished.catch(() => {}); // Swallow the rejection

			process.process!.emit('error', new Error('Could not spawn process'));

			await expect(process.ready).rejects.toBeDefined();
			expect(process.getStatus()).toEqual('couldNotSpawn');
		}, 1000);
	});

	describe('callbacks', () => {
		it('calls onReady callbacks when ready resolves', async () => {
			const process = createProcessUnit('echo', ['hello'], [], mockLogger);
			const readySpy = vi.fn();
			process.onReady(readySpy);

			process.start();

			await process.ready;
			expect(readySpy).toHaveBeenCalled();
		});

		it('calls onExit callbacks when process exits', async () => {
			const process = createProcessUnit('echo', ['hello'], [], mockLogger);
			const exitSpy = vi.fn();
			process.onExit(exitSpy);

			process.start();
			stubProc.emit('exit', 0);

			await expect(process.finished).resolves.toBeUndefined();

			expect(exitSpy).toHaveBeenCalled();
		});

		it('calls onCrash callbacks when process crashes', async () => {
			const process = createProcessUnit(
				'echo',
				['hello'],
				[simpleReadyCheck],
				mockLogger,
			);
			const crashSpy = vi.fn();
			process.onCrash(crashSpy);

			process.start();

			// Emit the error on the actual process instance before ready check completes
			// This simulates a spawn error
			process.process!.emit('error', new Error('Process crashed'));

			// Use expect().rejects to properly handle the rejected promise
			await expect(process.ready).rejects.toBeDefined();

			await expect(process.finished).rejects.toBeDefined();

			expect(crashSpy).toHaveBeenCalled();
			expect(process.getStatus()).toEqual('couldNotSpawn');
		});
	});

	describe('stop()', () => {
		it('should error if process is not running', () => {
			const process = createProcessUnit('echo', ['hello'], [], mockLogger);

			expect(() => process.stop()).toThrow();
		});

		it('should set status to stopping immediately', () => {
			const process = createProcessUnit('echo', ['hello'], [], mockLogger);

			process.start();

			process.stop();

			expect(process.getStatus()).toEqual('stopping');
		});

		it('should resolve finished promise when process is stopped', async () => {
			const process = createProcessUnit('echo', ['hello'], [], mockLogger);

			process.start();

			process.stop();
			stubProc.emit('exit', null, 'SIGINT');

			await expect(process.finished).resolves.toBeUndefined();
		});

		it('should escalate to kill if process does not exit after timeout', async () => {
			vi.useFakeTimers();
			const process = createProcessUnit('sleep', ['10'], [], mockLogger);

			// Spy on the kill method properly
			const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
				// Mock implementation to avoid actual killing
			});

			process.start();

			process.stop(100);

			// Advance timers to trigger timeout
			vi.advanceTimersByTime(101);

			expect(killSpy).toHaveBeenCalled();

			vi.useRealTimers();
		});
	});

	describe('kill()', () => {
		it('should error if process is not running', () => {
			const process = createProcessUnit('echo', ['hello'], [], mockLogger);

			expect(() => process.kill()).toThrow();
		});

		it('should set status to crashed immediately', () => {
			const process = createProcessUnit('echo', ['hello'], [], mockLogger);

			process.start();

			// Catch the finished promise rejection to prevent unhandled rejection
			process.finished.catch(() => {}); // Swallow the rejection

			process.kill();
			stubProc.emit('exit', null, 'SIGKILL');

			expect(process.getStatus()).toEqual('crashed');
		});

		it('should reject finished promise when process is killed', async () => {
			const process = createProcessUnit('echo', ['hello'], [], mockLogger);

			process.start();

			process.kill();
			stubProc.emit('exit', null, 'SIGKILL');

			await expect(process.finished).rejects.toBeDefined();
		});
	});

	describe('prepareForRestart() and restart flow', () => {
		let firstProc: ReturnType<typeof makeStubProc>;
		let secondProc: ReturnType<typeof makeStubProc>;
		beforeEach(() => {
			firstProc = makeStubProc();
			secondProc = makeStubProc();
		});
		it('should throw when prepareForRestart is called while running', () => {
			mockSpawn.mockImplementationOnce(() => firstProc.proc as any);
			const process = createProcessUnit('echo', ['hello'], [], mockLogger);

			process.start();

			expect(() => process.prepareForRestart()).toThrow();
		});

		it('should reset state after process exits and allow start again', async () => {
			const process = createProcessUnit(
				'echo',
				['hello'],
				[simpleReadyCheck],
				mockLogger,
			);

			process.start();

			// Simulate normal exit
			stubProc.emit('exit', 0);

			await expect(process.finished).resolves.toBeUndefined();

			// After exit, prepareForRestart should succeed
			process.prepareForRestart();

			expect(process.getStatus()).toEqual('created');
			expect(process.ready).toBeInstanceOf(Promise);
			expect(process.finished).toBeInstanceOf(Promise);

			// Starting again should spawn a new process
			process.start();

			expect(process.getStatus()).toEqual('running');
			expect(process.process).not.toBeNull();
		});

		it('should allow restart after crash (couldNotSpawn/crashed)', async () => {
			const process = createProcessUnit(
				'echo',
				['hello'],
				[simpleReadyCheck],
				mockLogger,
			);

			process.start();

			// Simulate crash/error
			process.process!.emit('error', new Error('boom'));

			await expect(process.ready).rejects.toBeDefined();
			await expect(process.finished).rejects.toBeDefined();

			// prepareForRestart should reset the instance
			process.prepareForRestart();

			expect(process.getStatus()).toEqual('created');

			// Starting again should succeed and spawn another process
			process.start();
			expect(process.getStatus()).toEqual('running');
			expect(process.process).not.toBeNull();
		});
	});
});
