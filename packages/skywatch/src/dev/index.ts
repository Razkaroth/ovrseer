import {Ovrseer} from '@ovrseer/core';
import {Skywatch} from '../skywatch.js';
import {processUnits} from './process-units.js';

// Dev runner for @ovrseer/skywatch
// This file is intentionally inside `src/dev` and excluded from builds and publishing.

function main() {
	try {
		const ovrseer = new Ovrseer();

		ovrseer.addDependency('db', processUnits.dependencies['db']!.processUnit);
		ovrseer.addDependency(
			'redis',
			processUnits.dependencies['redis']!.processUnit,
		);
		ovrseer.addDependency(
			'cache',
			processUnits.dependencies['cache']!.processUnit,
		);

		ovrseer.addMainProcess(
			'api',
			processUnits.mainProcesses['api']!.processUnit,
		);
		ovrseer.addMainProcess(
			'worker',
			processUnits.mainProcesses['worker']!.processUnit,
		);
		ovrseer.addMainProcess(
			'web',
			processUnits.mainProcesses['web']!.processUnit,
		);
		ovrseer.addMainProcess(
			'echo',
			processUnits.mainProcesses['echo']!.processUnit,
		);

		ovrseer.addCleanupProcess(
			'start',
			processUnits.cleanupProcesses['start']!.processUnit,
		);
		ovrseer.addCleanupProcess(
			'flush',
			processUnits.cleanupProcesses['flush']!.processUnit,
		);
		ovrseer.addCleanupProcess(
			'close',
			processUnits.cleanupProcesses['close']!.processUnit,
		);
		ovrseer.addCleanupProcess(
			'finalize',
			processUnits.cleanupProcesses['finalize']!.processUnit,
		);

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
