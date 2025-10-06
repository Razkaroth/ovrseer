import type {
	OvrseerI,
	ProcessUnitI,
	TUIProcessType,
	CrashReporterI,
	ProcessManagerEvents,
} from './types.js';
import {CrashReporter} from './crash-reporter.js';
import {EventEmitter} from 'events';

// Options for configuring the Ovrseer
// cleanupTimeout: max ms to wait for each cleanup process.finished before continuing
// waitTime retained for backward compatibility (no longer used for restartAll delay)
type ProcessManagerOptions = {
	retries?: number;
	waitTime?: number;
	cleanupTimeout?: number;
	crashReporter?: CrashReporterI;
};

export class Ovrseer implements OvrseerI {
	private dependencies = new Map<string, ProcessUnitI>();
	private mainProcesses = new Map<string, ProcessUnitI>();
	private cleanupProcesses = new Map<string, ProcessUnitI>();
	private cleanupOrder: Array<string> = [];
	private retryCount = new Map<string, number>();
	private maxRetries: number;
	private waitTime: number;
	private cleanupTimeout: number;
	private isRunning = false;
	private handlerTeardowns: Map<string, (() => void)[]> = new Map();

	public readonly crashReporter?: CrashReporterI;
	public readonly events: EventEmitter;

	constructor(options?: ProcessManagerOptions) {
		this.maxRetries = options?.retries ?? 3;
		this.waitTime = options?.waitTime ?? 1000;
		this.cleanupTimeout = options?.cleanupTimeout ?? 5000;
		this.crashReporter = options?.crashReporter ?? new CrashReporter();
		this.events = new EventEmitter();
	}

	get on() {
		return <K extends keyof ProcessManagerEvents>(
			event: K,
			listener: (data: ProcessManagerEvents[K]) => void,
		) => {
			this.events.on(event, listener);
		};
	}

	get addEventListener() {
		return this.on;
	}

	get off() {
		return <K extends keyof ProcessManagerEvents>(
			event: K,
			listener: (data: ProcessManagerEvents[K]) => void,
		) => {
			this.events.off(event, listener);
		};
	}

	get removeEventListener() {
		return this.off;
	}

	private emit<K extends keyof ProcessManagerEvents>(
		event: K,
		data: ProcessManagerEvents[K],
	): void {
		this.events.emit(event, data);
	}

	private emitStateUpdate(): void {
		this.emit('state:update', {
			processes: {
				dependencies: this.dependencies,
				main: this.mainProcesses,
				cleanup: this.cleanupProcesses,
			},
			timestamp: Date.now(),
		});
	}

	addDependency(id: string, process: ProcessUnitI): void {
		this.dependencies.set(id, process);
		this.emit('process:added', {
			id,
			type: 'dependency',
			timestamp: Date.now(),
		});
	}

	removeDependency(id: string): void {
		const teardowns = this.handlerTeardowns.get(id);
		if (teardowns) {
			for (const td of teardowns) {
				try {
					td();
				} catch {
					/* ignore */
				}
			}
			this.handlerTeardowns.delete(id);
		}
		this.dependencies.delete(id);
		this.emit('process:removed', {
			id,
			type: 'dependency',
			timestamp: Date.now(),
		});
	}

	getDependency(id: string): ProcessUnitI | undefined {
		return this.dependencies.get(id);
	}

	addMainProcess(id: string, process: ProcessUnitI): void {
		this.mainProcesses.set(id, process);
		this.emit('process:added', {id, type: 'main', timestamp: Date.now()});
	}

	removeMainProcess(id: string): void {
		const teardowns = this.handlerTeardowns.get(id);
		if (teardowns) {
			for (const td of teardowns) {
				try {
					td();
				} catch {
					/* ignore */
				}
			}
			this.handlerTeardowns.delete(id);
		}
		this.mainProcesses.delete(id);
		this.emit('process:removed', {
			id,
			type: 'main',
			timestamp: Date.now(),
		});
	}

	getMainProcess(id: string): ProcessUnitI | undefined {
		return this.mainProcesses.get(id);
	}

