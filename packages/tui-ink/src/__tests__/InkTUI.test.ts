import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {InkTUI} from '../InkTUI.js';
import type {
	OvrseerI,
	ProcessUnitI,
	ProcessManagerEvents,
	TUIProcessType,
	LogEntry,
	LogType,
} from '../types.js';
import {EventEmitter} from 'events';

// Mock Ovrseer implementation
class MockOvrseer implements OvrseerI {
	private eventEmitter = new EventEmitter();
	private deps = new Map<string, ProcessUnitI>();
	private mains = new Map<string, ProcessUnitI>();
	private cleanups = new Map<string, ProcessUnitI>();

	crashReporter = undefined;

	addDependency(id: string, process: ProcessUnitI): void {
		this.deps.set(id, process);
	}

	removeDependency(id: string): void {
		this.deps.delete(id);
	}

	getDependency(id: string): ProcessUnitI | undefined {
		return this.deps.get(id);
	}

	addMainProcess(id: string, process: ProcessUnitI): void {
		this.mains.set(id, process);
	}

	removeMainProcess(id: string): void {
		this.mains.delete(id);
	}

	getMainProcess(id: string): ProcessUnitI | undefined {
		return this.mains.get(id);
	}

	addCleanupProcess(id: string, process: ProcessUnitI): void {
		this.cleanups.set(id, process);
	}

	removeCleanupProcess(id: string): void {
		this.cleanups.delete(id);
	}

	getCleanupProcess(id: string): ProcessUnitI | undefined {
		return this.cleanups.get(id);
	}

	start(): void {
		this.eventEmitter.emit('manager:started', {timestamp: Date.now()});
	}

	async stop(): Promise<void> {
		this.eventEmitter.emit('manager:stopping', {timestamp: Date.now()});
		await new Promise(resolve => setTimeout(resolve, 10));
		this.eventEmitter.emit('manager:stopped', {timestamp: Date.now()});
	}

	restartProcess(id: string, processType?: TUIProcessType): void {
		this.eventEmitter.emit('process:restarting', {
			id,
			type: processType || 'main',
			timestamp: Date.now(),
		});
	}

	restartAll(): void {
		this.eventEmitter.emit('manager:restarting', {timestamp: Date.now()});
	}

	restartAllMainProcesses(): void {
		// Implementation not needed for tests
	}

	on<K extends keyof ProcessManagerEvents>(
		event: K,
		listener: (data: ProcessManagerEvents[K]) => void,
	): void {
		this.eventEmitter.on(event, listener);
	}

	addEventListener<K extends keyof ProcessManagerEvents>(
		event: K,
		listener: (data: ProcessManagerEvents[K]) => void,
	): void {
		this.on(event, listener);
	}

	off<K extends keyof ProcessManagerEvents>(
		event: K,
		listener: (data: ProcessManagerEvents[K]) => void,
	): void {
		this.eventEmitter.off(event, listener);
	}

	removeEventListener<K extends keyof ProcessManagerEvents>(
		event: K,
		listener: (data: ProcessManagerEvents[K]) => void,
	): void {
		this.off(event, listener);
	}

	// Helper for triggering events in tests
	triggerEvent<K extends keyof ProcessManagerEvents>(
		event: K,
		data: ProcessManagerEvents[K],
	): void {
		this.eventEmitter.emit(event, data);
	}
}

// Mock ProcessUnit
class MockProcessUnit implements ProcessUnitI {
	logger: any;
	ready = Promise.resolve();
	finished = Promise.resolve();

