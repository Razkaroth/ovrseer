import {spawn, ChildProcess} from 'child_process';
import {
	ProcessLoggerI,
	ProcessStatus,
	ReadyCheck,
	StopSignal,
} from './types.js';

export class ProcessUnit {
	private _process: ChildProcess | null = null;
	private _status: ProcessStatus = 'created';
	private _checksPassed: number = 0;
	private _readyResolve!: () => void;
	private _readyReject!: (error: Error) => void;
	private _finishedResolve!: () => void;
	private _finishedReject!: (error: Error) => void;
	private _onReadyCallbacks: (() => void)[] = [];
	private _onExitCallbacks: ((
		code: number | null,
		signal: NodeJS.Signals | null,
	) => void)[] = [];
	private _onCrashCallbacks: ((error: Error) => void)[] = [];
	private _timers: NodeJS.Timeout[] = [];
	private _unsubscribers: (() => void)[] = [];
	private _wasKilled: boolean = false;
	private _escalationTimer: NodeJS.Timeout | null = null;
	private _finishedSettled: boolean = false;

	command: string;
	args: string[];
	readyChecks: ReadyCheck[];
	logger: ProcessLoggerI;
	ready: Promise<void>;
	finished: Promise<void>;

	get process(): ChildProcess | null {
		return this._process;
	}

	constructor(
		command: string,
		args: string[],
		readyChecks: ReadyCheck[],
		logger: ProcessLoggerI,
	) {
		this.command = command;
		this.args = args;
		this.readyChecks = readyChecks;
		this.logger = logger;

		this._checksPassed = 0;

		this._process = null;
		this._status = 'created';
		this.ready = new Promise((resolve, reject) => {
			this._readyResolve = () => {
				this._onReadyCallbacks.forEach(cb => {
					try {
						cb();
					} catch (_e) {
						/* swallow callback errors */
					}
				});
				resolve();
			};
			this._readyReject = reject;
		});
		this.finished = new Promise((resolve, reject) => {
			this._finishedResolve = resolve;
			this._finishedReject = reject;
		});
	}

	private _cleanupTimersAndSubscriptions(): void {
		this._timers.forEach(timer => clearTimeout(timer));
		this._unsubscribers.forEach(unsub => unsub());
		this._timers = [];
		this._unsubscribers = [];
	}

	/**
	 * Cleanup all timers and subscriptions. Should be called after process termination.
	 * This is especially important in production to prevent memory leaks.
	 */
	cleanup(): void {
		this._cleanupTimersAndSubscriptions();
	}

