import type {TUIKeyPressMeta} from '@ovrseer/core';
import type {
	OvrseerI,
	ProcessMap,
	TUIState,
	ProcessManagerEvents,
} from './types.js';
import {InkTUIWrapper} from './InkTUIWrapper.js';

export class InkTUI extends InkTUIWrapper {
	private manager: OvrseerI | null = null;
	private managedProcesses: ProcessMap = {
		dependencies: new Map(),
		main: new Map(),
		cleanup: new Map(),
	};
	private managedState: TUIState = {};

	attachToManager(manager: OvrseerI): void {
		if (this.manager) {
			throw new Error('Already attached to a manager');
		}

		this.manager = manager;

		manager.on<'status:message'>(
			'status:message',
			(data: ProcessManagerEvents['status:message']) => {
				this.showStatus(data.message);
			},
		);

		manager.on<'state:update'>(
			'state:update',
			(data: ProcessManagerEvents['state:update']) => {
				this.managedProcesses = data.processes;
				this.render(data.processes, this.managedState);
			},
		);

		manager.on<'process:ready'>(
			'process:ready',
			(data: ProcessManagerEvents['process:ready']) => {
				this.showStatus(`Process ${data.id} is ready`);
				this.render(this.managedProcesses, this.managedState);
			},
		);

		manager.on<'process:crashed'>(
			'process:crashed',
			(data: ProcessManagerEvents['process:crashed']) => {
				this.showStatus(`Process ${data.id} crashed: ${data.error.message}`);
				this.render(this.managedProcesses, this.managedState);
			},
		);

		manager.on<'manager:started'>('manager:started', () => {
			this.showStatus('Manager started');
		});

		manager.on<'manager:stopping'>('manager:stopping', () => {
			this.showStatus('Stopping all processes...');
		});

		manager.on<'manager:stopped'>('manager:stopped', () => {
			this.showStatus('All processes stopped');
		});

		manager.on<'manager:restarting'>('manager:restarting', () => {
			this.showStatus('Restarting all processes...');
		});

		manager.on<'process:added'>(
			'process:added',
			(data: ProcessManagerEvents['process:added']) => {
				this.render(this.managedProcesses, this.managedState);
			},
		);

		manager.on<'process:removed'>(
			'process:removed',
			(data: ProcessManagerEvents['process:removed']) => {
				this.render(this.managedProcesses, this.managedState);
			},
		);

		manager.on<'dependency:failed'>(
			'dependency:failed',
			(data: ProcessManagerEvents['dependency:failed']) => {
				this.showStatus(`Dependency ${data.id} failed: ${data.error.message}`);
			},
		);

		manager.on<'cleanup:timeout'>(
			'cleanup:timeout',
			(data: ProcessManagerEvents['cleanup:timeout']) => {
				this.showStatus(
					`Cleanup process ${data.id} timeout: ${data.error.message}`,
				);
			},
		);

		manager.on<'cleanup:started'>('cleanup:started', () => {
			this.showStatus('Running cleanup processes...');
		});

		manager.on<'cleanup:finished'>('cleanup:finished', () => {
			this.showStatus('Cleanup finished');
		});

		manager.on<'process:started'>(
			'process:started',
			(data: ProcessManagerEvents['process:started']) => {
				this.render(this.managedProcesses, this.managedState);
			},
		);

		manager.on<'process:stopping'>(
			'process:stopping',
			(data: ProcessManagerEvents['process:stopping']) => {
				this.render(this.managedProcesses, this.managedState);
			},
		);

		manager.on<'process:stopped'>(
			'process:stopped',
			(data: ProcessManagerEvents['process:stopped']) => {
				this.render(this.managedProcesses, this.managedState);
			},
		);

		manager.on<'process:restarting'>(
			'process:restarting',
			(data: ProcessManagerEvents['process:restarting']) => {
				this.showStatus(`Restarting process ${data.id}...`);
				this.render(this.managedProcesses, this.managedState);
			},
		);

		manager.on<'process:log'>(
			'process:log',
			(data: ProcessManagerEvents['process:log']) => {
				if (
					this.managedState.selectedProcessId === data.id &&
					this.managedState.selectedProcessType === data.type
				) {
					const process = this.getProcessByIdAndType(data.id, data.type);
					if (process) {
						let logs = 'No logs available';
						try {
							logs = process.logger.getLogs();
						} catch {}
						this.showLogs(data.id, data.type, logs);
					}
				}
			},
		);

		this.onKeyPress(async (key: string, meta?: TUIKeyPressMeta) => {
			if (key === 'q' || key === 'C-c') {
				if (this.manager) {
					await this.manager.stop();
				}
				this.destroy();
				process.exit(0);
			} else if (key === 's') {
				if (this.manager) {
					this.manager.start();
				}
			} else if (key === 'r') {
				if (
					this.managedState.selectedProcessId &&
					this.managedState.selectedProcessType &&
					this.manager
				) {
					this.manager.restartProcess(
						this.managedState.selectedProcessId,
						this.managedState.selectedProcessType,
					);
				}
			} else if (key === 'R' || key === 'C-r') {
				if (this.manager) {
					this.manager.restartAll();
				}
			} else if (key === 'enter') {
				if (this.managedState.flagPanelFocused) {
					this.toggleFlagNodeExpansion();
				} else if (
					this.managedState.selectedProcessId &&
					this.managedState.selectedProcessType
				) {
					const process = this.getProcessByIdAndType(
						this.managedState.selectedProcessId,
						this.managedState.selectedProcessType,
					);
					if (process) {
						let logs = 'No logs available';
						try {
							logs = process.logger.getLogs();
						} catch {}
						this.showLogs(
							this.managedState.selectedProcessId,
							this.managedState.selectedProcessType,
							logs,
						);
					}
				}
			} else if (key === 'select') {
				if (meta?.processInfo) {
					this.managedState.selectedProcessId = meta.processInfo.id;
					this.managedState.selectedProcessType = meta.processInfo.type;
					this.resetFlagPanel();
					this.render(this.managedProcesses, this.managedState);
				}
			} else if (key === 'f') {
				this.toggleFlagPanelSize();
			} else if (key === 'flag-up') {
				this.moveFlagSelectionUp();
			} else if (key === 'flag-down') {
				this.moveFlagSelectionDown();
			} else if (key === 'flag-enter') {
				this.toggleFlagNodeExpansion();
			}
		});
	}

