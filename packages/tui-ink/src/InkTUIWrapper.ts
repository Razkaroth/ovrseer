import React from 'react';
import {render} from 'ink';
import type {
	TUIRendererI,
	ProcessMap,
	TUIState,
	TUIKeyPressMeta,
	TUIProcessType,
} from './types.js';
import {InkTUIRenderer} from './InkTUIRenderer.js';

export class InkTUIWrapper implements TUIRendererI {
	private renderInstance: any = null;
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
		this.keyPressCallback = callback;
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