	start(): void {
		if (this._status !== 'created') {
			throw new Error('Process is already running');
		}

		this._process = spawn(this.command, this.args, {
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		this._status = 'running';

		this._process.on('exit', (code, signal) => {
			this._cleanupTimersAndSubscriptions();

			// Clear escalation timer if it exists
			if (this._escalationTimer) {
				clearTimeout(this._escalationTimer);
				this._escalationTimer = null;
			}

			// Determine final status based on current status and exit conditions
			if (this._status === 'stopping') {
				// Normal graceful shutdown
				this._status = 'stopped';
			} else if (this._wasKilled || signal === 'SIGKILL') {
				// Process was killed or crashed
				this._status = 'crashed';
			} else if (code === 0) {
				// Process completed successfully
				this._status = 'completed';
			} else {
				// Process failed
				this._status = 'crashed';
			}

			// Resolve ready promise if process completed successfully and hasn't been resolved yet
			if (
				this._status === 'completed' &&
				this._checksPassed === this.readyChecks.length
			) {
				this._readyResolve();
			}

			// Call exit callbacks
			this._onExitCallbacks.forEach(cb => {
				try {
					cb(code, signal);
				} catch (_e) {
					/* swallow callback errors */
				}
			});

			// Handle finished promise
			if (!this._finishedSettled) {
				this._finishedSettled = true;
				if (this._status === 'crashed') {
					// Reject for crashed processes
					this._finishedReject(
						new Error(
							`Process ${this._wasKilled ? 'killed' : 'crashed'} with ${
								signal ? `signal ${signal}` : `code ${code}`
							}`,
						),
					);
				} else {
					// Resolve for normal exit or stopped
					this._finishedResolve();
				}
			}
		});

		this._process.on('error', error => {
			this._cleanupTimersAndSubscriptions();

			const wasReady = this._status === 'ready';

			// If process hasn't become ready yet, it's a spawn failure
			// Otherwise it's a runtime crash
			if (wasReady) {
				this._status = 'crashed';
			} else {
				this._status = 'couldNotSpawn';
			}

			// Call crash callbacks
			this._onCrashCallbacks.forEach(cb => {
				try {
					cb(error);
				} catch (_e) {
					/* swallow callback errors */
				}
			});

			// If ready promise hasn't been resolved yet, reject it
			// Otherwise, the process was already ready and this is a runtime crash
			if (!wasReady) {
				this._readyReject(error);
			}

			// Handle finished promise
			if (!this._finishedSettled) {
				this._finishedSettled = true;
				// For spawn errors and crashes, reject the finished promise
				this._finishedReject(error);
			}
		});

		if (this._process.stdout) {
			this._process.stdout.on('data', chunk => {
				this.logger.addChunk(chunk.toString());
			});
		}
		if (this._process.stderr) {
			this._process.stderr.on('data', chunk => {
				this.logger.addChunk(chunk.toString(), true);
			});
		}

		this.logger.onError((chunk: string) => {
			this._cleanupTimersAndSubscriptions();
			this._status = 'crashed';
			this._readyReject(new Error(chunk));

			if (!this._finishedSettled) {
				this._finishedSettled = true;
				this._finishedReject(new Error(chunk));
			}
		});

		this.runReadyChecks();
	}

	async runReadyChecks(): Promise<void> {
		const timers: NodeJS.Timeout[] = [];
		const unsubscribers: (() => void)[] = [];

		const setAsReady = () => {
			// Clean up the timers and unsubscribers specific to ready checks
			timers.forEach(timer => clearTimeout(timer));
			unsubscribers.forEach(unsub => unsub());

			this._status = 'ready';
			this._readyResolve();
		};

		const setAsFailed = (error: Error) => {
			// Clean up the timers and unsubscribers specific to ready checks
			timers.forEach(timer => clearTimeout(timer));
			unsubscribers.forEach(unsub => unsub());

			this._status = 'failedByReadyCheck';
			this._readyReject(error);

			if (!this._finishedSettled) {
				this._finishedSettled = true;
				// Ready check failures should reject finished promise
				this._finishedReject(error);
			}
		};

		// If no ready checks, resolve immediately
		if (this.readyChecks.length === 0) {
			setAsReady();
			return;
		}

		this.readyChecks.forEach(check => {
			// subscribe to process events
			const unsubscribe = this.logger.onLog((chunk: string) => {
				if (check.logPattern instanceof RegExp) {
					if (check.logPattern.test(chunk)) {
						this._checksPassed++;
						if (this._checksPassed === this.readyChecks.length) {
							setAsReady();
						}
					}
				} else {
					if (chunk.includes(check.logPattern)) {
						this._checksPassed++;
						if (this._checksPassed === this.readyChecks.length) {
							setAsReady();
						}
					}
				}
			});
			unsubscribers.push(unsubscribe);
			this._unsubscribers.push(unsubscribe);

			// start timer
			const timeout = setTimeout(() => {
				if (check.passIfNotFound) {
					setAsReady();
					return;
				}
				setAsFailed(new Error('Ready check timed out'));
			}, check.timeout);
			timers.push(timeout);
			this._timers.push(timeout);
		});
	}

	onReady(callback: () => void): () => void {
		this._onReadyCallbacks.push(callback);
		return () => {
			this._onReadyCallbacks = this._onReadyCallbacks.filter(
				cb => cb !== callback,
			);
		};
	}

	onExit(
		callback: (code: number | null, signal: NodeJS.Signals | null) => void,
	): () => void {
		this._onExitCallbacks.push(callback);
		return () => {
			this._onExitCallbacks = this._onExitCallbacks.filter(
				cb => cb !== callback,
			);
		};
	}

	onCrash(callback: (error: Error) => void): () => void {
		this._onCrashCallbacks.push(callback);
		return () => {
			this._onCrashCallbacks = this._onCrashCallbacks.filter(
				cb => cb !== callback,
			);
		};
	}

	async stop(
		timeout: number = 1000,
		signal: StopSignal = 'SIGINT',
	): Promise<void> {
		if (!this.isRunning()) {
			console.warn('Tried to stop a process that is not running.');
			console.warn(
				`Process: ${this.command} is not running. Status: ${this._status}.`,
			);
		}

		this._status = 'stopping';

		// Send the signal to the process
		const success = this.process?.kill(signal);

		if (!success) {
			throw new Error('Failed to send signal to process');
		}

		// Set up escalation timer
		this._escalationTimer = setTimeout(() => {
			// If process is still stopping after timeout, escalate to kill
			if (this._status === 'stopping') {
				this.kill();
			}
		}, timeout);

		// Add escalation timer to timers array for cleanup
		this._timers.push(this._escalationTimer);

		return this.finished;
	}

	kill(): void {
		if (!this.isRunning() && this._status !== 'stopping') {
			throw new Error('Process is not running');
		}

		this._wasKilled = true;
		this._status = 'crashed';

		// Clear escalation timer if it exists
		if (this._escalationTimer) {
			clearTimeout(this._escalationTimer);
			this._escalationTimer = null;
		}

		// Send SIGKILL to forcefully terminate the process
		const success = this.process?.kill('SIGKILL');

		if (!success) {
			throw new Error('Failed to kill process');
		}
	}

	prepareForRestart(): void {
		if (this.isRunning() || this._status === 'stopping') {
			throw new Error(
				'Cannot prepare for restart while process is running or stopping',
			);
		}

		// Reset internal state to allow start() to be called again
		this._process = null;
		this._status = 'created';
		this._checksPassed = 0;
		this._wasKilled = false;
		this._finishedSettled = false;
		this._escalationTimer = null;

		// Clear any existing callbacks
		this._onReadyCallbacks = [];
		this._onExitCallbacks = [];
		this._onCrashCallbacks = [];

		// Recreate promises with new resolve/reject functions
		this.ready = new Promise((resolve, reject) => {
			this._readyResolve = () => {
				this._onReadyCallbacks.forEach(cb => {
					try {
						cb();
					} catch (_e) {
						/* swallow callback errors */
					}
				});
				resolve();
			};
			this._readyReject = reject;
		});

		this.finished = new Promise((resolve, reject) => {
			this._finishedResolve = resolve;
			this._finishedReject = reject;
		});
	}

	restart(): void {
		// If the process is running (or stopping), stop it first then restart when finished
		if (this.isRunning() || this._status === 'stopping') {
			// Stop the process and wait for it to exit, then restart
			this.stop();

			// Wait for the process to finish, then prepare and restart
			this.finished
				.catch(() => {
					// Ignore errors during stop
				})
				.finally(() => {
					this.prepareForRestart();
					this.start();
				});

			return;
		}

		// If the process is not running (completed, stopped, crashed, etc.),
		// simply prepare and start immediately
		this.prepareForRestart();
		this.start();
	}

	isRunning(): boolean {
		return this._status === 'running' || this._status === 'ready';
	}

	getStatus(): ProcessStatus {
		return this._status;
	}

	sendStdin(input: string, secret: boolean = false): void {
		if (!this._process || !this._process.stdin) {
			throw new Error('Process stdin is not available');
		}

		if (!this.isRunning()) {
			throw new Error('Cannot send stdin to a process that is not running');
		}

		try {
			this._process.stdin.write(input + '\n');
			this.logger.addChunk(
				input,
				false,
				secret ? 'UserInputSecret' : 'UserInput',
			);
		} catch (error: any) {
			throw new Error(`Failed to write to stdin: ${error.message}`);
		}
	}
}
