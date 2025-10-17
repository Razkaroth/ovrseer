/**
 * A managed process instance with lifecycle control and monitoring
 */
export type FlagColor =
	| 'green'
	| 'blue'
	| 'red'
	| 'yellow'
	| 'teal'
	| 'purple'
	| 'orange';

export interface FlagMatch {
	logIndex: number;
	matchedText: string;
	timestamp: number;
	contextWindowSize: number;
}

export interface Flag {
	pattern: RegExp | string;
	color: FlagColor;
	targetCount?: number;
	contextWindowSize?: number;
}

export interface FlagState {
	flag: Flag;
	count: number;
	matches: FlagMatch[];
}

export interface ProcessUnitI {
	readonly logger: ProcessLoggerI;
	readonly ready: Promise<void>;
	readonly finished: Promise<void>;

	start(): void;
	stop(timeout?: number, signal?: StopSignal): Promise<void>;
	kill(): void;
	isRunning(): boolean;
	getStatus(): ProcessStatus;

	runReadyChecks(): Promise<void>;

	// Prepare this instance for a restart. This resets internal state so
	// `start()` can be called again. Must not be called while the process
	// is running.
	prepareForRestart(): void;
	restart(): void;

	// Cleanup resources (timers, subscriptions). Tests call this directly
	// to ensure no leaks between runs.
	cleanup(): void;

	sendStdin(input: string, secret?: boolean): void;

	// Event-like methods for lifecycle hooks
	onExit(
		callback: (code: number | null, signal: NodeJS.Signals | null) => void,
	): () => void;
	onCrash(callback: (error: Error) => void): () => void;
	onReady(callback: () => void): () => void;
}

export type StopSignal = 'SIGINT' | 'SIGTERM' | 'SIGKILL';

export type LogType =
	| 'log'
	| 'error'
	| 'info'
	| 'warn'
	| 'debug'
	| 'UserInput'
	| 'UserInputSecret';

export interface LogEntry {
	content: string;
	type: LogType;
	time: number;
}

export type ProcessStatus =
	| 'created'
	| 'running'
	| 'ready'
	| 'stopping'
	| 'stopped'
	| 'completed'
	| 'failedByReadyCheck'
	| 'crashed'
	| 'couldNotSpawn';

type getLogsParams = {
	index?: number;
	numberOfLines?: number;
	separator?: string;
	mostRecentFirst?: boolean;
};

export interface ProcessLoggerI {
	onLog(listener: (chunk: string) => void): () => void;
	onError(listener: (chunk: string) => void): () => void;
	getLogs(options?: getLogsParams): string;
	getTypedLogs(): LogEntry[];
	addChunk(chunk: string, isError?: boolean, type?: LogType): void;
	reset(): void;

	addFlag(name: string, flag: Flag): void;
	removeFlag(name: string): void;
	getFlag(name: string): FlagState | undefined;
	getAllFlags(): Map<string, FlagState>;
	clearFlags(): void;
	getContextWindow(logIndex: number, windowSize: number): string[];
}

export interface ReadyCheck {
	logPattern: RegExp | string;
	timeout: number;
	passIfNotFound?: boolean; // for a  process that only needs some time to start and doesn't log anything
}

export type ProcessManagerEvents = {
	'manager:started': {timestamp: number};
	'manager:stopping': {timestamp: number};
	'manager:stopped': {timestamp: number};
	'manager:restarting': {timestamp: number};

	'process:added': {id: string; type: TUIProcessType; timestamp: number};
	'process:removed': {id: string; type: TUIProcessType; timestamp: number};
	'process:started': {id: string; type: TUIProcessType; timestamp: number};
	'process:stopping': {id: string; type: TUIProcessType; timestamp: number};
	'process:stopped': {
		id: string;
		type: TUIProcessType;
		code: number | null;
		signal: NodeJS.Signals | null;
		timestamp: number;
	};
	'process:ready': {id: string; type: TUIProcessType; timestamp: number};
	'process:crashed': {
		id: string;
		type: TUIProcessType;
		error: Error;
		retryCount?: number;
		timestamp: number;
	};
	'process:restarting': {id: string; type: TUIProcessType; timestamp: number};

	'status:message': {message: string; timestamp: number};
	'dependency:failed': {id: string; error: Error; timestamp: number};
	'cleanup:started': {timestamp: number};
	'cleanup:finished': {timestamp: number};
	'cleanup:timeout': {id: string; error: Error; timestamp: number};

	'state:update': {
		processes: ProcessMap;
		timestamp: number;
	};

	'process:log': {
		id: string;
		type: TUIProcessType;
		message: string;
		isError: boolean;
		timestamp: number;
	};
};

