import {vi} from 'vitest';
import EventEmitter from 'events';
import {ProcessUnit} from '../process-unit';
import {ProcessLogger} from '../logger';
import type {ReadyCheck, ProcessUnitI, ProcessStatus} from '../types';

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

export function createProcessUnit(
	command: string,
	args: string[],
	checks: ReadyCheck[],
	logger?: ProcessLogger,
) {
	const simpleLogger = logger ?? new ProcessLogger(10, 5);
	return new ProcessUnit(command, args, checks, simpleLogger);
}

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