	addCleanupProcess(id: string, process: ProcessUnitI): void {
		this.cleanupProcesses.set(id, process);
		if (!this.cleanupOrder.includes(id)) {
			this.cleanupOrder.push(id);
		}
		this.emit('process:added', {
			id,
			type: 'cleanup',
			timestamp: Date.now(),
		});
	}

	removeCleanupProcess(id: string): void {
		const teardowns = this.handlerTeardowns.get(id);
		if (teardowns) {
			for (const td of teardowns) {
				try {
					td();
				} catch {
					/* ignore */
				}
			}
			this.handlerTeardowns.delete(id);
		}
		this.cleanupProcesses.delete(id);
		this.cleanupOrder = this.cleanupOrder.filter(id_ => id_ !== id);
		this.emit('process:removed', {
			id,
			type: 'cleanup',
			timestamp: Date.now(),
		});
	}

	getCleanupProcess(id: string): ProcessUnitI | undefined {
		return this.cleanupProcesses.get(id);
	}

	start(): void {
		if (this.mainProcesses.size === 0) {
			throw new Error('No main processes to start');
		}

		this.isRunning = true;
		this.emit('manager:started', {timestamp: Date.now()});

		for (const [id, dep] of this.dependencies) {
			this.setupProcessHandlers(id, dep, 'dependency');
			this.emit('process:started', {
				id,
				type: 'dependency',
				timestamp: Date.now(),
			});
			dep.start();
		}

		if (this.dependencies.size > 0) {
			Promise.all([...this.dependencies.values()].map(dep => dep.ready))
				.then(() => {
					for (const [id, proc] of this.mainProcesses) {
						this.setupProcessHandlers(id, proc, 'main');
						this.emit('process:started', {
							id,
							type: 'main',
							timestamp: Date.now(),
						});
						proc.start();
					}
				})
				.catch(async err => {
					this.emit('dependency:failed', {
						id: 'unknown',
						error: err,
						timestamp: Date.now(),
					});
					const deps = Array.from(this.dependencies.values());
					await Promise.allSettled(
						deps.map(async dep => {
							try {
								dep.stop();
								await dep.finished;
							} catch {
								/* ignore */
							}
						}),
					);
					try {
						await this.stop();
					} catch {
						/* ignore */
					}
				});
		} else {
			for (const [id, proc] of this.mainProcesses) {
				this.setupProcessHandlers(id, proc, 'main');
				this.emit('process:started', {id, type: 'main', timestamp: Date.now()});
				proc.start();
			}
		}

		this.emitStateUpdate();
	}

	async stop(): Promise<void> {
		this.isRunning = false;
		this.emit('manager:stopping', {timestamp: Date.now()});

		const mainProcesses = Array.from(this.mainProcesses.values());
		const dependencies = Array.from(this.dependencies.values());

		for (const proc of mainProcesses) {
			if (proc.isRunning()) {
				proc.stop();
			}
		}

		await Promise.allSettled(
			mainProcesses
				.filter(proc => proc.isRunning() || proc.getStatus() === 'stopping')
				.map(proc => proc.finished.catch(() => {})),
		);

		this.emit('cleanup:started', {timestamp: Date.now()});
		this.emit('status:message', {
			message: 'Running cleanup processes...',
			timestamp: Date.now(),
		});
		for (const id of this.cleanupOrder) {
			const cleanup = this.cleanupProcesses.get(id);
			if (!cleanup) continue;
			try {
				cleanup.start();
			} catch (_) {
				/* ignore */
			}
			try {
				await this.waitForPromiseWithTimeout(
					cleanup.finished,
					this.cleanupTimeout,
					id,
				);
			} catch (e: any) {
				this.emit('cleanup:timeout', {id, error: e, timestamp: Date.now()});
			}
		}

		for (const dep of dependencies) {
			if (dep.isRunning()) {
				dep.stop();
			}
		}

		await Promise.allSettled(
			dependencies
				.filter(dep => dep.isRunning() || dep.getStatus() === 'stopping')
				.map(dep => dep.finished.catch(() => {})),
		);

		this.emit('cleanup:finished', {timestamp: Date.now()});
		this.emit('status:message', {
			message: 'Cleanup finished',
			timestamp: Date.now(),
		});
		this.emit('manager:stopped', {timestamp: Date.now()});
		this.emitStateUpdate();
	}

