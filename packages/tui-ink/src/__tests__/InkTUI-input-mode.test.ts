import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {InkTUI} from '../InkTUI.js';
import type {
	OvrseerI,
	ProcessUnitI,
	ProcessManagerEvents,
	TUIProcessType,
	LogEntry,
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
	restartAllMainProcesses(): void {}
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
	sendStdin(processId: string, input: string, secret?: boolean): void {
		const proc =
			this.mains.get(processId) ??
			this.deps.get(processId) ??
			this.cleanups.get(processId);
		if (proc && typeof (proc as any).sendStdin === 'function') {
			(proc as any).sendStdin(input, secret);
		}
	}
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
	sendStdinCalls: Array<{input: string; secret: boolean}> = [];

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
	sendStdin(input: string, secret: boolean = false): void {
		this.sendStdinCalls.push({input, secret});
	}
}

describe('InkTUI - Input Mode', () => {
	let tui: InkTUI;
	let mockManager: MockOvrseer;
	let mockProcess: MockProcessUnit;

	beforeEach(() => {
		tui = new InkTUI();
		mockManager = new MockOvrseer();
		mockProcess = new MockProcessUnit();
		tui.attachToManager(mockManager);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('Entering and Exiting Input Mode', () => {
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

		it('should initialize input state when entering input mode', () => {
			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('i', undefined);
			}

			// Check that managedState has been updated
			expect(tui.managedState.inputMode).toBe(true);
			expect(tui.managedState.inputValue).toBe('');
			expect(tui.managedState.inputSecretMode).toBe(false);
		});

		it('should exit input mode on cancel', () => {
			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('i', undefined);
				expect(tui.managedState.inputMode).toBe(true);

				callback('input-cancel', undefined);
				expect(tui.managedState.inputMode).toBe(false);
			}
		});

		it('should clear input value when exiting input mode', () => {
			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('i', undefined);
				callback('input-char', {index: 65}); // 'A'
				callback('input-char', {index: 66}); // 'B'

				expect(tui.managedState.inputValue).toBe('AB');

				callback('input-cancel', undefined);
				expect(tui.managedState.inputValue).toBe('');
			}
		});
	});

	describe('Input Character Handling', () => {
		it('should accumulate characters in input mode', () => {
			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('i', undefined);
				callback('input-char', {index: 72}); // 'H'
				callback('input-char', {index: 101}); // 'e'
				callback('input-char', {index: 108}); // 'l'
				callback('input-char', {index: 108}); // 'l'
				callback('input-char', {index: 111}); // 'o'

				expect(tui.managedState.inputValue).toBe('Hello');
			}
		});

		it('should handle backspace to remove characters', () => {
			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('i', undefined);
				callback('input-char', {index: 65}); // 'A'
				callback('input-char', {index: 66}); // 'B'
				callback('input-char', {index: 67}); // 'C'

				expect(tui.managedState.inputValue).toBe('ABC');

				callback('input-backspace', undefined);
				expect(tui.managedState.inputValue).toBe('AB');

				callback('input-backspace', undefined);
				expect(tui.managedState.inputValue).toBe('A');
			}
		});

		it('should handle backspace on empty input', () => {
			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('i', undefined);
				callback('input-backspace', undefined);

				expect(tui.managedState.inputValue).toBe('');
			}
		});

		it('should handle special characters', () => {
			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('i', undefined);
				callback('input-char', {index: 33}); // '\!'
				callback('input-char', {index: 64}); // '@'
				callback('input-char', {index: 35}); // '#'

				expect(tui.managedState.inputValue).toBe('\!@#');
			}
		});
	});

	describe('Secret Mode Toggle', () => {
		it('should toggle secret mode on Ctrl+S', () => {
			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('i', undefined);
				expect(tui.managedState.inputSecretMode).toBe(false);

				callback('input-toggle-secret', undefined);
				expect(tui.managedState.inputSecretMode).toBe(true);

				callback('input-toggle-secret', undefined);
				expect(tui.managedState.inputSecretMode).toBe(false);
			}
		});

		it('should maintain input value when toggling secret mode', () => {
			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('i', undefined);
				callback('input-char', {index: 112}); // 'p'
				callback('input-char', {index: 97}); // 'a'
				callback('input-char', {index: 115}); // 's'
				callback('input-char', {index: 115}); // 's'

				const valueBeforeToggle = tui.managedState.inputValue;
				callback('input-toggle-secret', undefined);
				const valueAfterToggle = tui.managedState.inputValue;

				expect(valueBeforeToggle).toBe(valueAfterToggle);
				expect(valueAfterToggle).toBe('pass');
			}
		});
	});

	describe('Submitting Input', () => {
		it('should send input to selected process on submit', () => {
			mockManager.addMainProcess('main1', mockProcess);

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('select', {processInfo: {id: 'main1', type: 'main'}});
				callback('i', undefined);
				callback('input-char', {index: 116}); // 't'
				callback('input-char', {index: 101}); // 'e'
				callback('input-char', {index: 115}); // 's'
				callback('input-char', {index: 116}); // 't'
				callback('input-submit', undefined);
			}

			expect(mockProcess.sendStdinCalls).toHaveLength(1);
			expect(mockProcess.sendStdinCalls[0].input).toBe('test');
			expect(mockProcess.sendStdinCalls[0].secret).toBe(false);
		});

		it('should send secret input correctly', () => {
			mockManager.addMainProcess('main1', mockProcess);

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('select', {processInfo: {id: 'main1', type: 'main'}});
				callback('i', undefined);
				callback('input-toggle-secret', undefined);
				callback('input-char', {index: 115}); // 's'
				callback('input-char', {index: 101}); // 'e'
				callback('input-char', {index: 99}); // 'c'
				callback('input-char', {index: 114}); // 'r'
				callback('input-char', {index: 101}); // 'e'
				callback('input-char', {index: 116}); // 't'
				callback('input-submit', undefined);
			}

			expect(mockProcess.sendStdinCalls).toHaveLength(1);
			expect(mockProcess.sendStdinCalls[0].input).toBe('secret');
			expect(mockProcess.sendStdinCalls[0].secret).toBe(true);
		});

		it('should exit input mode after submit', () => {
			mockManager.addMainProcess('main1', mockProcess);

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('select', {processInfo: {id: 'main1', type: 'main'}});
				callback('i', undefined);
				expect(tui.managedState.inputMode).toBe(true);

				callback('input-char', {index: 116}); // 't'
				callback('input-submit', undefined);

				expect(tui.managedState.inputMode).toBe(false);
			}
		});

		it('should clear input value after submit', () => {
			mockManager.addMainProcess('main1', mockProcess);

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('select', {processInfo: {id: 'main1', type: 'main'}});
				callback('i', undefined);
				callback('input-char', {index: 116}); // 't'
				callback('input-char', {index: 101}); // 'e'

				expect(tui.managedState.inputValue).toBe('te');

				callback('input-submit', undefined);

				expect(tui.managedState.inputValue).toBe('');
			}
		});

		it('should handle submit without selected process', () => {
			const showStatusSpy = vi.spyOn(tui, 'showStatus');

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('i', undefined);
				callback('input-char', {index: 116}); // 't'
				callback('input-submit', undefined);
			}

			expect(showStatusSpy).not.toHaveBeenCalledWith(
				expect.stringContaining('Sent input'),
			);
		});

		it('should handle submit with empty input', () => {
			mockManager.addMainProcess('main1', mockProcess);

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('select', {processInfo: {id: 'main1', type: 'main'}});
				callback('i', undefined);
				callback('input-submit', undefined);
			}

			expect(mockProcess.sendStdinCalls).toHaveLength(1);
			expect(mockProcess.sendStdinCalls[0].input).toBe('');
		});

		it('should show error message when sendStdin fails', () => {
			const failingProcess = new MockProcessUnit();
			failingProcess.sendStdin = vi.fn(() => {
				throw new Error('Process not running');
			});

			mockManager.addMainProcess('main1', failingProcess);
			const showStatusSpy = vi.spyOn(tui, 'showStatus');

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('select', {processInfo: {id: 'main1', type: 'main'}});
				callback('i', undefined);
				callback('input-char', {index: 116}); // 't'
				callback('input-submit', undefined);
			}

			expect(showStatusSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to send input'),
			);
		});
	});

	describe('Input Mode with Different Process Types', () => {
		it('should send input to dependency process', () => {
			const depProcess = new MockProcessUnit();
			mockManager.addDependency('dep1', depProcess);

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('select', {processInfo: {id: 'dep1', type: 'dependency'}});
				callback('i', undefined);
				callback('input-char', {index: 116}); // 't'
				callback('input-submit', undefined);
			}

			expect(depProcess.sendStdinCalls).toHaveLength(1);
			expect(depProcess.sendStdinCalls[0].input).toBe('t');
		});

		it('should send input to cleanup process', () => {
			const cleanupProcess = new MockProcessUnit();
			mockManager.addCleanupProcess('cleanup1', cleanupProcess);

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('select', {processInfo: {id: 'cleanup1', type: 'cleanup'}});
				callback('i', undefined);
				callback('input-char', {index: 116}); // 't'
				callback('input-submit', undefined);
			}

			expect(cleanupProcess.sendStdinCalls).toHaveLength(1);
			expect(cleanupProcess.sendStdinCalls[0].input).toBe('t');
		});
	});

	describe('Input Mode State Management', () => {
		it('should reset secret mode after submit', () => {
			mockManager.addMainProcess('main1', mockProcess);

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				callback('select', {processInfo: {id: 'main1', type: 'main'}});
				callback('i', undefined);
				callback('input-toggle-secret', undefined);

				expect(tui.managedState.inputSecretMode).toBe(true);

				callback('input-char', {index: 116}); // 't'
				callback('input-submit', undefined);

				expect(tui.managedState.inputSecretMode).toBe(false);
			}
		});

		it('should not interfere with normal key handling when not in input mode', () => {
			mockManager.addMainProcess('main1', mockProcess);

			const handler = vi.fn();
			tui.onKeyPress(handler);
			const callback = handler.mock.calls[0]?.[0];

			if (typeof callback === 'function') {
				// Not in input mode - these should work normally
				callback('select', {processInfo: {id: 'main1', type: 'main'}});
				expect(tui.managedState.selectedProcessId).toBe('main1');

				// Entering a log view
				callback('enter', undefined);
			}

			// Verify normal operations still work
			expect(tui.managedState.selectedProcessId).toBe('main1');
		});
	});
});