export interface OvrseerWorkTree {
	dependencies: Map<string, ProcessUnitI>;
	main: Map<string, ProcessUnitI>;
	cleanup: Map<string, ProcessUnitI>;
}

export interface OvrseerI {
	addDependency(id: string, process: ProcessUnitI): void;
	removeDependency(id: string): void;
	getDependency(id: string): ProcessUnitI | undefined;
	addMainProcess(id: string, process: ProcessUnitI): void;
	removeMainProcess(id: string): void;
	getMainProcess(id: string): ProcessUnitI | undefined;
	addCleanupProcess(id: string, process: ProcessUnitI): void;
	removeCleanupProcess(id: string): void;
	getCleanupProcess(id: string): ProcessUnitI | undefined;
	getCurrentWorkTree(): OvrseerWorkTree;

	start(): void;
	stop(): Promise<void>;

	restartProcess(id: string, processType?: TUIProcessType): void;
	stopProcess(id: string, processType?: TUIProcessType): void;

	restartAll(): void;
	restartAllMainProcesses(): void;

	readonly crashReporter?: CrashReporterI;

	on<K extends keyof ProcessManagerEvents>(
		event: K,
		listener: (data: ProcessManagerEvents[K]) => void,
	): void;
	addEventListener<K extends keyof ProcessManagerEvents>(
		event: K,
		listener: (data: ProcessManagerEvents[K]) => void,
	): void;
	off<K extends keyof ProcessManagerEvents>(
		event: K,
		listener: (data: ProcessManagerEvents[K]) => void,
	): void;
	removeEventListener<K extends keyof ProcessManagerEvents>(
		event: K,
		listener: (data: ProcessManagerEvents[K]) => void,
	): void;
}

// --- Crash reporting types ---

export type ReportType =
	| 'crash'
	| 'cleanupFailed'
	| 'dependencyFailed'
	| 'maxRetriesExceeded';

export interface CrashReport {
	timestamp: string; // ISO date string
	processId: string;
	processType: 'dependency' | 'main' | 'cleanup';
	type: ReportType;
	errorMessage: string;
	errorStack?: string;
	logs: string;
	status: ProcessStatus;
	retryCount?: number;
	context?: Record<string, any>;
}

export interface CrashReporterI {
	/**
	 * Create a CrashReport object from the provided process and context.
	 * Implementation may gather the process.logger.getLogs(...)
	 * and other metadata.
	 */
	generateReport(
		processId: string,
		process: ProcessUnitI,
		type: ReportType,
		context?: Record<string, any>,
	): CrashReport;

	/**
	 * Persist the report (file, upload, stdout, etc). Implementations decide how.
	 */
	saveReport(report: CrashReport): Promise<void>;

	getReports(): CrashReport[];
	clearReports(): void;
	getReportsDir(): string;
}

// --- TUI / rendering types ---

export type TUIProcessType = 'dependency' | 'main' | 'cleanup';

export type ProcessMap = {
	dependencies: Map<string, ProcessUnitI>;
	main: Map<string, ProcessUnitI>;
	cleanup: Map<string, ProcessUnitI>;
};

export interface TUIState {
	selectedProcessId?: string | null;
	selectedProcessType?: TUIProcessType;
	showHelp?: boolean;
	logScrollOffset?: number;
	filter?: string;
}

export interface TUIKeyPressMeta {
	index?: number;
	processInfo?: {
		id: string;
		type: TUIProcessType;
	};
}

/**
 * Minimal interface for a terminal renderer (neo-blessed or similar).
 * Keep cursor/alt-tab/tab behavior inside the implementation class.
 */
export interface TUIRendererI {
	/**
	 * Initialize terminal UI. Must be idempotent.
	 */
	init(): void;

	/**
	 * Tear down UI and restore terminal.
	 */
	destroy(): void;

	/**
	 * Render the current state (processes + selected state).
	 * Implementations should be efficient — only redraw what changes.
	 */
	render(processes: ProcessMap, state: TUIState): void;

	/**
	 * Register a keypress/callback hook. The Ovrseer will use this
	 * to map keys (r, q, arrows, tab, etc) to actions.
	 */
	onKeyPress(callback: (key: string, meta?: TUIKeyPressMeta) => void): void;

	/**
	 * Show logs for the selected process. The implementation decides paging.
	 */
	showLogs(processId: string, processType: TUIProcessType, logs: string): void;

	showStatus(message: string): void;

	/**
	 * Show usage / help instructions separate from transient status.
	 */
	showInstructions?(message: string): void;

	/**
	 * Move selection up in the process list.
	 */
	selectPrevious(): void;

	/**
	 * Move selection down in the process list.
	 */
	selectNext(): void;
}
