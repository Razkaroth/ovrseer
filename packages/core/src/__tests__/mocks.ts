import {vi} from 'vitest';
import EventEmitter from 'events';
import {ManagedProcess} from '../managed-process';
import {SimpleLogger} from '../logger';
import type {ReadyCheck, ManagedProcessI, ProcessStatus} from '../types';

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

export function createManagedProcess(
	command: string,
	args: string[],
	checks: ReadyCheck[],
	logger?: SimpleLogger,
) {
	const simpleLogger = logger ?? new SimpleLogger(10, 5);
	return new ManagedProcess(command, args, checks, simpleLogger);
}

export function fakeManagedProcess(overrides?: Partial<ManagedProcessI>) {
	let onCrashCb: ((err: Error) => void) | null = null;
	const logger = new SimpleLogger(10, 5);
	const base: Partial<ManagedProcessI> = {
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

	const obj: ManagedProcessI = Object.assign(
		base,
		overrides,
	) as ManagedProcessI;

	(obj as any)._triggerCrash = (err: Error) => {
		if (onCrashCb) onCrashCb(err);
	};

	return obj;
}

export function trackedCreateManagedProcess(
	createdProcesses: ManagedProcess[],
	command: string,
	args: string[],
	checks: ReadyCheck[],
	logger?: SimpleLogger,
) {
	const process = createManagedProcess(command, args, checks, logger);
	createdProcesses.push(process);
	return process;
}
