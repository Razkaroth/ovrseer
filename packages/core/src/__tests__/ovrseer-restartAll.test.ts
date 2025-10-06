import {describe, it, expect, vi, beforeEach} from 'vitest';
import {Ovrseer} from '../ovrseer';
import type {ProcessUnitI, ProcessStatus} from '../types';

function makeMockProcess(id: string): ProcessUnitI {
	let status: ProcessStatus = 'created';
	const logListeners: Array<(chunk: string) => void> = [];
	const errListeners: Array<(chunk: string) => void> = [];
	let readyResolve: () => void = () => {};
	const ready = new Promise<void>(res => (readyResolve = res));
	const finished = Promise.resolve();

	return {
		logger: {
			onLog(l) {
				logListeners.push(l);
				return () => {};
			},
			onError(l) {
				errListeners.push(l);
				return () => {};
			},
			getLogs() {
				return `[logs ${id}]`;
			},
			addChunk() {},
			reset() {},
		},
		ready,
		finished,
		start: vi.fn(() => {
			status = 'running';
			setTimeout(() => {
				status = 'ready';
				readyResolve();
			}, 0);
		}),
		stop: vi.fn(() => {
			status = 'stopped';
		}),
		kill: vi.fn(),
		isRunning: vi.fn(() => status === 'running' || status === 'ready'),
		getStatus: vi.fn(() => status),
		runReadyChecks: vi.fn(async () => {}),
		prepareForRestart: vi.fn(() => {
			status = 'created';
		}),
		restart: vi.fn(() => {
			status = 'created';
			status = 'running';
			setTimeout(() => {
				status = 'ready';
				readyResolve();
			}, 0);
		}),
		cleanup: vi.fn(),
		onExit: vi.fn(),
		onCrash: vi.fn(),
		onReady: vi.fn((cb: () => void) => {
			/* simulate immediate if ready */ if (status === 'ready') cb();
		}),
	};
}

describe('Ovrseer.restartAll', () => {
	let pm: Ovrseer;
	let statusMessages: string[] = [];

	beforeEach(() => {
		statusMessages = [];
		pm = new Ovrseer({
			waitTime: 5,
		});

		pm.on('status:message', data => {
			statusMessages.push(data.message);
		});
	});

	it('restarts dependencies before main', async () => {
		const depA = makeMockProcess('depA');
		const mainA = makeMockProcess('mainA');
		pm.addDependency('depA', depA);
		pm.addMainProcess('mainA', mainA);

		pm.start();

		await new Promise(r => setTimeout(r, 5));

		const depStartCalls = (depA.start as any).mock.calls.length;
		const mainStartCalls = (mainA.start as any).mock.calls.length;

		pm.restartAll();

		await new Promise(r => setTimeout(r, 50));

		expect((depA.start as any).mock.calls.length).toBeGreaterThan(
			depStartCalls,
		);
		expect((mainA.start as any).mock.calls.length).toBeGreaterThan(
			mainStartCalls,
		);

		expect(
			statusMessages.some((m: string) =>
				m.toLowerCase().includes('starting dependencies'),
			),
		).toBe(true);
		expect(
			statusMessages.some((m: string) =>
				m.toLowerCase().includes('starting main'),
			),
		).toBe(true);
		expect(
			statusMessages.some((m: string) => m.includes('All processes restarted')),
		).toBe(true);
	});
});
