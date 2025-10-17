import {Ovrseer, ProcessUnit, ProcessLogger} from '@ovrseer/core';
import {InkTUI} from '@ovrseer/tui-ink';

const tui = new InkTUI();
const pm = new Ovrseer({
	retries: 3,
});

const dbLogger = new ProcessLogger({
	maxBufferSize: 100,
	maxLogSize: 100,
});
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

const dbDependency = new ProcessUnit({
	command: 'sh',
	args: [
		'-c',
		'sleep 1 && echo "Waiting for database to be ready..."; sleep 3; echo "Database is ready!"; sleep 20',
	],
	readyChecks: [{logPattern: /Database is ready!/, timeout: 5000}],
	logger: dbLogger,
});

const redisLogger = new ProcessLogger({
	maxBufferSize: 1000,
	maxLogSize: 100,
});
redisLogger.addFlag('ready', {
	pattern: /Redis is ready/i,
	color: 'blue',
	targetCount: 5,
	contextWindowSize: 2,
});

const redisDependency = new ProcessUnit({
	command: 'node',
	args: ['-e', 'setInterval(() => console.log("Redis is ready..."), 1000)'],
	readyChecks: [
		{
			logPattern: /Redis is ready/i,
			timeout: 5000,
		},
	],
	logger: redisLogger,
});

pm.addDependency('db', dbDependency);
pm.addDependency('redis', redisDependency);

const webLogger = new ProcessLogger({
	maxBufferSize: 1000,
	maxLogSize: 100,
});
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

const webServer = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		'setInterval(() => { const methods = ["GET", "POST", "PUT", "DELETE"]; console.log(methods[Math.floor(Math.random() * methods.length)] + " /api/endpoint"); }, 2000)',
	],
	readyChecks: [],
	logger: webLogger,
});

const apiLogger = new ProcessLogger({
	maxBufferSize: 1000,
	maxLogSize: 100,
});
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

const apiServer = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		'setInterval(() => { const codes = [200, 201, 204]; console.log("Response: " + codes[Math.floor(Math.random() * codes.length)]); }, 3000)',
	],
	readyChecks: [],
	logger: apiLogger,
});

const workerLogger = new ProcessLogger({
	maxBufferSize: 1000,
	maxLogSize: 100,
});
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

const worker = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		'let count = 0; setInterval(() => { count++; console.log(`Processing job ${count}...`); if (count % 2 === 0) console.log("Job completed"); }, 4000)',
	],
	readyChecks: [],
	logger: workerLogger,
});

pm.addMainProcess('web-server', webServer);
pm.addMainProcess('api-server', apiServer);
pm.addMainProcess('worker', worker);

const helloLogger = new ProcessLogger({
	maxBufferSize: 1000,
	maxLogSize: 100,
});
const helloProcess = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		'process.stdin.setEncoding("utf8");process.stdout.write("What is your name?\\n");let buf="";process.stdin.on("data",d=>{buf+=d; if (buf.includes("\\n")){const name = buf.trim();console.log("Hi " + name + "!");process.exit(0);}});',
	],
	readyChecks: [],
	logger: helloLogger,
});
pm.addMainProcess('hello', helloProcess);

const cleanupProcess1 = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		'console.log("Cleaning up..."); setTimeout(() => console.log("Cleaned up!"), 2000)',
	],
	readyChecks: [
		{
			logPattern: /Cleaning up/i,
			timeout: 5000,
		},
	],
	logger: new ProcessLogger({maxBufferSize: 1000, maxLogSize: 100}),
});

const cleanupProcess2 = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		'console.log("Cleaning up..."); setTimeout(() => console.log("Cleaned up!"), 2000)',
	],
	readyChecks: [],
	logger: new ProcessLogger({maxBufferSize: 1000, maxLogSize: 100}),
});

pm.addCleanupProcess('cleanup1', cleanupProcess1);
pm.addCleanupProcess('cleanup2', cleanupProcess2);

tui.init();
tui.attachToManager(pm);
pm.start();
