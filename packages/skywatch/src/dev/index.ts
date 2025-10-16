import React from 'react';
import {render} from 'ink';
import {createSkywatch, SkywatchTUI} from '../index.js';

// Dev runner for @ovrseer/skywatch
// This file is intentionally inside `src/dev` and excluded from builds and publishing.

function main() {
	try {
		const value = createSkywatch();
		console.log('Skywatch dev runner output:', value);

		// Render the minimal SkywatchTUI for live dev.
		render(React.createElement(SkywatchTUI as any));
	} catch (e: any) {
		console.error('Skywatch dev runner failed:', e.message);
		process.exit(1);
	}
}

if ((import.meta as any).main) {
	main();
}

export default main;
