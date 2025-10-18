import {OvrseerI, OvrseerWorkTree, ProcessUnitI} from '@ovrseer/core';
import {create} from 'zustand';

// type Focus = 'Main' | 'Logs' | 'status-bar' | 'Worktree';

export enum Focus {
	Main = 'Main',
	Logs = 'Logs',
	StatusBar = 'Status Bar',
	Worktree = 'Worktree',
}

type State = 'loading' | 'success' | 'warning' | 'error' | 'pending';

export type ProcessStatus = {
	label: string;
	state: State;
	status: string;
};

const GlobalInstructions: {name: string; description: string}[] = [
	{
		name: '<Tab>',
		description: 'Switch between panels',
	},
];

const Instructions: Record<Focus, {name: string; description: string}[]> = {
	Main: [
		{
			name: 's',
			description: 'Start all processes',
		},
		{
			name: 'r',
			description: 'Restart all processes',
		},
		{
			name: 'S',
			description: 'Stop all processes',
		},
		{
			name: 'q',
			description: 'Stop all and quit',
		},
	],
	Logs: [
		{
			name: '↑ ↓',
			description: 'Scroll up and down in the logs',
		},
	],
	'Status Bar': [
		{
			name: '↑ ↓',
			description: 'Scroll up and down in the status bar',
		},
	],
	Worktree: [
		{
			name: '↑ ↓',
			description: 'Scroll up and down in the worktree',
		},
		{
			name: '↵',
			description: 'Start the selected process',
		},
		{
			name: '⌫',
			description: 'Stop the selected process',
		},
		{
			name: 'r',
			description: 'Restart the selected process (Ctrl+R)',
		},
	],
};

export interface OvrseerState {
	ovrseer: OvrseerI | null;
	worktree: OvrseerWorkTree | null;

	currentProcessId: string | null;
	currentProcessUnit: ProcessUnitI | null;

	// Process States
	processStates: Map<string, ProcessStatus>;
	messages: {message: string; timestamp: number}[];

	// Instructions
	globalInstructions: {name: string; description: string}[];
	currentFocus: Focus;
	currentInstructions: {name: string; description: string}[];
	// Setters
	setOvrseer: (ovrseer: OvrseerI) => void;
	start: () => void;
	stop: () => Promise<void>;
	restart: () => void;
	restartSingle: (id: string) => void;
	stopSingle: (id: string) => void;
	setCurrentProcessId: (id: string) => void;
	setCurrentFocus: (focus: Focus) => void;
	updateProcessState: (id: string, status: ProcessStatus) => void;
}

export const useOvrseer = create<OvrseerState>()(set => ({
	ovrseer: null,
	worktree: null,
	currentProcessId: null,
	currentProcessUnit: null,
	currentFocus: Focus.Main,
	globalInstructions: GlobalInstructions,
	currentInstructions: Instructions[Focus.Main],
	processStates: new Map(),
	messages: [],

	// Setters
	setOvrseer: (ovrseer: OvrseerI) => {
		// We start with the first dependency as the current process
		const worktree = ovrseer.getCurrentWorkTree();
		const firstDependency = worktree.dependencies.keys().next().value;
		if (!firstDependency) return;

		// Initialize process states
		const processStates = new Map<string, ProcessStatus>();
		const initializeProcessIds = (ids?: readonly string[] | null) => {
			if (!ids) return;
			for (const id of ids) {
				processStates.set(id, {
					label: id,
					state: 'pending',
					status: 'Waiting to start',
				});
			}
		};

		initializeProcessIds(worktree.dependenciesIds);
		initializeProcessIds(worktree.mainIds);
		initializeProcessIds(worktree.cleanupIds);

		// Set up event listeners for process lifecycle
		ovrseer.on('process:started', ({id}) => {
			set(state => {
				const newProcessStates = new Map(state.processStates);
				newProcessStates.set(id, {
					label: id,
					state: 'loading',
					status: 'Starting...',
				});
				return {
					...state,
					processStates: newProcessStates,
				};
			});
		});

		ovrseer.on('process:ready', ({id}) => {
			set(state => {
				const newProcessStates = new Map(state.processStates);
				newProcessStates.set(id, {
					label: id,
					state: 'success',
					status: 'Ready',
				});
				return {
					...state,
					processStates: newProcessStates,
				};
			});
		});

		ovrseer.on('process:stopping', ({id}) => {
			set(state => {
				const newProcessStates = new Map(state.processStates);
				newProcessStates.set(id, {
					label: id,
					state: 'warning',
					status: 'Stopping...',
				});
				return {
					...state,
					processStates: newProcessStates,
				};
			});
		});

		ovrseer.on('process:stopped', ({id, code, signal}) => {
			set(state => {
				const newProcessStates = new Map(state.processStates);
				const statusText =
					code === 0
						? 'Stopped'
						: `Stopped (code: ${code ?? 'N/A'}, signal: ${signal ?? 'N/A'})`;
				newProcessStates.set(id, {
					label: id,
					state: code === 0 ? 'success' : 'warning',
					status: statusText,
				});
				return {
					...state,
					processStates: newProcessStates,
				};
			});
		});

		ovrseer.on('process:crashed', ({id, error, retryCount}) => {
			set(state => {
				const newProcessStates = new Map(state.processStates);
				const statusText =
					retryCount !== undefined
						? `Crashed (retry ${retryCount}): ${error.message}`
						: `Crashed: ${error.message}`;
				newProcessStates.set(id, {
					label: id,
					state: 'error',
					status: statusText,
				});
				return {
					...state,
					processStates: newProcessStates,
				};
			});
		});

		ovrseer.on('process:restarting', ({id}) => {
			set(state => {
				const newProcessStates = new Map(state.processStates);
				newProcessStates.set(id, {
					label: id,
					state: 'loading',
					status: 'Restarting...',
				});
				return {
					...state,
					processStates: newProcessStates,
				};
			});
		});
		ovrseer.on('status:message', ({message}) => {
			set(state => {
				const newMessages = state.messages.concat({
					message,
					timestamp: Date.now(),
				});
				return {
					...state,
					messages: newMessages,
				};
			});
		});

		set(state => {
			return {
				...state,
				ovrseer,
				worktree,
				currentProcessId: firstDependency,
				currentProcessUnit: worktree.dependencies.get(firstDependency),
				processStates,
			};
		});
	},

	setCurrentFocus: (focus: Focus) => {
		set(state => {
			return {
				...state,
				currentFocus: focus,
				currentInstructions: Instructions[focus],
			};
		});
	},

	start() {
		if (!this.ovrseer) return;
		this.ovrseer.start();
	},

	async stop() {
		if (!this.ovrseer) return;
		await this.ovrseer.stop();
	},

	restart() {
		if (!this.ovrseer) return;
		this.ovrseer.restartAll();
	},

	restartSingle(id: string) {
		if (!this.ovrseer) return;
		this.ovrseer.restartProcess(id);
	},

	stopSingle(id: string) {
		if (!this.ovrseer) return;
		this.ovrseer.stopProcess(id);
	},
	setCurrentProcessId(id: string) {
		set(state => {
			return {
				...state,
				currentProcessId: id,
			};
		});
	},

	updateProcessState(id: string, status: ProcessStatus) {
		set(state => {
			const newProcessStates = new Map(state.processStates);
			newProcessStates.set(id, status);
			return {
				...state,
				processStates: newProcessStates,
			};
		});
	},
}));
