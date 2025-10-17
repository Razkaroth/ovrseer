import {
	Ovrseer,
	CrashReporter,
	ProcessUnit,
	ProcessLogger,
} from '@ovrseer/core';
import {InkTUI} from '@ovrseer/tui-ink';

const ovrseer = new Ovrseer({
	cleanupTimeout: 1000 * 60 * 2,
	crashReporter: new CrashReporter('./.ovrseer/crashes'),
	retries: 3,
});

const mongo = new ProcessUnit({
	command: 'docker',
	args: ['compose', '-f', './src/docker-compose.yml', 'up', 'mongo'],
	readyChecks: [{logPattern: /mongod startup complete/, timeout: 10000}],
	logger: new ProcessLogger({maxBufferSize: 1000, maxLogSize: 100}),
});

const minio = new ProcessUnit({
	command: 'docker',
	args: ['compose', '-f', './src/docker-compose.yml', 'up', 'minio'],
	readyChecks: [{logPattern: / MinIO Object Storage Server/, timeout: 10000}],
	logger: new ProcessLogger({maxBufferSize: 1000, maxLogSize: 100}),
});

const ngrok = new ProcessUnit({
	command: 'ngrok',
	args: 'http --host-header=rewrite 3000'.split(' '),
	readyChecks: [{logPattern: /online/, timeout: 10000}],
	logger: new ProcessLogger({maxBufferSize: 1000, maxLogSize: 100}),
});

ovrseer.addDependency('Minio', minio);
ovrseer.addDependency('MongoDB', mongo);
ovrseer.addDependency('Ngrok Forwarding', ngrok);

const workerLogger = new ProcessLogger({maxBufferSize: 1000, maxLogSize: 100});
const worker = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		'let count = 0; setInterval(() => { count++; console.log(`Processing job ${count}...`); if (count % 2 === 0) console.log("Job completed"); }, 4000)',
	],
	readyChecks: [],
	logger: workerLogger,
});

const whoamiLogger = new ProcessLogger({maxBufferSize: 1000, maxLogSize: 100});
const whoami = new ProcessUnit({
	command: 'docker',
	args: ['compose', '-f', './src/docker-compose.yml', 'exec', 'mongo', 'whoami'],
	readyChecks: [],
	logger: whoamiLogger,
});

ovrseer.addMainProcess('worker', worker);
ovrseer.addMainProcess('whoami', whoami);

const tui = new InkTUI();
tui.attachToManager(ovrseer);
ovrseer.start();
tui.init();
