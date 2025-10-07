import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {Ovrseer} from '../ovrseer.js';
import type {ProcessUnitI, ProcessStatus, TUIProcessType} from '../types.js';
import {EventEmitter} from 'events';
import {NoopCrashReporter} from '../crash-reporter.js';

// Mock ProcessUnit implementation for testing
class MockProcessUnit implements ProcessUnitI {
	private _status: ProcessStatus = 'created';
	private _running = false;
	private readyResolve?: () => void;
	private readyReject?: (err: Error) => void;
	private finishedResolve?: () => void;
	private finishedReject?: (err: Error) => void;
	private exitCallbacks: Array<
		(code: number | null, signal: NodeJS.Signals | null) => void
	> = [];
	private crashCallbacks: Array<(error: Error) => void> = [];
	private readyCallbacks: Array<() => void> = [];
	public logger: any;
	public ready: Promise<void>;
	public finished: Promise<void>;

	constructor() {
		this.ready = new Promise((resolve, reject) => {
			this.readyResolve = resolve;
			this.readyReject = reject;
		});
		this.finished = new Promise((resolve, reject) => {
			this.finishedResolve = resolve;
			this.finishedReject = reject;
		});
		this.logger = {
			onLog: vi.fn(() => () => {}),
			onError: vi.fn(() => () => {}),
			getLogs: vi.fn(() => ''),
			addChunk: vi.fn(),
			reset: vi.fn(),
			addFlag: vi.fn(),
			removeFlag: vi.fn(),
			getFlag: vi.fn(),
			getAllFlags: vi.fn(() => new Map()),
			clearFlags: vi.fn(),
			getContextWindow: vi.fn(() => []),
		};
	}

	start(): void {
		this._status = 'running';
		this._running = true;
	}

	async stop(): Promise<void> {
		this._status = 'stopping';
		this._running = false;
		await new Promise(resolve => setTimeout(resolve, 10));
		this._status = 'stopped';
		this.finishedResolve?.();
		this.exitCallbacks.forEach(cb => cb(0, null));
	}

	kill(): void {
		this._status = 'crashed';
		this._running = false;
		this.finishedReject?.(new Error('Killed'));
	}

	isRunning(): boolean {
		return this._running;
	}

	getStatus(): ProcessStatus {
		return this._status;
	}

	async runReadyChecks(): Promise<void> {}

	prepareForRestart(): void {
		this._status = 'created';
		this._running = false;
	}

	restart(): void {
		this.stop().then(() => {
			this.start();
		});
	}

	cleanup(): void {}

	onExit(
		callback: (code: number | null, signal: NodeJS.Signals | null) => void,
	): () => void {
		this.exitCallbacks.push(callback);
		return () => {
			const index = this.exitCallbacks.indexOf(callback);
			if (index > -1) this.exitCallbacks.splice(index, 1);
		};
	}

	onCrash(callback: (error: Error) => void): () => void {
		this.crashCallbacks.push(callback);
		return () => {
			const index = this.crashCallbacks.indexOf(callback);
			if (index > -1) this.crashCallbacks.splice(index, 1);
		};
	}

	onReady(callback: () => void): () => void {
		this.readyCallbacks.push(callback);
		return () => {
			const index = this.readyCallbacks.indexOf(callback);
			if (index > -1) this.readyCallbacks.splice(index, 1);
		};
	}

	// Helper methods for testing
	simulateReady(): void {
		this._status = 'ready';
		this.readyResolve?.();
		this.readyCallbacks.forEach(cb => cb());
	}

	simulateCrash(error: Error): void {
		this._status = 'crashed';
		this._running = false;
		this.readyReject?.(error);
		this.finishedReject?.(error);
		this.crashCallbacks.forEach(cb => cb(error));
	}

	simulateExit(code: number, signal: NodeJS.Signals | null = null): void {
		this._status = 'completed';
		this._running = false;
		this.finishedResolve?.();
		this.exitCallbacks.forEach(cb => cb(code, signal));
	}

