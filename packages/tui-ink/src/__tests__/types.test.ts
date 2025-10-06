import { describe, it, expect } from 'vitest';
import type {
	ProcessUnitI,
	ProcessManagerEvents,
	OvrseerI,
	TUIProcessType,
	ProcessMap,
	TUIState,
	TUIKeyPressMeta,
	TUIRendererI,
	FlagPanelSize,
} from '../types.js';

describe('TUI-Ink Types', () => {
	describe('TUIProcessType Type', () => {
		it('should allow all valid process type values', () => {
			const types: TUIProcessType[] = ['dependency', 'main', 'cleanup'];

			types.forEach(type => {
				expect(type).toBeDefined();
				expect(typeof type).toBe('string');
			});
		});

		it('should be usable in type guards', () => {
			const isProcessType = (value: string): value is TUIProcessType => {
				return ['dependency', 'main', 'cleanup'].includes(value);
			};

			expect(isProcessType('main')).toBe(true);
			expect(isProcessType('invalid')).toBe(false);
		});
	});

	describe('FlagPanelSize Type', () => {
		it('should allow valid size values', () => {
			const sizes: FlagPanelSize[] = ['collapsed', 'expanded'];

			sizes.forEach(size => {
				expect(size).toBeDefined();
				expect(typeof size).toBe('string');
			});
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

		it('should allow adding multiple entries', () => {
			const map: ProcessMap = {
				dependencies: new Map(),
				main: new Map(),
				cleanup: new Map(),
			};

			const mockProcess = {} as ProcessUnitI;
			map.main.set('proc1', mockProcess);
			map.main.set('proc2', mockProcess);
			map.dependencies.set('dep1', mockProcess);

			expect(map.main.size).toBe(2);
			expect(map.dependencies.size).toBe(1);
		});

		it('should handle empty maps', () => {
			const map: ProcessMap = {
				dependencies: new Map(),
				main: new Map(),
				cleanup: new Map(),
			};

			expect(map.dependencies.size).toBe(0);
			expect(map.main.size).toBe(0);
			expect(map.cleanup.size).toBe(0);
		});

		it('should allow large number of entries', () => {
			const map: ProcessMap = {
				dependencies: new Map(),
				main: new Map(),
				cleanup: new Map(),
			};

			const mockProcess = {} as ProcessUnitI;
			for (let i = 0; i < 1000; i++) {
				map.main.set(`proc${i}`, mockProcess);
			}

			expect(map.main.size).toBe(1000);
		});
	});

	describe('TUIState Type', () => {
		it('should accept minimal state', () => {
			const state: TUIState = {};

			expect(state).toBeDefined();
		});

		it('should accept full state with all properties', () => {
			const state: TUIState = {
				selectedProcessId: 'test-process',
				selectedProcessType: 'main',
				showHelp: true,
				logScrollOffset: 50,
				filter: 'error',
				flagPanelSize: 'expanded',
				flagPanelFocused: true,
				selectedFlagNode: 'flag:error-flag',
				expandedFlagNodes: new Set(['flag:warning', 'flag:error']),
				matchContextVisible: new Set(['flag:error:match:0']),
			};

			expect(state.selectedProcessId).toBe('test-process');
			expect(state.selectedProcessType).toBe('main');
			expect(state.showHelp).toBe(true);
			expect(state.logScrollOffset).toBe(50);
			expect(state.filter).toBe('error');
			expect(state.flagPanelSize).toBe('expanded');
			expect(state.flagPanelFocused).toBe(true);
			expect(state.selectedFlagNode).toBe('flag:error-flag');
			expect(state.expandedFlagNodes?.size).toBe(2);
			expect(state.matchContextVisible?.size).toBe(1);
		});

		it('should accept null selectedProcessId', () => {
			const state: TUIState = {
				selectedProcessId: null,
			};

			expect(state.selectedProcessId).toBeNull();
		});

		it('should accept undefined selectedProcessId', () => {
			const state: TUIState = {
				selectedProcessId: undefined,
			};

			expect(state.selectedProcessId).toBeUndefined();
		});

		it('should accept zero logScrollOffset', () => {
			const state: TUIState = {
				logScrollOffset: 0,
			};

			expect(state.logScrollOffset).toBe(0);
		});

		it('should accept negative logScrollOffset', () => {
			const state: TUIState = {
				logScrollOffset: -100,
			};

			expect(state.logScrollOffset).toBe(-100);
		});

		it('should accept very large logScrollOffset', () => {
			const state: TUIState = {
				logScrollOffset: 999999,
			};

			expect(state.logScrollOffset).toBe(999999);
		});

		it('should accept empty filter', () => {
			const state: TUIState = {
				filter: '',
			};

			expect(state.filter).toBe('');
		});

		it('should accept empty sets for flag state', () => {
			const state: TUIState = {
				expandedFlagNodes: new Set(),
				matchContextVisible: new Set(),
			};

			expect(state.expandedFlagNodes?.size).toBe(0);
			expect(state.matchContextVisible?.size).toBe(0);
		});

		it('should accept collapsed flag panel', () => {
			const state: TUIState = {
				flagPanelSize: 'collapsed',
				flagPanelFocused: false,
			};

			expect(state.flagPanelSize).toBe('collapsed');
			expect(state.flagPanelFocused).toBe(false);
		});
	});

	describe('TUIKeyPressMeta Type', () => {
		it('should accept minimal meta', () => {
			const meta: TUIKeyPressMeta = {};

			expect(meta).toBeDefined();
		});

		it('should accept index only', () => {
			const meta: TUIKeyPressMeta = {
				index: 5,
			};

			expect(meta.index).toBe(5);
		});

		it('should accept processInfo only', () => {
			const meta: TUIKeyPressMeta = {
				processInfo: {
					id: 'test-process',
					type: 'main',
				},
			};

			expect(meta.processInfo?.id).toBe('test-process');
			expect(meta.processInfo?.type).toBe('main');
		});

		it('should accept both index and processInfo', () => {
			const meta: TUIKeyPressMeta = {
				index: 0,
				processInfo: {
					id: 'dep1',
					type: 'dependency',
				},
			};

			expect(meta.index).toBe(0);
			expect(meta.processInfo?.id).toBe('dep1');
		});

		it('should accept zero index', () => {
			const meta: TUIKeyPressMeta = {
				index: 0,
			};

			expect(meta.index).toBe(0);
		});

		it('should accept large index', () => {
			const meta: TUIKeyPressMeta = {
				index: 10000,
			};

			expect(meta.index).toBe(10000);
		});

		it('should accept special characters in process id', () => {
			const meta: TUIKeyPressMeta = {
				processInfo: {
					id: 'test-process-123_@#',
					type: 'main',
				},
			};

			expect(meta.processInfo?.id).toContain('_@#');
		});
	});

	describe('TUIRendererI Interface', () => {
		it('should define required methods', () => {
			const renderer: TUIRendererI = {
				init: () => { },
				destroy: () => { },
				render: () => { },
				onKeyPress: () => { },
				showLogs: () => { },
				showStatus: () => { },
				selectPrevious: () => { },
				selectNext: () => { },
			};

			expect(typeof renderer.init).toBe('function');
			expect(typeof renderer.destroy).toBe('function');
			expect(typeof renderer.render).toBe('function');
			expect(typeof renderer.onKeyPress).toBe('function');
			expect(typeof renderer.showLogs).toBe('function');
			expect(typeof renderer.showStatus).toBe('function');
			expect(typeof renderer.selectPrevious).toBe('function');
			expect(typeof renderer.selectNext).toBe('function');
		});

		it('should define optional showInstructions method', () => {
			const renderer: TUIRendererI = {
				init: () => { },
				destroy: () => { },
				render: () => { },
				onKeyPress: () => { },
				showLogs: () => { },
				showStatus: () => { },
				showInstructions: () => { },
				selectPrevious: () => { },
				selectNext: () => { },
			};

			expect(typeof renderer.showInstructions).toBe('function');
		});

		it('should accept implementation without showInstructions', () => {
			const renderer: TUIRendererI = {
				init: () => { },
				destroy: () => { },
				render: () => { },
				onKeyPress: () => { },
				showLogs: () => { },
				showStatus: () => { },
				selectPrevious: () => { },
				selectNext: () => { },
			};

			expect(renderer.showInstructions).toBeUndefined();
		});
	});

	describe('ProcessManagerEvents Type', () => {
		it('should define all manager events', () => {
			const events: Array<keyof ProcessManagerEvents> = [
				'manager:started',
				'manager:stopping',
				'manager:stopped',
				'manager:restarting',
				'process:added',
				'process:removed',
				'process:started',
				'process:stopping',
				'process:stopped',
				'process:ready',
				'process:crashed',
				'process:restarting',
				'status:message',
				'dependency:failed',
				'cleanup:started',
				'cleanup:finished',
				'cleanup:timeout',
				'state:update',
				'process:log',
			];

			expect(events.length).toBeGreaterThan(0);
		});

		it('should have correct event data structure for state:update', () => {
			const event: ProcessManagerEvents['state:update'] = {
				processes: {
					dependencies: new Map(),
					main: new Map(),
					cleanup: new Map(),
				},
				timestamp: Date.now(),
			};

			expect(event.processes).toBeDefined();
			expect(event.timestamp).toBeGreaterThan(0);
		});

		it('should have correct event data structure for process:log', () => {
			const event: ProcessManagerEvents['process:log'] = {
				id: 'test-proc',
				type: 'main',
				message: 'Log message',
				isError: false,
				timestamp: Date.now(),
			};

			expect(event.id).toBe('test-proc');
			expect(event.type).toBe('main');
			expect(event.message).toBe('Log message');
			expect(event.isError).toBe(false);
		});

		it('should accept error logs', () => {
			const event: ProcessManagerEvents['process:log'] = {
				id: 'test-proc',
				type: 'main',
				message: 'Error occurred',
				isError: true,
				timestamp: Date.now(),
			};

			expect(event.isError).toBe(true);
		});

		it('should accept empty log message', () => {
			const event: ProcessManagerEvents['process:log'] = {
				id: 'test-proc',
				type: 'main',
				message: '',
				isError: false,
				timestamp: Date.now(),
			};

			expect(event.message).toBe('');
		});

		it('should accept very long log message', () => {
			const longMessage = 'x'.repeat(100000);
			const event: ProcessManagerEvents['process:log'] = {
				id: 'test-proc',
				type: 'main',
				message: longMessage,
				isError: false,
				timestamp: Date.now(),
			};

			expect(event.message.length).toBe(100000);
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty strings in process IDs', () => {
			const meta: TUIKeyPressMeta = {
				processInfo: {
					id: '',
					type: 'main',
				},
			};

			expect(meta.processInfo?.id).toBe('');
		});

		it('should handle unicode in process IDs', () => {
			const meta: TUIKeyPressMeta = {
				processInfo: {
					id: '测试-プロセス-🚀',
					type: 'main',
				},
			};

			expect(meta.processInfo?.id).toContain('🚀');
		});

		it('should handle special characters in filter', () => {
			const state: TUIState = {
				filter: '.*[ERROR].*',
			};

			expect(state.filter).toContain('[ERROR]');
		});

		it('should handle very long selectedFlagNode', () => {
			const longNodeId = 'flag:' + 'x'.repeat(1000) + ':match:999';
			const state: TUIState = {
				selectedFlagNode: longNodeId,
			};

			expect(state.selectedFlagNode?.length).toBeGreaterThan(1000);
		});

		it('should handle large sets in TUIState', () => {
			const largeSet = new Set<string>();
			for (let i = 0; i < 10000; i++) {
				largeSet.add(`flag:flag${i}`);
			}

			const state: TUIState = {
				expandedFlagNodes: largeSet,
			};

			expect(state.expandedFlagNodes?.size).toBe(10000);
		});

		it('should handle all process types in one map', () => {
			const map: ProcessMap = {
				dependencies: new Map(),
				main: new Map(),
				cleanup: new Map(),
			};

			const mockProcess = {} as ProcessUnitI;

			['dependency', 'main', 'cleanup'].forEach((type, idx) => {
				const targetMap =
					type === 'dependency'
						? map.dependencies
						: type === 'main'
							? map.main
							: map.cleanup;
				targetMap.set(`proc${idx}`, mockProcess);
			});

			expect(map.dependencies.size).toBe(1);
			expect(map.main.size).toBe(1);
			expect(map.cleanup.size).toBe(1);
		});
	});

	describe('Type Compatibility', () => {
		it('should allow TUIState in arrays', () => {
			const states: TUIState[] = [
				{ selectedProcessId: 'proc1' },
				{ selectedProcessId: 'proc2', selectedProcessType: 'main' },
				{ showHelp: true },
			];

			expect(states).toHaveLength(3);
		});

		it('should allow ProcessMap manipulation', () => {
			const map: ProcessMap = {
				dependencies: new Map(),
				main: new Map(),
				cleanup: new Map(),
			};

			const mockProcess = {} as ProcessUnitI;
			map.main.set('test', mockProcess);

			const retrieved = map.main.get('test');
			expect(retrieved).toBe(mockProcess);

			map.main.delete('test');
			expect(map.main.has('test')).toBe(false);
		});

		it('should allow event handler type inference', () => {
			type EventHandler<K extends keyof ProcessManagerEvents> = (
				event: K,
				data: ProcessManagerEvents[K],
			) => void;

			const handler: EventHandler<'process:log'> = (event, data) => {
				expect(event).toBe('process:log');
				expect(data.message).toBeDefined();
			};

			handler('process:log', {
				id: 'test',
				type: 'main',
				message: 'test',
				isError: false,
				timestamp: Date.now(),
			});
		});
	});
});
