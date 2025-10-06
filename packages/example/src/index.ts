import {Ovrseer, ProcessUnit, ProcessLogger} from '@ovrseer/core';
import {InkTUI} from '@ovrseer/tui-ink';

const tui = new InkTUI();
const pm = new Ovrseer({
	retries: 3,
});

const dbLogger = new ProcessLogger(1000, 100);
dbLogger.addFlag('ready', {
	pattern: /Database is ready!/,
	color: 'green',
	contextWindowSize: 3,
});
dbLogger.addFlag('errors', {
	pattern: /error|fail/i,
	color: 'red',
	targetCount: 0,
	contextWindowSize: 5,
});

const dbDependency = new ProcessUnit(
	'sh',
	[
		'-c',
		'sleep 1 && echo "Waiting for database to be ready..."; sleep 3; echo "Database is ready!"; sleep 20',
	],
	[{logPattern: /Database is ready!/, timeout: 5000}],
	dbLogger,
);

const redisLogger = new ProcessLogger(1000, 100);
redisLogger.addFlag('ready', {
	pattern: /Redis is ready/i,
	color: 'blue',
	targetCount: 5,
	contextWindowSize: 2,
});

const redisDependency = new ProcessUnit(
	'node',
	['-e', 'setInterval(() => console.log("Redis is ready..."), 1000)'],
	[
		{
			logPattern: /Redis is ready/i,
			timeout: 5000,
		},
	],
	redisLogger,
);

pm.addDependency('db', dbDependency);
pm.addDependency('redis', redisDependency);

const webLogger = new ProcessLogger(1000, 100);
webLogger.addFlag('requests', {
	pattern: /GET|POST|PUT|DELETE/i,
	color: 'yellow',
	contextWindowSize: 3,
});
webLogger.addFlag('errors', {
	pattern: /error|exception/i,
	color: 'red',
	targetCount: 0,
});

const webServer = new ProcessUnit(
	'node',
	[
		'-e',
		'setInterval(() => { const methods = ["GET", "POST", "PUT", "DELETE"]; console.log(methods[Math.floor(Math.random() * methods.length)] + " /api/endpoint"); }, 2000)',
	],
	[],
	webLogger,
);

const apiLogger = new ProcessLogger(1000, 100);
apiLogger.addFlag('success', {
	pattern: /200|201|204/,
	color: 'green',
	contextWindowSize: 2,
});
apiLogger.addFlag('slow-queries', {
	pattern: /slow query|timeout/i,
	color: 'orange',
	targetCount: 0,
});

const apiServer = new ProcessUnit(
	'node',
	[
		'-e',
		'setInterval(() => { const codes = [200, 201, 204]; console.log("Response: " + codes[Math.floor(Math.random() * codes.length)]); }, 3000)',
	],
	[],
	apiLogger,
);

const workerLogger = new ProcessLogger(1000, 100);
workerLogger.addFlag('jobs-processed', {
	pattern: /Job completed|Processing complete/i,
	color: 'purple',
	contextWindowSize: 3,
});
workerLogger.addFlag('retries', {
	pattern: /retry|retrying/i,
	color: 'yellow',
	targetCount: 3,
});

const worker = new ProcessUnit(
	'node',
	[
		'-e',
		'let count = 0; setInterval(() => { count++; console.log(`Processing job ${count}...`); if (count % 2 === 0) console.log("Job completed"); }, 4000)',
	],
	[],
	workerLogger,
);

pm.addMainProcess('web-server', webServer);
pm.addMainProcess('api-server', apiServer);
pm.addMainProcess('worker', worker);

const cleanupProcess1 = new ProcessUnit(
	'node',
	[
		'-e',
		'console.log("Cleaning up..."); setTimeout(() => console.log("Cleaned up!"), 2000)',
	],
	[
		{
			logPattern: /Cleaning up/i,
			timeout: 5000,
		},
	],
	new ProcessLogger(1000, 100),
);

const cleanupProcess2 = new ProcessUnit(
	'node',
	[
		'-e',
		'console.log("Cleaning up..."); setTimeout(() => console.log("Cleaned up!"), 2000)',
	],
	[],
	new ProcessLogger(1000, 100),
);

pm.addCleanupProcess('cleanup1', cleanupProcess1);
pm.addCleanupProcess('cleanup2', cleanupProcess2);

tui.init();
tui.attachToManager(pm);
pm.start();