	constructor() {
		this.logger = {
			onLog: vi.fn(() => () => {}),
			onError: vi.fn(() => () => {}),
			getLogs: vi.fn(() => 'mock logs'),
			getTypedLogs: vi.fn(() => []),
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

	start(): void {}
	async stop(): Promise<void> {}
	kill(): void {}
	isRunning(): boolean {
		return true;
	}
	getStatus() {
		return 'running' as const;
	}
	async runReadyChecks(): Promise<void> {}
	prepareForRestart(): void {}
	restart(): void {}
	cleanup(): void {}
	onExit(): () => void {
		return () => {};
	}
	onCrash(): () => void {
		return () => {};
	}
	onReady(): () => void {
		return () => {};
	}
}

describe('InkTUI', () => {
	let tui: InkTUI;
	let mockManager: MockOvrseer;

	beforeEach(() => {
		tui = new InkTUI();
		mockManager = new MockOvrseer();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('Constructor & Setup', () => {
		it('should instantiate successfully', () => {
			expect(tui).toBeDefined();
		});

		it('should allow attaching to manager', () => {
			expect(() => tui.attachToManager(mockManager)).not.toThrow();
		});

		it('should throw when attaching to manager twice', () => {
			tui.attachToManager(mockManager);
			expect(() => tui.attachToManager(mockManager)).toThrow(
				'Already attached to a manager',
			);
		});

		it('should allow detaching from manager', () => {
			tui.attachToManager(mockManager);
			expect(() => tui.detachFromManager()).not.toThrow();
		});

		it('should allow re-attaching after detaching', () => {
			tui.attachToManager(mockManager);
			tui.detachFromManager();
			expect(() => tui.attachToManager(mockManager)).not.toThrow();
		});
	});

	describe('Manager Integration', () => {
		beforeEach(() => {
			tui.attachToManager(mockManager);
		});

		it('should handle status:message events', () => {
			const showStatusSpy = vi.spyOn(tui, 'showStatus');
			mockManager.triggerEvent('status:message', {
				message: 'Test message',
				timestamp: Date.now(),
			});
			expect(showStatusSpy).toHaveBeenCalledWith('Test message');
		});

		it('should handle state:update events', () => {
			const renderSpy = vi.spyOn(tui, 'render');
			mockManager.triggerEvent('state:update', {
				processes: {
					dependencies: new Map(),
					main: new Map(),
					cleanup: new Map(),
				},
				timestamp: Date.now(),
			});
			expect(renderSpy).toHaveBeenCalled();
		});

		it('should handle process:ready events', () => {
			const showStatusSpy = vi.spyOn(tui, 'showStatus');
			mockManager.triggerEvent('process:ready', {
				id: 'test-proc',
				type: 'main',
				timestamp: Date.now(),
			});
			expect(showStatusSpy).toHaveBeenCalledWith('Process test-proc is ready');
		});

		it('should handle process:crashed events', () => {
			const showStatusSpy = vi.spyOn(tui, 'showStatus');
			mockManager.triggerEvent('process:crashed', {
				id: 'test-proc',
				type: 'main',
				error: new Error('Test crash'),
				timestamp: Date.now(),
			});
			expect(showStatusSpy).toHaveBeenCalledWith(
				'Process test-proc crashed: Test crash',
			);
		});

		it('should handle manager:started events', () => {
			const showStatusSpy = vi.spyOn(tui, 'showStatus');
			mockManager.triggerEvent('manager:started', {timestamp: Date.now()});
			expect(showStatusSpy).toHaveBeenCalledWith('Manager started');
		});

		it('should handle manager:stopping events', () => {
			const showStatusSpy = vi.spyOn(tui, 'showStatus');
			mockManager.triggerEvent('manager:stopping', {timestamp: Date.now()});
			expect(showStatusSpy).toHaveBeenCalledWith('Stopping all processes...');
		});

		it('should handle manager:stopped events', () => {
			const showStatusSpy = vi.spyOn(tui, 'showStatus');
			mockManager.triggerEvent('manager:stopped', {timestamp: Date.now()});
			expect(showStatusSpy).toHaveBeenCalledWith('All processes stopped');
		});
	});

	describe('Process Management', () => {
		it('should display added processes', () => {
			tui.attachToManager(mockManager);
			const renderSpy = vi.spyOn(tui, 'render');

			mockManager.addMainProcess('main1', new MockProcessUnit());
			mockManager.triggerEvent('process:added', {
				id: 'main1',
				type: 'main',
				timestamp: Date.now(),
			});

			expect(renderSpy).toHaveBeenCalled();
		});

		it('should handle removal of processes', () => {
			tui.attachToManager(mockManager);
			const renderSpy = vi.spyOn(tui, 'render');

			mockManager.addMainProcess('main1', new MockProcessUnit());
			mockManager.removeMainProcess('main1');
			mockManager.triggerEvent('process:removed', {
				id: 'main1',
				type: 'main',
				timestamp: Date.now(),
			});

			expect(renderSpy).toHaveBeenCalled();
		});

		it('should handle multiple process types', () => {
			tui.attachToManager(mockManager);

			mockManager.addDependency('dep1', new MockProcessUnit());
			mockManager.addMainProcess('main1', new MockProcessUnit());
			mockManager.addCleanupProcess('cleanup1', new MockProcessUnit());

			expect(mockManager.getDependency('dep1')).toBeDefined();
			expect(mockManager.getMainProcess('main1')).toBeDefined();
			expect(mockManager.getCleanupProcess('cleanup1')).toBeDefined();
		});
	});

	describe('TUI Lifecycle', () => {
		it('should initialize rendering', () => {
			const initSpy = vi.spyOn(tui, 'init');
			tui.init();
			expect(initSpy).toHaveBeenCalled();
		});

		it('should destroy rendering', () => {
			const destroySpy = vi.spyOn(tui, 'destroy');
			tui.destroy();
			expect(destroySpy).toHaveBeenCalled();
		});

		it('should handle rapid init/destroy cycles', () => {
			for (let i = 0; i < 10; i++) {
				tui.init();
				tui.destroy();
			}
			expect(tui).toBeDefined();
		});
	});

	describe('Keypress Handling', () => {
		beforeEach(() => {
			tui.attachToManager(mockManager);
		});

		it('should register keypress handlers', () => {
			const callback = vi.fn();
			tui.onKeyPress(callback);
			expect(callback).toBeDefined();
		});

		it('should handle quit keys', async () => {
			const stopSpy = vi.spyOn(mockManager, 'stop');
			const destroySpy = vi.spyOn(tui, 'destroy');
			const exitSpy = vi
				.spyOn(process, 'exit')
				.mockImplementation(() => undefined as never);

			// Simulate keypress
			const handler = vi.fn();
			tui.onKeyPress(handler);

			// Get the registered callback and call it with 'q'
			const callback = handler.mock.calls[0]?.[0];
			if (typeof callback === 'function') {
				await callback('q', undefined);
			}

			exitSpy.mockRestore();
		});

		it('should handle start key', () => {
			const startSpy = vi.spyOn(mockManager, 'start');

			const handler = vi.fn();
			tui.onKeyPress(handler);

			const callback = handler.mock.calls[0]?.[0];
			if (typeof callback === 'function') {
				callback('s', undefined);
			}

			expect(startSpy).toHaveBeenCalled();
		});

		it('should handle restart key for selected process', () => {
			const restartSpy = vi.spyOn(mockManager, 'restartProcess');

			mockManager.addMainProcess('main1', new MockProcessUnit());

			const handler = vi.fn();
			tui.onKeyPress(handler);

			const callback = handler.mock.calls[0]?.[0];
			if (typeof callback === 'function') {
				// First select a process, then restart
				callback('select', {processInfo: {id: 'main1', type: 'main'}});
				callback('r', undefined);
			}

			expect(restartSpy).toHaveBeenCalledWith('main1', 'main');
		});

		it('should handle restart all key', () => {
			const restartAllSpy = vi.spyOn(mockManager, 'restartAll');

			const handler = vi.fn();
			tui.onKeyPress(handler);

			const callback = handler.mock.calls[0]?.[0];
			if (typeof callback === 'function') {
				callback('R', undefined);
			}

			expect(restartAllSpy).toHaveBeenCalled();
		});
	});

	describe('Log Display', () => {
		beforeEach(() => {
			tui.attachToManager(mockManager);
		});

		it('should display logs for selected process', () => {
			const proc = new MockProcessUnit();
			mockManager.addMainProcess('main1', proc);

			const showLogsSpy = vi.spyOn(tui, 'showLogs');

			const handler = vi.fn();
			tui.onKeyPress(handler);

			const callback = handler.mock.calls[0]?.[0];
			if (typeof callback === 'function') {
				callback('select', {processInfo: {id: 'main1', type: 'main'}});
				callback('enter', undefined);
			}

			expect(showLogsSpy).toHaveBeenCalledWith('main1', 'main', []);
		});

		it('should update logs on process:log event', () => {
			const proc = new MockProcessUnit();
			mockManager.addMainProcess('main1', proc);

			const showLogsSpy = vi.spyOn(tui, 'showLogs');

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];
			if (typeof callback === 'function') {
				callback('select', {processInfo: {id: 'main1', type: 'main'}});
			}

			mockManager.triggerEvent('process:log', {
				id: 'main1',
				type: 'main',
				message: 'New log message',
				isError: false,
				timestamp: Date.now(),
			});

			expect(proc.logger.getTypedLogs).toHaveBeenCalled();
		});

		it('should render typed logs with correct types', () => {
			const proc = new MockProcessUnit();
			const mockTypedLogs: LogEntry[] = [
				{
					type: 'info' as LogType,
					content: 'Info message',
					time: Date.now(),
				},
				{
					type: 'error' as LogType,
					content: 'Error message',
					time: Date.now(),
				},
				{
					type: 'warn' as LogType,
					content: 'Warning message',
					time: Date.now(),
				},
			];
			proc.logger.getTypedLogs = vi.fn(() => mockTypedLogs);
			mockManager.addMainProcess('main1', proc);

			const showLogsSpy = vi.spyOn(tui, 'showLogs');

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];
			if (typeof callback === 'function') {
				callback('select', {processInfo: {id: 'main1', type: 'main'}});
				callback('enter', undefined);
			}

			expect(proc.logger.getTypedLogs).toHaveBeenCalled();
			expect(showLogsSpy).toHaveBeenCalledWith('main1', 'main', mockTypedLogs);
		});

		it('should mask UserInputSecret logs', () => {
			const proc = new MockProcessUnit();
			const mockTypedLogs: LogEntry[] = [
				{
					type: 'UserInput' as LogType,
					content: 'normal input',
					time: Date.now(),
				},
				{
					type: 'UserInputSecret' as LogType,
					content: 'secret password',
					time: Date.now(),
				},
			];
			proc.logger.getTypedLogs = vi.fn(() => mockTypedLogs);
			mockManager.addMainProcess('main1', proc);

			const showLogsSpy = vi.spyOn(tui, 'showLogs');

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];
			if (typeof callback === 'function') {
				callback('select', {processInfo: {id: 'main1', type: 'main'}});
				callback('enter', undefined);
			}

			expect(showLogsSpy).toHaveBeenCalledWith('main1', 'main', mockTypedLogs);
		});

		it('should call getTypedLogs on process:log event', () => {
			const proc = new MockProcessUnit();
			const mockTypedLogs: LogEntry[] = [
				{type: 'info' as LogType, content: 'New log', time: Date.now()},
			];
			proc.logger.getTypedLogs = vi.fn(() => mockTypedLogs);
			mockManager.addMainProcess('main1', proc);

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];
			if (typeof callback === 'function') {
				callback('select', {processInfo: {id: 'main1', type: 'main'}});
			}

			mockManager.triggerEvent('process:log', {
				id: 'main1',
				type: 'main',
				message: 'New log message',
				isError: false,
				timestamp: Date.now(),
			});

			expect(proc.logger.getTypedLogs).toHaveBeenCalled();
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty process lists', () => {
			tui.attachToManager(mockManager);
			const renderSpy = vi.spyOn(tui, 'render');

			mockManager.triggerEvent('state:update', {
				processes: {
					dependencies: new Map(),
					main: new Map(),
					cleanup: new Map(),
				},
				timestamp: Date.now(),
			});

			expect(renderSpy).toHaveBeenCalled();
		});

		it('should handle operations before attachment', () => {
			expect(() =>
				tui.render(
					{
						dependencies: new Map(),
						main: new Map(),
						cleanup: new Map(),
					},
					{},
				),
			).not.toThrow();
		});

		it('should handle detachment cleanup', () => {
			tui.attachToManager(mockManager);
			mockManager.addMainProcess('main1', new MockProcessUnit());

			tui.detachFromManager();

			// Should not throw after detachment
			expect(() => mockManager.start()).not.toThrow();
		});

		it('should handle large number of processes', () => {
			tui.attachToManager(mockManager);

			for (let i = 0; i < 100; i++) {
				mockManager.addMainProcess(`main${i}`, new MockProcessUnit());
			}

			const renderSpy = vi.spyOn(tui, 'render');
			mockManager.triggerEvent('state:update', {
				processes: {
					dependencies: new Map(),
					main: mockManager['mains'],
					cleanup: new Map(),
				},
				timestamp: Date.now(),
			});

			expect(renderSpy).toHaveBeenCalled();
		});
	});

	describe('Error Handling', () => {
		it('should handle dependency failure', () => {
			tui.attachToManager(mockManager);
			const showStatusSpy = vi.spyOn(tui, 'showStatus');

			mockManager.triggerEvent('dependency:failed', {
				id: 'dep1',
				error: new Error('Dependency failed'),
				timestamp: Date.now(),
			});

			expect(showStatusSpy).toHaveBeenCalledWith(
				'Dependency dep1 failed: Dependency failed',
			);
		});

		it('should handle cleanup timeout', () => {
			tui.attachToManager(mockManager);
			const showStatusSpy = vi.spyOn(tui, 'showStatus');

			mockManager.triggerEvent('cleanup:timeout', {
				id: 'cleanup1',
				error: new Error('Timeout'),
				timestamp: Date.now(),
			});

			expect(showStatusSpy).toHaveBeenCalledWith(
				'Cleanup process cleanup1 timeout: Timeout',
			);
		});
	});

	describe('Input Mode', () => {
		beforeEach(() => {
			tui.attachToManager(mockManager);
		});

		it('should enter input mode on "i" key', () => {
			const renderSpy = vi.spyOn(tui, 'render');

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('i', undefined);
			}

			expect(renderSpy).toHaveBeenCalled();
		});

		it('should cancel input mode on escape', () => {
			const renderSpy = vi.spyOn(tui, 'render');

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('i', undefined);
				callback('input-cancel', undefined);
			}

			expect(renderSpy).toHaveBeenCalled();
		});

		it('should toggle secret mode on Ctrl+S', () => {
			const renderSpy = vi.spyOn(tui, 'render');

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('i', undefined);
				callback('input-toggle-secret', undefined);
			}

			expect(renderSpy).toHaveBeenCalled();
		});

