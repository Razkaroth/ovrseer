import {Ovrseer} from '@ovrseer/core';
import {Skywatch} from '../skywatch.js';

// Dev runner for @ovrseer/skywatch
// This file is intentionally inside `src/dev` and excluded from builds and publishing.

function main() {
	try {
		const ovrseer = new Ovrseer();

		const skywatch = new Skywatch({ovrseer});
		// Render the minimal SkywatchTUI for live dev.
		skywatch.start();
	} catch (e: any) {
		console.error('Skywatch dev runner failed:', e.message);
		process.exit(1);
	}
}

if ((import.meta as any).main) {
	main();
}

export default main;
