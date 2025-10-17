import {render} from 'ink';
import {SkywatchI, SkywatchOptions} from './types';
import {OvrseerI} from '@ovrseer/core';
import React from 'react';
import {MainUI} from './components/MainUI';

export class Skywatch implements SkywatchI {
	private ovrseer: OvrseerI;
	private interval: NodeJS.Timeout | null = null;
	constructor(options: SkywatchOptions) {
		this.ovrseer = options.ovrseer;
	}
	start() {
		const instance = render(
			React.createElement(MainUI as any, {ovrseer: this.ovrseer}),
			{},
		);
		// this.interval = setInterval(() => {
		// 	instance.rerender(
		// 		React.createElement(MainUI as any, {ovrseer: this.ovrseer}),
		// 	);
		// }, 1000);
	}

	async stop() {
		await this.ovrseer.stop();
		if (this.interval) {
			clearInterval(this.interval);
		}
	}
}
