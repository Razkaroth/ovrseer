import {describe, it, expect, vi, beforeEach} from 'vitest';
import {ProcessLogger} from '@ovrseer/core';
import type {ProcessUnitI, ProcessMap, OvrseerI} from '../types.js';
import {InkTUI} from '../InkTUI.js';

const createMockProcess = (logger?: ProcessLogger): ProcessUnitI => {
	const mockLogger = logger ?? new ProcessLogger(1000, 100);
	return {
		logger: mockLogger,
		ready: Promise.resolve(),
		finished: Promise.resolve(),
		start: vi.fn(),
		stop: vi.fn(),
		kill: vi.fn(),
		isRunning: () => false,
		getStatus: () => 'stopped' as const,
		runReadyChecks: vi.fn().mockResolvedValue(undefined),
		prepareForRestart: vi.fn(),
		restart: vi.fn(),
		cleanup: vi.fn(),
		onExit: vi.fn(),
		onCrash: vi.fn(),
		onReady: vi.fn(),
	};
};

const createMockManager = (): OvrseerI => {
	const listeners = new Map<string, Array<(data: any) => void>>();

	return {
		addDependency: vi.fn(),
		removeDependency: vi.fn(),
		getDependency: vi.fn(),
		addMainProcess: vi.fn(),
		removeMainProcess: vi.fn(),
		getMainProcess: vi.fn(),
		addCleanupProcess: vi.fn(),
		removeCleanupProcess: vi.fn(),
		getCleanupProcess: vi.fn(),
		start: vi.fn(),
		stop: vi.fn().mockResolvedValue(undefined),
		restartProcess: vi.fn(),
		restartAll: vi.fn(),
		restartAllMainProcesses: vi.fn(),
		on: vi.fn((event: string, listener: (data: any) => void) => {
			if (!listeners.has(event)) {
				listeners.set(event, []);
			}
			listeners.get(event)!.push(listener);
		}),
		addEventListener: vi.fn(),
		off: vi.fn(),
		removeEventListener: vi.fn(),
	};
};