	sendStdin(input: string, secret: boolean = false): void {
		if (!this._running) {
			throw new Error('Cannot send stdin to a process that is not running');
		}
	}
}

describe('Ovrseer', () => {
	let ovrseer: Ovrseer;

	beforeEach(() => {
		ovrseer = new Ovrseer();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('Constructor & Initialization', () => {
		it('should initialize with default configuration', () => {
			expect(ovrseer).toBeDefined();
			expect(ovrseer.crashReporter).toBeDefined();
			expect(ovrseer.events).toBeInstanceOf(EventEmitter);
		});

		it('should initialize using a NoopCrashReporter', () => {
			const customOvrseer = new Ovrseer({
				crashReporter: new NoopCrashReporter(),
			});
			expect(customOvrseer).toBeDefined();
			expect(customOvrseer.crashReporter).toBeInstanceOf(NoopCrashReporter);
		});

		it('should accept custom configuration', () => {
			const customOvrseer = new Ovrseer({
				retries: 5,
				waitTime: 2000,
				cleanupTimeout: 10000,
			});
			expect(customOvrseer).toBeDefined();
		});

		it('should have event emitter methods', () => {
			expect(typeof ovrseer.on).toBe('function');
			expect(typeof ovrseer.off).toBe('function');
			expect(typeof ovrseer.addEventListener).toBe('function');
			expect(typeof ovrseer.removeEventListener).toBe('function');
		});
	});

	describe('Process Management - Adding', () => {
		it('should add a dependency', () => {
			const proc = new MockProcessUnit();
			ovrseer.addDependency('dep1', proc);
			expect(ovrseer.getDependency('dep1')).toBe(proc);
		});

		it('should add a main process', () => {
			const proc = new MockProcessUnit();
			ovrseer.addMainProcess('main1', proc);
			expect(ovrseer.getMainProcess('main1')).toBe(proc);
		});

		it('should add a cleanup process', () => {
			const proc = new MockProcessUnit();
			ovrseer.addCleanupProcess('cleanup1', proc);
			expect(ovrseer.getCleanupProcess('cleanup1')).toBe(proc);
		});

		it('should add multiple processes', () => {
			const dep1 = new MockProcessUnit();
			const dep2 = new MockProcessUnit();
			const main1 = new MockProcessUnit();
			const main2 = new MockProcessUnit();

			ovrseer.addDependency('dep1', dep1);
			ovrseer.addDependency('dep2', dep2);
			ovrseer.addMainProcess('main1', main1);
			ovrseer.addMainProcess('main2', main2);

			expect(ovrseer.getDependency('dep1')).toBe(dep1);
			expect(ovrseer.getDependency('dep2')).toBe(dep2);
			expect(ovrseer.getMainProcess('main1')).toBe(main1);
			expect(ovrseer.getMainProcess('main2')).toBe(main2);
		});

		it('should emit process:added event when adding dependency', () => {
			const listener = vi.fn();
			ovrseer.on('process:added', listener);

			const proc = new MockProcessUnit();
			ovrseer.addDependency('dep1', proc);

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'dep1',
					type: 'dependency',
				}),
			);
		});

		it('should emit process:added event when adding main process', () => {
			const listener = vi.fn();
			ovrseer.on('process:added', listener);

			const proc = new MockProcessUnit();
			ovrseer.addMainProcess('main1', proc);

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'main1',
					type: 'main',
				}),
			);
		});
	});

	describe('Process Management - Removing', () => {
		it('should remove a dependency', () => {
			const proc = new MockProcessUnit();
			ovrseer.addDependency('dep1', proc);
			ovrseer.removeDependency('dep1');
			expect(ovrseer.getDependency('dep1')).toBeUndefined();
		});

		it('should remove a main process', () => {
			const proc = new MockProcessUnit();
			ovrseer.addMainProcess('main1', proc);
			ovrseer.removeMainProcess('main1');
			expect(ovrseer.getMainProcess('main1')).toBeUndefined();
		});

		it('should remove a cleanup process', () => {
			const proc = new MockProcessUnit();
			ovrseer.addCleanupProcess('cleanup1', proc);
			ovrseer.removeCleanupProcess('cleanup1');
			expect(ovrseer.getCleanupProcess('cleanup1')).toBeUndefined();
		});

		it('should emit process:removed event', () => {
			const listener = vi.fn();
			ovrseer.on('process:removed', listener);

			const proc = new MockProcessUnit();
			ovrseer.addDependency('dep1', proc);
			ovrseer.removeDependency('dep1');

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'dep1',
					type: 'dependency',
				}),
			);
		});
	});

	describe('Process Management - Retrieval', () => {
		it('should return undefined for non-existent dependency', () => {
			expect(ovrseer.getDependency('nonexistent')).toBeUndefined();
		});

		it('should return undefined for non-existent main process', () => {
			expect(ovrseer.getMainProcess('nonexistent')).toBeUndefined();
		});

		it('should return undefined for non-existent cleanup process', () => {
			expect(ovrseer.getCleanupProcess('nonexistent')).toBeUndefined();
		});
	});

	describe('Lifecycle Operations - Starting', () => {
		it('should throw when starting with no main processes', () => {
			expect(() => ovrseer.start()).toThrow('No main processes to start');
		});

		it('should start main processes when no dependencies', () => {
			const main1 = new MockProcessUnit();
			ovrseer.addMainProcess('main1', main1);

			ovrseer.start();

			expect(main1.isRunning()).toBe(true);
		});

		it('should start dependencies before main processes', async () => {
			const dep1 = new MockProcessUnit();
			const main1 = new MockProcessUnit();

			ovrseer.addDependency('dep1', dep1);
			ovrseer.addMainProcess('main1', main1);

			ovrseer.start();

			expect(dep1.isRunning()).toBe(true);
			expect(main1.isRunning()).toBe(false);

			dep1.simulateReady();
			await new Promise(resolve => setTimeout(resolve, 50));

			expect(main1.isRunning()).toBe(true);
		});

		it('should emit manager:started event', () => {
			const listener = vi.fn();
			ovrseer.on('manager:started', listener);

			const main1 = new MockProcessUnit();
			ovrseer.addMainProcess('main1', main1);

			ovrseer.start();

			expect(listener).toHaveBeenCalled();
		});

		it('should emit process:started event for each process', () => {
			const listener = vi.fn();
			ovrseer.on('process:started', listener);

			const main1 = new MockProcessUnit();
			const main2 = new MockProcessUnit();
			ovrseer.addMainProcess('main1', main1);
			ovrseer.addMainProcess('main2', main2);

			ovrseer.start();

			expect(listener).toHaveBeenCalledTimes(2);
		});

		it('should emit state:update event', () => {
			const listener = vi.fn();
			ovrseer.on('state:update', listener);

			const main1 = new MockProcessUnit();
			ovrseer.addMainProcess('main1', main1);

			ovrseer.start();

			expect(listener).toHaveBeenCalled();
		});
	});

	describe('Lifecycle Operations - Stopping', () => {
		it('should stop all running processes', async () => {
			const main1 = new MockProcessUnit();
			const main2 = new MockProcessUnit();

			ovrseer.addMainProcess('main1', main1);
			ovrseer.addMainProcess('main2', main2);

			ovrseer.start();
			await ovrseer.stop();

			expect(main1.isRunning()).toBe(false);
			expect(main2.isRunning()).toBe(false);
		});

		it('should emit manager:stopping event', async () => {
			const listener = vi.fn();
			ovrseer.on('manager:stopping', listener);

			const main1 = new MockProcessUnit();
			ovrseer.addMainProcess('main1', main1);

			ovrseer.start();
			await ovrseer.stop();

			expect(listener).toHaveBeenCalled();
		});

		it('should emit manager:stopped event', async () => {
			const listener = vi.fn();
			ovrseer.on('manager:stopped', listener);

			const main1 = new MockProcessUnit();
			ovrseer.addMainProcess('main1', main1);

			ovrseer.start();
			await ovrseer.stop();

			expect(listener).toHaveBeenCalled();
		});

		it('should run cleanup processes after stopping main', async () => {
			const main1 = new MockProcessUnit();
			const cleanup1 = new MockProcessUnit();

			ovrseer.addMainProcess('main1', main1);
			ovrseer.addCleanupProcess('cleanup1', cleanup1);

			ovrseer.start();
			const stopPromise = ovrseer.stop();

			await new Promise(resolve => setTimeout(resolve, 50));
			expect(cleanup1.isRunning()).toBe(true);

			await stopPromise;
		});

		it('should emit cleanup:started and cleanup:finished events', async () => {
			const startListener = vi.fn();
			const finishListener = vi.fn();
			ovrseer.on('cleanup:started', startListener);
			ovrseer.on('cleanup:finished', finishListener);

			const main1 = new MockProcessUnit();
			const cleanup1 = new MockProcessUnit();

			ovrseer.addMainProcess('main1', main1);
			ovrseer.addCleanupProcess('cleanup1', cleanup1);

			ovrseer.start();
			await ovrseer.stop();

			expect(startListener).toHaveBeenCalled();
			expect(finishListener).toHaveBeenCalled();
		});
	});

	describe('Lifecycle Operations - Restarting', () => {
		it('should restart individual process', () => {
			const main1 = new MockProcessUnit();
			const restartSpy = vi.spyOn(main1, 'restart');

			ovrseer.addMainProcess('main1', main1);
			ovrseer.start();

			ovrseer.restartProcess('main1', 'main');

			expect(restartSpy).toHaveBeenCalled();
		});

		it('should emit process:restarting event', () => {
			const listener = vi.fn();
			ovrseer.on('process:restarting', listener);

			const main1 = new MockProcessUnit();
			ovrseer.addMainProcess('main1', main1);
			ovrseer.start();

			ovrseer.restartProcess('main1', 'main');

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'main1',
					type: 'main',
				}),
			);
		});

		it('should restart all processes', async () => {
			const main1 = new MockProcessUnit();
			const main2 = new MockProcessUnit();

			ovrseer.addMainProcess('main1', main1);
			ovrseer.addMainProcess('main2', main2);

			ovrseer.start();
			ovrseer.restartAll();

			await new Promise(resolve => setTimeout(resolve, 100));

			expect(main1.isRunning()).toBe(true);
			expect(main2.isRunning()).toBe(true);
		});

		it('should emit manager:restarting event', () => {
			const listener = vi.fn();
			ovrseer.on('manager:restarting', listener);

			const main1 = new MockProcessUnit();
			ovrseer.addMainProcess('main1', main1);

			ovrseer.start();
			ovrseer.restartAll();

			expect(listener).toHaveBeenCalled();
		});

		it('should restart all main processes only', () => {
			const main1 = new MockProcessUnit();
			const main2 = new MockProcessUnit();
			const dep1 = new MockProcessUnit();

			const main1Spy = vi.spyOn(main1, 'restart');
			const main2Spy = vi.spyOn(main2, 'restart');
			const dep1Spy = vi.spyOn(dep1, 'restart');

			ovrseer.addDependency('dep1', dep1);
			ovrseer.addMainProcess('main1', main1);
			ovrseer.addMainProcess('main2', main2);

			ovrseer.start();
			ovrseer.restartAllMainProcesses();

			expect(main1Spy).toHaveBeenCalled();
			expect(main2Spy).toHaveBeenCalled();
			expect(dep1Spy).not.toHaveBeenCalled();
		});
	});

	describe('Event Handling', () => {
		it('should forward process ready events', async () => {
			const listener = vi.fn();
			ovrseer.on('process:ready', listener);

			const main1 = new MockProcessUnit();
			ovrseer.addMainProcess('main1', main1);
			ovrseer.start();

			main1.simulateReady();
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'main1',
					type: 'main',
				}),
			);
		});

		it('should forward process crash events', async () => {
			const listener = vi.fn();
			ovrseer.on('process:crashed', listener);

			const main1 = new MockProcessUnit();
			ovrseer.addMainProcess('main1', main1);
			ovrseer.start();

			const error = new Error('Test crash');
			main1.simulateCrash(error);
			await new Promise(resolve => setTimeout(resolve, 50));

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'main1',
					type: 'main',
					error,
				}),
			);
		});

		it('should forward process exit events', async () => {
			const listener = vi.fn();
			ovrseer.on('process:stopped', listener);

			const main1 = new MockProcessUnit();
			ovrseer.addMainProcess('main1', main1);
			ovrseer.start();

			main1.simulateExit(0);
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(listener).toHaveBeenCalled();
		});

		it('should support multiple event listeners', () => {
			const listener1 = vi.fn();
			const listener2 = vi.fn();

			ovrseer.on('manager:started', listener1);
			ovrseer.on('manager:started', listener2);

			const main1 = new MockProcessUnit();
			ovrseer.addMainProcess('main1', main1);
			ovrseer.start();

			expect(listener1).toHaveBeenCalled();
			expect(listener2).toHaveBeenCalled();
		});

		it('should support removing event listeners', () => {
			const listener = vi.fn();

			ovrseer.on('manager:started', listener);
			ovrseer.off('manager:started', listener);

			const main1 = new MockProcessUnit();
			ovrseer.addMainProcess('main1', main1);
			ovrseer.start();

			expect(listener).not.toHaveBeenCalled();
		});
	});

	describe('Edge Cases', () => {
		it('should handle rapid add/remove operations', () => {
			for (let i = 0; i < 100; i++) {
				const proc = new MockProcessUnit();
				ovrseer.addMainProcess(`main${i}`, proc);
			}

			for (let i = 0; i < 100; i++) {
				ovrseer.removeMainProcess(`main${i}`);
			}

			expect(ovrseer.getMainProcess('main0')).toBeUndefined();
			expect(ovrseer.getMainProcess('main99')).toBeUndefined();
		});

		it('should handle empty process lists gracefully', async () => {
			const dep1 = new MockProcessUnit();
			ovrseer.addDependency('dep1', dep1);
			ovrseer.addMainProcess('main1', new MockProcessUnit());

			ovrseer.start();
			await ovrseer.stop();

			expect(dep1.isRunning()).toBe(false);
		});

		it('should handle process without type specification', () => {
			const main1 = new MockProcessUnit();
			ovrseer.addMainProcess('main1', main1);
			ovrseer.start();

			ovrseer.restartProcess('main1');

			expect(main1.getStatus()).toBeDefined();
		});

		it('should handle dependency failure gracefully', async () => {
			const dep1 = new MockProcessUnit();
			const main1 = new MockProcessUnit();

			ovrseer.addDependency('dep1', dep1);
			ovrseer.addMainProcess('main1', main1);

			ovrseer.start();

			dep1.simulateCrash(new Error('Dependency failed'));
			await new Promise(resolve => setTimeout(resolve, 100));

			expect(main1.isRunning()).toBe(false);
		});

		it('should retry crashed main processes', async () => {
			const crashListener = vi.fn();
			ovrseer.on('process:crashed', crashListener);

			const main1 = new MockProcessUnit();
			ovrseer.addMainProcess('main1', main1);
			ovrseer.start();

			main1.simulateCrash(new Error('Crash 1'));
			await new Promise(resolve => setTimeout(resolve, 50));

			expect(crashListener).toHaveBeenCalled();
		});

		it('should stop after max retries', async () => {
			const customOvrseer = new Ovrseer({retries: 2});
			const main1 = new MockProcessUnit();

			customOvrseer.addMainProcess('main1', main1);
			customOvrseer.start();

			// Simulate multiple crashes
			for (let i = 0; i < 3; i++) {
				main1.simulateCrash(new Error(`Crash ${i + 1}`));
				await new Promise(resolve => setTimeout(resolve, 50));
			}

			expect(main1.isRunning()).toBe(false);
		});
	});

	describe('Full Lifecycle Scenarios', () => {
		it('should complete full start-stop cycle', async () => {
			const dep1 = new MockProcessUnit();
			const main1 = new MockProcessUnit();
			const cleanup1 = new MockProcessUnit();

			ovrseer.addDependency('dep1', dep1);
			ovrseer.addMainProcess('main1', main1);
			ovrseer.addCleanupProcess('cleanup1', cleanup1);

			ovrseer.start();
			dep1.simulateReady();

			await new Promise(resolve => setTimeout(resolve, 50));
			expect(main1.isRunning()).toBe(true);

			await ovrseer.stop();

			expect(dep1.isRunning()).toBe(false);
			expect(main1.isRunning()).toBe(false);
		});

		it('should handle complex multi-process scenario', async () => {
			const deps = [new MockProcessUnit(), new MockProcessUnit()];
			const mains = [
				new MockProcessUnit(),
				new MockProcessUnit(),
				new MockProcessUnit(),
			];
			const cleanups = [new MockProcessUnit()];

			deps.forEach((dep, i) => ovrseer.addDependency(`dep${i}`, dep));
			mains.forEach((main, i) => ovrseer.addMainProcess(`main${i}`, main));
			cleanups.forEach((cleanup, i) =>
				ovrseer.addCleanupProcess(`cleanup${i}`, cleanup),
			);

			ovrseer.start();

			deps.forEach(dep => dep.simulateReady());
			await new Promise(resolve => setTimeout(resolve, 50));

			expect(mains.every(m => m.isRunning())).toBe(true);

			await ovrseer.stop();

			expect(deps.every(d => !d.isRunning())).toBe(true);
			expect(mains.every(m => !m.isRunning())).toBe(true);
		});
	});

	describe('sendStdin', () => {
		it('should throw error if process not found', () => {
			expect(() => ovrseer.sendStdin('nonexistent', 'test')).toThrow(
				'Process with id "nonexistent" not found',
			);
		});

		it('should send stdin to main process', () => {
			const proc = new MockProcessUnit();
			const sendStdinSpy = vi.spyOn(proc, 'sendStdin');
			ovrseer.addMainProcess('test', proc);
			ovrseer.start();

			ovrseer.sendStdin('test', 'hello');

			expect(sendStdinSpy).toHaveBeenCalledWith('hello', false);
		});

		it('should send stdin to dependency process', () => {
			const dep = new MockProcessUnit();
			const sendStdinSpy = vi.spyOn(dep, 'sendStdin');
			ovrseer.addDependency('dep1', dep);
			dep.start();

			ovrseer.sendStdin('dep1', 'world');

			expect(sendStdinSpy).toHaveBeenCalledWith('world', false);
		});

		it('should send stdin to cleanup process', () => {
			const cleanup = new MockProcessUnit();
			const sendStdinSpy = vi.spyOn(cleanup, 'sendStdin');
			ovrseer.addCleanupProcess('cleanup1', cleanup);
			cleanup.start();

			ovrseer.sendStdin('cleanup1', 'bye');

			expect(sendStdinSpy).toHaveBeenCalledWith('bye', false);
		});

		it('should pass secret flag to process sendStdin', () => {
			const proc = new MockProcessUnit();
			const sendStdinSpy = vi.spyOn(proc, 'sendStdin');
			ovrseer.addMainProcess('test', proc);
			ovrseer.start();

			ovrseer.sendStdin('test', 'password', true);

			expect(sendStdinSpy).toHaveBeenCalledWith('password', true);
		});

		it('should search all process types when finding process', async () => {
			const dep = new MockProcessUnit();
			const main = new MockProcessUnit();
			const cleanup = new MockProcessUnit();

			ovrseer.addDependency('dep1', dep);
			ovrseer.addMainProcess('main1', main);
			ovrseer.addCleanupProcess('cleanup1', cleanup);

			ovrseer.start();
			dep.simulateReady();
			await new Promise(resolve => setTimeout(resolve, 50));
			cleanup.start();

			expect(() => ovrseer.sendStdin('dep1', 'test')).not.toThrow();
			expect(() => ovrseer.sendStdin('main1', 'test')).not.toThrow();
			expect(() => ovrseer.sendStdin('cleanup1', 'test')).not.toThrow();
		});
	});
});
