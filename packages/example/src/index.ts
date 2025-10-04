import { ProcessManager, ManagedProcess, SimpleLogger } from '@ovrseer/core';
import { InkTUIWrapper } from '@ovrseer/tui-ink';

const tui = new InkTUIWrapper();
const pm = new ProcessManager({
	retries: 3,
	tui: tui,
});


const dbDependency = new ManagedProcess(
	'node',
	['-e', 'setInterval(() => console.log("Database is ready..."), 1000)'],
	[],
	new SimpleLogger(1000, 100),
);

const redisDependency = new ManagedProcess(
	'node',
	['-e', 'setInterval(() => console.log("Redis is ready..."), 1000)'],
	[],
	new SimpleLogger(1000, 100),
);

pm.addDependency('db', dbDependency);


const webServer = new ManagedProcess(
	'node',
	['-e', 'setInterval(() => console.log("Web server running..."), 2000)'],
	[],
	new SimpleLogger(1000, 100),
);

const apiServer = new ManagedProcess(
	'node',
	['-e', 'setInterval(() => console.log("API server responding..."), 3000)'],
	[],
	new SimpleLogger(1000, 100),
);

const worker = new ManagedProcess(
	'node',
	['-e', 'setInterval(() => console.log("Processing jobs..."), 4000)'],
	[],
	new SimpleLogger(1000, 100),
);

pm.addMainProcess('web-server', webServer);
pm.addMainProcess('api-server', apiServer);
pm.addMainProcess('worker', worker);

const cleanupProcess = new ManagedProcess(
	'sh',
	['echo "Cleaning up..."',
		'sleep 10',
		'echo "Cleaned up!"'],
	[],
	new SimpleLogger(1000, 100),
);

tui.init();
pm.start();

process.on('SIGINT', async () => {
	console.log('\nShutting down...');
	tui.destroy();
	process.exit(0);
});

process.on('SIGTERM', async () => {
	console.log('\nShutting down...');
	tui.destroy();
	process.exit(0);
});