describe('InkTUI - Flag State Management', () => {
	let tui: InkTUI;
	let mockManager: OvrseerI;
	let mockProcess: ProcessUnitI;
	let logger: ProcessLogger;

	beforeEach(() => {
		mockManager = createMockManager();
		logger = new ProcessLogger(1000, 100);
		mockProcess = createMockProcess(logger);

		logger.addFlag('test-flag', {
			pattern: /test/i,
			color: 'green',
			contextWindowSize: 3,
		});

		logger.addFlag('error-flag', {
			pattern: /error/i,
			color: 'red',
			targetCount: 0,
		});

		logger.addChunk('This is a test line');
		logger.addChunk('Another line here');
		logger.addChunk('Error occurred here');

		tui = new InkTUI();
		tui.attachToManager(mockManager);

		const processes: ProcessMap = {
			dependencies: new Map(),
			main: new Map([['test-process', mockProcess]]),
			cleanup: new Map(),
		};

		const stateUpdateListener = (mockManager.on as any).mock.calls.find(
			(call: any[]) => call[0] === 'state:update',
		)?.[1];

		if (stateUpdateListener) {
			stateUpdateListener({processes, timestamp: Date.now()});
		}

		const selectCallback = (tui as any).keyPressCallback;
		if (selectCallback) {
			selectCallback('select', {
				processInfo: {id: 'test-process', type: 'main'},
			});
		}
	});

	it('should toggle flag panel from collapsed to expanded', () => {
		const initialState = (tui as any).managedState;
		expect(initialState.flagPanelSize).toBe('collapsed');

		const keyHandler = (tui as any).keyPressCallback;
		keyHandler('f');

		const updatedState = (tui as any).managedState;
		expect(updatedState.flagPanelSize).toBe('expanded');
		expect(updatedState.flagPanelFocused).toBe(true);
	});

	it('should toggle flag panel from expanded to collapsed', () => {
		const keyHandler = (tui as any).keyPressCallback;
		keyHandler('f');
		expect((tui as any).managedState.flagPanelSize).toBe('expanded');

		keyHandler('f');
		expect((tui as any).managedState.flagPanelSize).toBe('collapsed');
		expect((tui as any).managedState.flagPanelFocused).toBe(false);
	});

	it('should select first flag node when panel is expanded', () => {
		const keyHandler = (tui as any).keyPressCallback;
		keyHandler('f');

		const state = (tui as any).managedState;
		expect(state.flagPanelSize).toBe('expanded');
		expect(state.selectedFlagNode).toBeDefined();
		expect(state.selectedFlagNode).toMatch(/^flag:/);
	});

	it('should navigate down when flag-down is pressed', () => {
		const keyHandler = (tui as any).keyPressCallback;
		keyHandler('f');
		const firstNode = (tui as any).managedState.selectedFlagNode;

		keyHandler('flag-down');
		const secondNode = (tui as any).managedState.selectedFlagNode;

		expect(secondNode).not.toBe(firstNode);
	});

	it('should navigate up when flag-up is pressed', () => {
		const keyHandler = (tui as any).keyPressCallback;
		keyHandler('f');
		keyHandler('flag-down');
		const secondNode = (tui as any).managedState.selectedFlagNode;

		keyHandler('flag-up');
		const firstNode = (tui as any).managedState.selectedFlagNode;

		expect(firstNode).not.toBe(secondNode);
	});

	it('should expand and collapse flag nodes when enter is pressed', () => {
		const keyHandler = (tui as any).keyPressCallback;
		keyHandler('f');
		const flagNode = (tui as any).managedState.selectedFlagNode;

		keyHandler('flag-enter');
		expect((tui as any).managedState.expandedFlagNodes.has(flagNode)).toBe(
			true,
		);

		keyHandler('flag-enter');
		expect((tui as any).managedState.expandedFlagNodes.has(flagNode)).toBe(
			false,
		);
	});

	it('should reset flag panel when switching processes', () => {
		const stateUpdateListener = (mockManager.on as any).mock.calls.find(
			(call: any[]) => call[0] === 'state:update',
		)?.[1];

		const processes: ProcessMap = {
			dependencies: new Map(),
			main: new Map([
				['test-process', mockProcess],
				['other-process', createMockProcess()],
			]),
			cleanup: new Map(),
		};

		stateUpdateListener({processes, timestamp: Date.now()});

		const keyHandler = (tui as any).keyPressCallback;
		keyHandler('f');
		expect((tui as any).managedState.flagPanelSize).toBe('expanded');

		keyHandler('select', {
			processInfo: {id: 'other-process', type: 'main'},
		});

		const state = (tui as any).managedState;
		expect(state.flagPanelSize).toBe('collapsed');
		expect(state.flagPanelFocused).toBe(false);
		expect(state.selectedFlagNode).toBeUndefined();
	});

	it('should not crash when toggling panel with no flags', () => {
		const emptyLogger = new ProcessLogger(1000, 100);
		const emptyProcess = createMockProcess(emptyLogger);

		const stateUpdateListener = (mockManager.on as any).mock.calls.find(
			(call: any[]) => call[0] === 'state:update',
		)?.[1];

		const processes: ProcessMap = {
			dependencies: new Map(),
			main: new Map([['empty-process', emptyProcess]]),
			cleanup: new Map(),
		};

		stateUpdateListener({processes, timestamp: Date.now()});

		const keyHandler = (tui as any).keyPressCallback;
		keyHandler('select', {
			processInfo: {id: 'empty-process', type: 'main'},
		});

		expect(() => keyHandler('f')).not.toThrow();
		expect((tui as any).managedState.flagPanelSize).toBe('expanded');
	});

	it('should not navigate when panel is not focused', () => {
		const keyHandler = (tui as any).keyPressCallback;

		const initialNode = (tui as any).managedState.selectedFlagNode;
		keyHandler('flag-down');
		const afterNode = (tui as any).managedState.selectedFlagNode;

		expect(afterNode).toBe(initialNode);
	});

	it('should toggle context window for match nodes', () => {
		const keyHandler = (tui as any).keyPressCallback;
		keyHandler('f');

		const state = (tui as any).managedState;
		const flagNode = 'flag:test-flag';
		state.selectedFlagNode = flagNode;
		keyHandler('flag-enter');
		expect(state.expandedFlagNodes.has(flagNode)).toBe(true);

		const matchNode = 'flag:test-flag:match:0';
		state.selectedFlagNode = matchNode;
		expect(state.matchContextVisible).toBeUndefined();

		keyHandler('flag-enter');
		expect(state.matchContextVisible?.has(matchNode)).toBe(true);

		keyHandler('flag-enter');
		expect(state.matchContextVisible?.has(matchNode)).toBe(false);
	});

	it('should initialize matchContextVisible set when toggling context', () => {
		const keyHandler = (tui as any).keyPressCallback;
		keyHandler('f');

		const state = (tui as any).managedState;
		const flagNode = 'flag:test-flag';
		state.selectedFlagNode = flagNode;
		keyHandler('flag-enter');

		const matchNode = 'flag:test-flag:match:0';
		state.selectedFlagNode = matchNode;
		state.matchContextVisible = undefined;

		keyHandler('flag-enter');
		expect(state.matchContextVisible).toBeInstanceOf(Set);
		expect(state.matchContextVisible?.has(matchNode)).toBe(true);
	});
});