	detachFromManager(): void {
		if (this.manager) {
			this.manager = null;
		}
	}

	private getProcessByIdAndType(id: string, type: string) {
		if (type === 'dependency')
			return this.managedProcesses.dependencies.get(id);
		if (type === 'main') return this.managedProcesses.main.get(id);
		if (type === 'cleanup') return this.managedProcesses.cleanup.get(id);
		return undefined;
	}

	private resetFlagPanel(): void {
		this.managedState.flagPanelSize = 'collapsed';
		this.managedState.flagPanelFocused = false;
		this.managedState.selectedFlagNode = undefined;
		this.managedState.expandedFlagNodes = new Set();
		this.render(this.managedProcesses, this.managedState);
	}

	private toggleFlagPanelSize(): void {
		if (!this.managedState.flagPanelSize) {
			this.managedState.flagPanelSize = 'collapsed';
		}
		if (this.managedState.flagPanelSize === 'collapsed') {
			this.managedState.flagPanelSize = 'expanded';
			this.managedState.flagPanelFocused = true;
			const flatTree = this.buildFlatFlagTree();
			if (flatTree.length > 0 && !this.managedState.selectedFlagNode) {
				this.managedState.selectedFlagNode = flatTree[0];
			}
		} else {
			this.managedState.flagPanelSize = 'collapsed';
			this.managedState.flagPanelFocused = false;
		}
		this.render(this.managedProcesses, this.managedState);
	}

	private buildFlatFlagTree(): string[] {
		if (
			!this.managedState.selectedProcessId ||
			!this.managedState.selectedProcessType
		)
			return [];
		const proc = this.getProcessByIdAndType(
			this.managedState.selectedProcessId,
			this.managedState.selectedProcessType,
		);
		if (!proc) return [];
		const allFlags = proc.logger.getAllFlags();
		if (!allFlags || allFlags.size === 0) return [];
		const flatList: string[] = [];
		for (const [flagName, flagState] of allFlags.entries()) {
			flatList.push(`flag:${flagName}`);
			if (
				this.managedState.expandedFlagNodes?.has(`flag:${flagName}`) &&
				flagState.matches &&
				flagState.matches.length > 0
			) {
				for (let i = 0; i < flagState.matches.length; i++) {
					flatList.push(`flag:${flagName}:match:${i}`);
				}
			}
		}
		return flatList;
	}

	private moveFlagSelectionUp(): void {
		if (!this.managedState.flagPanelFocused) return;
		const flatTree = this.buildFlatFlagTree();
		if (flatTree.length === 0) return;
		if (!this.managedState.selectedFlagNode) {
			this.managedState.selectedFlagNode = flatTree[flatTree.length - 1];
		} else {
			const currentIndex = flatTree.indexOf(this.managedState.selectedFlagNode);
			if (currentIndex > 0) {
				this.managedState.selectedFlagNode = flatTree[currentIndex - 1];
			} else {
				this.managedState.selectedFlagNode = flatTree[flatTree.length - 1];
			}
		}
		this.render(this.managedProcesses, this.managedState);
	}

	private moveFlagSelectionDown(): void {
		if (!this.managedState.flagPanelFocused) return;
		const flatTree = this.buildFlatFlagTree();
		if (flatTree.length === 0) return;
		if (!this.managedState.selectedFlagNode) {
			this.managedState.selectedFlagNode = flatTree[0];
		} else {
			const currentIndex = flatTree.indexOf(this.managedState.selectedFlagNode);
			if (currentIndex >= 0 && currentIndex < flatTree.length - 1) {
				this.managedState.selectedFlagNode = flatTree[currentIndex + 1];
			} else {
				this.managedState.selectedFlagNode = flatTree[0];
			}
		}
		this.render(this.managedProcesses, this.managedState);
	}

	private toggleFlagNodeExpansion(): void {
		if (!this.managedState.flagPanelFocused) return;
		if (!this.managedState.selectedFlagNode) {
			const flatTree = this.buildFlatFlagTree();
			if (flatTree.length > 0) {
				this.managedState.selectedFlagNode = flatTree[0];
			}
			return;
		}
		if (!this.managedState.expandedFlagNodes) {
			this.managedState.expandedFlagNodes = new Set();
		}
		const node = this.managedState.selectedFlagNode;
		if (node.startsWith('flag:') && !node.includes(':match:')) {
			if (this.managedState.expandedFlagNodes.has(node)) {
				this.managedState.expandedFlagNodes.delete(node);
			} else {
				this.managedState.expandedFlagNodes.add(node);
			}
		} else if (node.includes(':match:')) {
			this.toggleFlagMatchContext();
		}
		this.render(this.managedProcesses, this.managedState);
	}

	private toggleFlagMatchContext(): void {
		if (!this.managedState.selectedFlagNode) return;
		if (!this.managedState.matchContextVisible) {
			this.managedState.matchContextVisible = new Set();
		}
		const node = this.managedState.selectedFlagNode;
		if (this.managedState.matchContextVisible.has(node)) {
			this.managedState.matchContextVisible.delete(node);
		} else {
			this.managedState.matchContextVisible.add(node);
		}
	}
}
