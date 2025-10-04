import { ProcessManager, ManagedProcess, SimpleLogger } from '@ovrseer/core';
import { InkTUIWrapper } from '@ovrseer/tui-ink';

const tui = new InkTUIWrapper();
const pm = new ProcessManager({
	retries: 3,
	tui: tui,
});

const dbDependency = new ManagedProcess(
	'sh',
	['-c', 'sleep 1 && echo "Waiting for database to be ready..."; sleep 3; echo "Database is ready!"; sleep 20'],
	[{ logPattern: /Database is ready!/, timeout: 5000 }],
	new SimpleLogger(1000, 100),
);

const redisDependency = new ManagedProcess(
	'node',
	['-e', 'setInterval(() => console.log("Redis is ready..."), 1000)'],
	[{
		logPattern: /.*ready.*/,
		timeout: 5000,
	}],
	new SimpleLogger(1000, 100),
);

pm.addDependency('db', dbDependency);
pm.addDependency('redis', redisDependency);

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

const cleanupProcess1 = new ManagedProcess(
	'node',
	[
		'-e',
		'console.log("Cleaning up..."); setTimeout(() => console.log("Cleaned up!"), 2000)',
	],
	[],
	new SimpleLogger(1000, 100),
);

const cleanupProcess2 = new ManagedProcess(
	'node',
	[
		'-e',
		'console.log("Cleaning up..."); setTimeout(() => console.log("Cleaned up!"), 2000)',
	],
	[],
	new SimpleLogger(1000, 100),
);


pm.addCleanupProcess('cleanup', cleanupProcess1);
pm.addCleanupProcess('cleanup', cleanupProcess2);

pm.startTuiSession();
pm.start();
