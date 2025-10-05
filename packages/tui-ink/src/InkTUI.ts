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
				if (
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
			} else if (key === 'up') {
				this.selectPrevious();
			} else if (key === 'down') {
				this.selectNext();
			} else if (key === 'select') {
				if (meta?.processInfo) {
					this.managedState.selectedProcessId = meta.processInfo.id;
					this.managedState.selectedProcessType = meta.processInfo.type;
					this.render(this.managedProcesses, this.managedState);
				}
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
}
