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
import {ProcessUnit} from '../process-unit';
const mockSpawn = vi.mocked(spawn);

import {makeStubProc, trackedCreateProcessUnit} from './mocks';

const timeoutReadyCheck: ReadyCheck = {
	logPattern: /ready/i,
	timeout: 100,
};

describe('ProcessUnit - Enhanced Restart Behavior', () => {
	let mockLogger: ProcessLogger;
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
	});

	afterEach(async () => {
		await new Promise(resolve => setImmediate(resolve));
		createdProcesses.forEach(process => {
			try {
				process.cleanup();
			} catch (_e) {}
		});
		createdProcesses = [];
		vi.clearAllMocks();
		vi.clearAllTimers();
		if (vi.isFakeTimers()) {
			vi.useRealTimers();
		}
	});

	describe('restart() - from different states', () => {
		it('should restart from completed state', async () => {
			const firstProc = makeStubProc();
			const secondProc = makeStubProc();
			mockSpawn
				.mockImplementationOnce(() => firstProc.proc as any)
				.mockImplementationOnce(() => secondProc.proc as any);

			const process = createProcessUnit('echo', ['hello'], [], mockLogger);

			process.start();
			firstProc.proc.emit('exit', 0);
			await process.finished;

			expect(process.getStatus()).toBe('completed');

			process.restart();
			await new Promise(resolve => setImmediate(resolve));

			expect(process.getStatus()).toBe('running');
			expect(mockSpawn).toHaveBeenCalledTimes(2);
		});

		it('should restart from stopped state', async () => {
			const firstProc = makeStubProc();
			const secondProc = makeStubProc();
			mockSpawn
				.mockImplementationOnce(() => firstProc.proc as any)
				.mockImplementationOnce(() => secondProc.proc as any);

			const process = createProcessUnit('echo', ['hello'], [], mockLogger);

			process.start();
			await process.stop();

			expect(process.getStatus()).toBe('stopped');

			process.restart();
			await new Promise(resolve => setImmediate(resolve));

			expect(process.getStatus()).toBe('running');
		});

		it('should restart from crashed state', async () => {
			const firstProc = makeStubProc();
			const secondProc = makeStubProc();
			mockSpawn
				.mockImplementationOnce(() => firstProc.proc as any)
				.mockImplementationOnce(() => secondProc.proc as any);

			const process = createProcessUnit('echo', ['hello'], [], mockLogger);

			process.start();
			process.finished.catch(() => {});
			firstProc.proc.emit('error', new Error('Crash'));

			await expect(process.finished).rejects.toBeDefined();

			process.restart();
			await new Promise(resolve => setImmediate(resolve));

			expect(process.getStatus()).toBe('running');
		});

		it('should stop and restart when called on running process', async () => {
			const firstProc = makeStubProc();
			const secondProc = makeStubProc();
			mockSpawn
				.mockImplementationOnce(() => firstProc.proc as any)
				.mockImplementationOnce(() => secondProc.proc as any);

			const process = createProcessUnit('echo', ['hello'], [], mockLogger);

			process.start();
			expect(process.getStatus()).toBe('running');

			process.restart();
			expect(process.getStatus()).toBe('stopping');

			firstProc.proc.emit('exit', null, 'SIGTERM');
			await new Promise(resolve => setTimeout(resolve, 50));

			expect(process.getStatus()).toBe('running');
			expect(mockSpawn).toHaveBeenCalledTimes(2);
		});

		it('should restart from failedByReadyCheck state', async () => {
			vi.useFakeTimers();

			const firstProc = makeStubProc();
			const secondProc = makeStubProc();
			mockSpawn
				.mockImplementationOnce(() => firstProc.proc as any)
				.mockImplementationOnce(() => secondProc.proc as any);

			const process = createProcessUnit(
				'echo',
				['hello'],
				[timeoutReadyCheck],
				mockLogger,
			);

			process.start();
			process.finished.catch(() => {});

			vi.advanceTimersByTime(100);
			await expect(process.ready).rejects.toBeDefined();

			process.restart();
			await new Promise(resolve => setImmediate(resolve));

			expect(process.getStatus()).toBe('running');

			vi.useRealTimers();
		});

		it('should restart from created state', () => {
			const firstProc = makeStubProc();
			mockSpawn.mockImplementationOnce(() => firstProc.proc as any);

			const process = createProcessUnit('echo', ['hello'], [], mockLogger);

			expect(process.getStatus()).toBe('created');

			expect(() => process.restart()).not.toThrow();
			expect(process.getStatus()).toBe('running');
		});

		it('should handle restart from stopping state', async () => {
			const firstProc = makeStubProc();
			const secondProc = makeStubProc();
			mockSpawn
				.mockImplementationOnce(() => firstProc.proc as any)
				.mockImplementationOnce(() => secondProc.proc as any);

			const process = createProcessUnit('echo', ['hello'], [], mockLogger);

			process.start();
			process.stop();

			expect(process.getStatus()).toBe('stopping');

			process.restart();
			firstProc.proc.emit('exit', null, 'SIGTERM');
			await new Promise(resolve => setTimeout(resolve, 50));

			expect(process.getStatus()).toBe('running');
		});
	});

	describe('restart() - preserves configuration', () => {
		it('should preserve command and args on restart', async () => {
			const firstProc = makeStubProc();
			const secondProc = makeStubProc();
			mockSpawn
				.mockImplementationOnce(() => firstProc.proc as any)
				.mockImplementationOnce(() => secondProc.proc as any);

			const process = createProcessUnit(
				'node',
				['--version', '--verbose'],
				[],
				mockLogger,
			);

			process.start();
			firstProc.proc.emit('exit', 0);
			await process.finished;

			process.restart();
			await new Promise(resolve => setImmediate(resolve));

			expect(mockSpawn).toHaveBeenNthCalledWith(
				1,
				'node',
				['--version', '--verbose'],
				expect.any(Object),
			);
			expect(mockSpawn).toHaveBeenNthCalledWith(
				2,
				'node',
				['--version', '--verbose'],
				expect.any(Object),
			);
		});

		it('should preserve ready checks on restart', async () => {
			const firstProc = makeStubProc();
			const secondProc = makeStubProc();
			mockSpawn
				.mockImplementationOnce(() => firstProc.proc as any)
				.mockImplementationOnce(() => secondProc.proc as any);

			const readyCheck: ReadyCheck = {
				logPattern: /READY/,
				timeout: 5000,
			};

			const process = createProcessUnit(
				'test',
				[],
				[readyCheck],
				mockLogger,
			);

			process.start();
			firstProc.stdout.emit('data', 'READY\n');
			await process.ready;

			firstProc.proc.emit('exit', 0);
			await process.finished;

			process.restart();
			await new Promise(resolve => setImmediate(resolve));

			// Second process should also respect ready check
			secondProc.stdout.emit('data', 'READY\n');
			await expect(process.ready).resolves.toBeUndefined();
		});
	});

	describe('restart() - lifecycle callbacks', () => {
		it('should trigger exit callback on first process before restart', async () => {
			const firstProc = makeStubProc();
			const secondProc = makeStubProc();
			mockSpawn
				.mockImplementationOnce(() => firstProc.proc as any)
				.mockImplementationOnce(() => secondProc.proc as any);

			const process = createProcessUnit('echo', ['hello'], [], mockLogger);
			const exitSpy = vi.fn();
			process.onExit(exitSpy);

			process.start();
			firstProc.proc.emit('exit', 0);
			await process.finished;

			expect(exitSpy).toHaveBeenCalledTimes(1);

			process.restart();
			await new Promise(resolve => setImmediate(resolve));
			secondProc.proc.emit('exit', 0);
			await process.finished;

			expect(exitSpy).toHaveBeenCalledTimes(2);
		});

		it('should trigger ready callback after restart', async () => {
			const firstProc = makeStubProc();
			const secondProc = makeStubProc();
			mockSpawn
				.mockImplementationOnce(() => firstProc.proc as any)
				.mockImplementationOnce(() => secondProc.proc as any);

			const process = createProcessUnit('echo', ['hello'], [], mockLogger);
			const readySpy = vi.fn();
			process.onReady(readySpy);

			process.start();
			await process.ready;

			expect(readySpy).toHaveBeenCalledTimes(1);

			firstProc.proc.emit('exit', 0);
			await process.finished;

			process.restart();
			await new Promise(resolve => setImmediate(resolve));
			await process.ready;

			expect(readySpy).toHaveBeenCalledTimes(2);
		});
	});

	describe('restart() - error handling', () => {
		it('should handle spawn error after restart', async () => {
			const firstProc = makeStubProc();
			mockSpawn
				.mockImplementationOnce(() => firstProc.proc as any)
				.mockImplementationOnce(() => {
					const failProc = makeStubProc();
					setTimeout(() => {
						failProc.proc.emit('error', new Error('Spawn failed'));
					}, 0);
					return failProc.proc as any;
				});

			const process = createProcessUnit('echo', ['hello'], [], mockLogger);

			process.start();
			firstProc.proc.emit('exit', 0);
			await process.finished;

			process.restart();
			await new Promise(resolve => setImmediate(resolve));

			await expect(process.ready).rejects.toBeDefined();
		});
	});
});