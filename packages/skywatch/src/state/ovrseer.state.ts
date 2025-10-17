import {OvrseerI, OvrseerWorkTree, ProcessUnitI} from '@ovrseer/core';
import {create} from 'zustand';

export interface OvrseerState {
	ovrseer: OvrseerI | null;
	worktree: OvrseerWorkTree | null;

	currentProcessId: string | null;
	currentProcessUnit: ProcessUnitI | null;
	// Setters
	setOvrseer: (ovrseer: OvrseerI) => void;
	start: () => void;
	stop: () => Promise<void>;
	restart: () => void;
	restartSingle: (id: string) => void;
	stopSingle: (id: string) => void;
	setCurrentProcessId: (id: string) => void;
}

export const useOvrseer = create<OvrseerState>()(set => ({
	ovrseer: null,
	worktree: null,
	currentProcessId: null,
	currentProcessUnit: null,

	// Setters
	setOvrseer: (ovrseer: OvrseerI) => {
		// We start with the first dependency as the current process
		const worktree = ovrseer.getCurrentWorkTree();
		const firstDependency = worktree.dependencies.keys().next().value;
		if (!firstDependency) return;
		set(state => {
			return {
				...state,
				ovrseer,
				worktree,
				currentProcessId: firstDependency,
				urrentProcessUnit: worktree.dependencies.get(firstDependency),
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
}));