	restartProcess(id: string, processType?: TUIProcessType): void {
		let process: ProcessUnitI | undefined;
		let actualType: TUIProcessType | undefined;

		if (processType === 'dependency') {
			process = this.dependencies.get(id);
			actualType = 'dependency';
		} else if (processType === 'cleanup') {
			process = this.cleanupProcesses.get(id);
			actualType = 'cleanup';
		} else {
			process =
				this.mainProcesses.get(id) ||
				this.dependencies.get(id) ||
				this.cleanupProcesses.get(id);
			if (process) {
				if (this.mainProcesses.has(id)) actualType = 'main';
				else if (this.dependencies.has(id)) actualType = 'dependency';
				else if (this.cleanupProcesses.has(id)) actualType = 'cleanup';
			}
		}

		if (!process || !actualType) {
			this.emit('status:message', {
				message: `Process ${id} not found`,
				timestamp: Date.now(),
			});
			return;
		}

		this.emit('process:restarting', {
			id,
			type: actualType,
			timestamp: Date.now(),
		});
		this.emit('status:message', {
			message: `Restarting ${id}...`,
			timestamp: Date.now(),
		});
		process.restart();
		this.emitStateUpdate();
	}

	restartAll(): void {
		if (!this.isRunning) {
			this.emit('status:message', {
				message: 'Not running, starting...',
				timestamp: Date.now(),
			});
			try {
				this.start();
			} catch (e: any) {
				this.emit('status:message', {
					message: `Start failed: ${e?.message || e}`,
					timestamp: Date.now(),
				});
			}
			return;
		}

		(async () => {
			this.emit('manager:restarting', {timestamp: Date.now()});
			this.emit('status:message', {
				message: 'Restarting all (stopping processes)...',
				timestamp: Date.now(),
			});
			await this.stop();

			this.emit('status:message', {
				message: 'Restarting all (preparing for restart)...',
				timestamp: Date.now(),
			});
			for (const proc of this.dependencies.values()) {
				try {
					proc.prepareForRestart?.();
				} catch {
					/* ignore */
				}
			}

			for (const proc of this.mainProcesses.values()) {
				try {
					proc.prepareForRestart?.();
				} catch {
					/* ignore */
				}
			}
			for (const proc of this.cleanupProcesses.values()) {
				try {
					proc.prepareForRestart?.();
				} catch {
					/* ignore */
				}
			}

			this.emit('status:message', {
				message: 'Restarting all (starting dependencies)...',
				timestamp: Date.now(),
			});
			this.start();
			this.emit('status:message', {
				message: 'Restarting all (starting main)...',
				timestamp: Date.now(),
			});

			await new Promise(resolve => setTimeout(resolve, 0));
			this.emit('status:message', {
				message: 'All processes restarted',
				timestamp: Date.now(),
			});
		})();
	}

	restartAllMainProcesses(): void {
		for (const [id, proc] of this.mainProcesses) {
			if (proc.isRunning()) {
				proc.restart();
			}
			this.retryCount.delete(id);
		}
	}

