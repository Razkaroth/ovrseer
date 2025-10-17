import {vi} from 'vitest';
import EventEmitter from 'events';
import {ProcessUnit} from '../process-unit';
import {ProcessLogger} from '../logger';
import type {ReadyCheck, ProcessUnitI, ProcessStatus} from '../types';

/**
 * Create a stub process object for tests with separate stdout and stderr event emitters.
 *
 * The returned `proc` is an EventEmitter that exposes `stdout` and `stderr` emitters,
 * a mocked `kill` function, and a numeric `pid` chosen between 0 and 99,999.
 *
 * @returns An object with:
 *  - `proc`: the stub process EventEmitter (has `stdout`, `stderr`, `kill`, and `pid`),
 *  - `stdout`: the process stdout EventEmitter,
 *  - `stderr`: the process stderr EventEmitter
 */
export function makeStubProc() {
	const stdout = new EventEmitter();
	const stderr = new EventEmitter();
	const proc = Object.assign(new EventEmitter(), {
		stdout,
		stderr,
		kill: vi.fn(),
		pid: Math.floor(Math.random() * 100000),
	});
	return {proc, stdout, stderr};
}

/**
 * Create a ProcessUnit for the given command, arguments, and readiness checks.
 *
 * @param command - The executable or command name to run
 * @param args - Command-line arguments passed to the process
 * @param checks - Array of readiness checks used to determine when the process is ready
 * @returns The constructed ProcessUnit (uses a default ProcessLogger if `logger` is not provided)
 */
export function createProcessUnit(
	command: string,
	args: string[],
	checks: ReadyCheck[],
	logger?: ProcessLogger,
) {
	const processLogger = logger ?? new ProcessLogger({maxBufferSize: 10, maxLogSize: 5});
	return new ProcessUnit({command, args, readyChecks: checks, logger: processLogger});
}

/**
 * Creates a mock ProcessUnitI for tests with controllable lifecycle hooks and mocked methods.
 *
 * The returned object implements ProcessUnitI with default mocked/no-op behavior; any properties provided in `overrides` are merged into the mock. The mock exposes a private `_triggerCrash(err)` helper that invokes a callback previously registered via `onCrash`.
 *
 * @param overrides - Partial fields to override on the default mock
 * @returns A ProcessUnitI mock with mocked lifecycle methods and a `_triggerCrash` helper
 */
export function fakeProcessUnit(overrides?: Partial<ProcessUnitI>) {
	let onCrashCb: ((err: Error) => void) | null = null;
	const logger = new ProcessLogger(10, 5);
	const base: Partial<ProcessUnitI> = {
		logger,
		ready: Promise.resolve(),
		finished: Promise.resolve(),
		start: vi.fn(),
		stop: vi.fn(),
		kill: vi.fn(),
		isRunning: vi.fn(() => false),
		getStatus: vi.fn(() => 'created' as ProcessStatus),
		runReadyChecks: vi.fn(() => Promise.resolve()),
		prepareForRestart: vi.fn(),
		restart: vi.fn(),
		cleanup: vi.fn(),
		onExit: vi.fn((_cb: any) => {}),
		onCrash(cb: (err: Error) => void) {
			onCrashCb = cb;
		},
		onReady: vi.fn((_cb: any) => {}),
	};

	const obj: ProcessUnitI = Object.assign(base, overrides) as ProcessUnitI;

	(obj as any)._triggerCrash = (err: Error) => {
		if (onCrashCb) onCrashCb(err);
	};

	return obj;
}

/**
 * Create a ProcessUnit and record it in the provided collection.
 *
 * @param createdProcesses - Array that will receive the newly created ProcessUnit
 * @param command - Command string used to construct the ProcessUnit
 * @param args - Command arguments passed to the ProcessUnit
 * @param checks - Readiness checks applied to the ProcessUnit
 * @returns The created ProcessUnit
 */
export function trackedCreateProcessUnit(
	createdProcesses: ProcessUnit[],
	command: string,
	args: string[],
	checks: ReadyCheck[],
	logger?: ProcessLogger,
) {
	const process = createProcessUnit(command, args, checks, logger);
	createdProcesses.push(process);
	return process;
}