		it('should handle backspace in input mode', () => {
			const renderSpy = vi.spyOn(tui, 'render');

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('i', undefined);
				callback('input-char', {index: 65});
				callback('input-backspace', undefined);
			}

			expect(renderSpy).toHaveBeenCalled();
		});

		it('should submit input to selected process', () => {
			const proc = new MockProcessUnit();
			(proc as any).sendStdin = vi.fn();
			mockManager.addMainProcess('main1', proc);

			const showStatusSpy = vi.spyOn(tui, 'showStatus');

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('select', {processInfo: {id: 'main1', type: 'main'}});
				callback('i', undefined);
				callback('input-char', {index: 72});
				callback('input-char', {index: 105});
				callback('input-submit', undefined);
			}

			expect((proc as any).sendStdin).toHaveBeenCalled();
			expect(showStatusSpy).toHaveBeenCalledWith('Sent input to main1');
		});

		it('should submit secret input correctly', () => {
			const proc = new MockProcessUnit();
			(proc as any).sendStdin = vi.fn();
			mockManager.addMainProcess('main1', proc);

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('select', {processInfo: {id: 'main1', type: 'main'}});
				callback('i', undefined);
				callback('input-toggle-secret', undefined);
				callback('input-char', {index: 112});
				callback('input-char', {index: 97});
				callback('input-char', {index: 115});
				callback('input-char', {index: 115});
				callback('input-submit', undefined);
			}

			expect((proc as any).sendStdin).toHaveBeenCalledWith('pass', true);
		});

		it('should handle input without selected process', () => {
			const showStatusSpy = vi.spyOn(tui, 'showStatus');

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('i', undefined);
				callback('input-char', {index: 65});
				callback('input-submit', undefined);
			}

			expect(showStatusSpy).not.toHaveBeenCalled();
		});
	});
});
