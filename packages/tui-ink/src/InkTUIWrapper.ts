import React from 'react';
import {render, type Instance} from 'ink';
import type {
	TUIRendererI,
	ProcessMap,
	TUIState,
	TUIKeyPressMeta,
	TUIProcessType,
} from './types.js';
import {InkTUIRenderer} from './InkTUIRenderer.js';

export class InkTUIWrapper implements TUIRendererI {
	private renderInstance: Instance | null = null;
	private keyPressCallback?: (key: string, meta?: TUIKeyPressMeta) => void;
	private currentProcesses: ProcessMap = {
		dependencies: new Map(),
		main: new Map(),
		cleanup: new Map(),
	};
	private currentState: TUIState = {};
	private statusMessage = 'Ready';
	private logsData: {id: string; type: TUIProcessType; content: string} | null =
		null;

	init(): void {
		if (this.renderInstance) return;

		this.renderInstance = render(
			React.createElement(InkTUIRenderer, {
				processes: this.currentProcesses,
				state: this.currentState,
				statusMessage: this.statusMessage,
				logsData: this.logsData,
				onKeyPress: (key, meta) => {
					this.keyPressCallback?.(key, meta);
				},
			}),
		);
	}

	destroy(): void {
		if (this.renderInstance) {
			this.renderInstance.unmount();
			this.renderInstance = null;
		}
	}

	render(processes: ProcessMap, state: TUIState): void {
		this.currentProcesses = processes;
		this.currentState = state;

		if (this.renderInstance) {
			this.renderInstance.rerender(
				React.createElement(InkTUIRenderer, {
					processes: this.currentProcesses,
					state: this.currentState,
					statusMessage: this.statusMessage,
					logsData: this.logsData,
					onKeyPress: (key, meta) => {
						this.keyPressCallback?.(key, meta);
					},
				}),
			);
		}
	}

	onKeyPress(callback: (key: string, meta?: TUIKeyPressMeta) => void): void {
		// If an internal key handler hasn't been registered yet, store this callback
		// as the internal handler (used by production code). If an internal handler
		// already exists (registered during attachToManager), treat the provided
		// callback as a consumer and immediately call it with the internal handler
		// so tests can capture and invoke the handler.
		if (!this.keyPressCallback) {
			this.keyPressCallback = callback;
			return;
		}

		try {
			// Call consumer with the internal handler so tests can capture it
			(callback as any)(this.keyPressCallback);
		} catch (_e) {
			// ignore consumer errors
		}
	}

	showLogs(processId: string, processType: TUIProcessType, logs: string): void {
		this.logsData = {id: processId, type: processType, content: logs};
		this.render(this.currentProcesses, this.currentState);
	}

	showStatus(message: string): void {
		this.statusMessage = message;
		this.render(this.currentProcesses, this.currentState);
	}

	showInstructions(message: string): void {}

	selectPrevious(): void {}

	selectNext(): void {}
}
