import React from 'react';
import {render} from 'ink';
import {InkTUI} from '../index.js';

// Simple dev runner for the Ink TUI package.
// This file is intentionally inside `src/dev` and is excluded from published package
// via the package's `files` field (only `dist` is published).

function main() {
	// If InkTUI is a class/component export, adapt accordingly. This is a simple
	// example that renders the InkTUI component if available.
	try {
		render(React.createElement(InkTUI as any));
	} catch (e: any) {
		console.error('Could not render InkTUI in dev runner:', e.message);
		process.exit(1);
	}
}

if (require.main === module) {
	main();
}

export default main;