	private setupProcessHandlers(
		id: string,
		process: ProcessUnitI,
		type: TUIProcessType,
	): void {
		// If there are existing teardowns for this process, call them first
		const existing = this.handlerTeardowns.get(id);
		if (existing) {
			for (const td of existing) {
				try {
					td();
				} catch {
					/* ignore */
				}
			}
		}

		const teardowns: Array<() => void> = [];

		const crashTd = process.onCrash(async err => {
			try {
				await this.handleCrash(id, process, type, err);
			} catch (e: any) {
				this.emit('status:message', {
					message: `Error handling crash for ${id}: ${e?.message || e}`,
					timestamp: Date.now(),
				});
			}
		});
		teardowns.push(crashTd);

		const exitTd = process.onExit((code, signal) => {
			this.emit('process:stopped', {
				id,
				type,
				code: code ?? null,
				signal: signal ?? null,
				timestamp: Date.now(),
			});
			this.emit('status:message', {
				message: `Process ${id} exited with code ${code}, signal ${signal}`,
				timestamp: Date.now(),
			});
			this.emitStateUpdate();
		});
		teardowns.push(exitTd);

		const readyTd = process.onReady(() => {
			this.emit('process:ready', {id, type, timestamp: Date.now()});
			this.emit('status:message', {
				message: `Process ${id} is ready`,
				timestamp: Date.now(),
			});
			this.emitStateUpdate();
		});
		teardowns.push(readyTd);

		const logTd = process.logger.onLog(message => {
			this.emit('process:log', {
				id,
				type,
				message,
				isError: false,
				timestamp: Date.now(),
			});
		});
		teardowns.push(logTd);

		const errTd = process.logger.onError(message => {
			this.emit('process:log', {
				id,
				type,
				message,
				isError: true,
				timestamp: Date.now(),
			});
		});
		teardowns.push(errTd);

		this.handlerTeardowns.set(id, teardowns);
	}

	private async handleCrash(
		id: string,
		process: ProcessUnitI,
		type: TUIProcessType,
		error: Error,
	): Promise<void> {
		const currentRetries = this.retryCount.get(id) || 0;

		this.emit('process:crashed', {
			id,
			type,
			error,
			retryCount: currentRetries,
			timestamp: Date.now(),
		});

		if (type === 'dependency') {
			this.emit('status:message', {
				message: `Dependency ${id} crashed: ${error.message}`,
				timestamp: Date.now(),
			});
			if (this.crashReporter) {
				const report = this.crashReporter.generateReport(
					id,
					process,
					'dependencyFailed',
					{
						error,
						processType: type,
					},
				);
				this.crashReporter.saveReport(report);
			}
			try {
				await this.stop();
			} catch (e: any) {
				this.emit('status:message', {
					message: `Error during stop after dependency crash: ${
						e?.message || e
					}`,
					timestamp: Date.now(),
				});
			}
			return;
		}

		if (currentRetries < this.maxRetries) {
			this.retryCount.set(id, currentRetries + 1);
			this.emit('status:message', {
				message: `Process ${id} crashed: ${error.message}. Retry ${
					currentRetries + 1
				}/${this.maxRetries}`,
				timestamp: Date.now(),
			});
			process.restart();
			this.emitStateUpdate();
		} else {
			this.emit('status:message', {
				message: `Process ${id} crashed too many times: ${error.message}. Stopping all processes.`,
				timestamp: Date.now(),
			});
			if (this.crashReporter) {
				const report = this.crashReporter.generateReport(
					id,
					process,
					'maxRetriesExceeded',
					{
						error,
						processType: type,
						retryCount: currentRetries,
					},
				);
				this.crashReporter.saveReport(report);
			}
			try {
				await process.stop();
			} catch {
				/* ignore */
			}
			try {
				await this.stop();
			} catch (e: any) {
				this.emit('status:message', {
					message: `Error during stop after crash: ${e?.message || e}`,
					timestamp: Date.now(),
				});
			}
		}
	}

	private getProcessByIdAndType(
		id: string,
		type: TUIProcessType,
	): ProcessUnitI | undefined {
		if (type === 'dependency') return this.dependencies.get(id);
		if (type === 'main') return this.mainProcesses.get(id);
		if (type === 'cleanup') return this.cleanupProcesses.get(id);
		return undefined;
	}

	private waitForPromiseWithTimeout<T>(
		promise: Promise<T>,
		timeout: number,
		id: string,
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			let settled = false;
			const to = setTimeout(() => {
				if (settled) return;
				settled = true;
				reject(new Error(`cleanup ${id} timed out after ${timeout}ms`));
			}, timeout);
			promise
				.then(v => {
					if (settled) return;
					settled = true;
					clearTimeout(to);
					resolve(v);
				})
				.catch(e => {
					if (settled) return;
					settled = true;
					clearTimeout(to);
					reject(e);
				});
		});
	}
}
