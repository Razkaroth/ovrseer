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

const mongo = new ProcessUnit(
	'docker',
	['compose', '-f', './src/docker-compose.yml', 'up', 'mongo'],
	[{logPattern: /mongod startup complete/, timeout: 10000}],
	new ProcessLogger(1000, 100),
);

const minio = new ProcessUnit(
	'docker',
	['compose', '-f', './src/docker-compose.yml', 'up', 'minio'],
	[{logPattern: / MinIO Object Storage Server/, timeout: 10000}],
	new ProcessLogger(1000, 100),
);

const ngrok = new ProcessUnit(
	'ngrok',
	'http --host-header=rewrite 3000'.split(' '),
	[{logPattern: /online/, timeout: 10000}],
	new ProcessLogger(1000, 100),
);

ovrseer.addDependency('Minio', minio);
ovrseer.addDependency('MongoDB', mongo);
ovrseer.addDependency('Ngrok Forwarding', ngrok);

const workerLogger = new ProcessLogger(1000, 100);
const worker = new ProcessUnit(
	'node',
	[
		'-e',
		'let count = 0; setInterval(() => { count++; console.log(`Processing job ${count}...`); if (count % 2 === 0) console.log("Job completed"); }, 4000)',
	],
	[],
	workerLogger,
);

const whoamiLogger = new ProcessLogger(1000, 100);
const whoami = new ProcessUnit(
	'docker',
	['compose', '-f', './src/docker-compose.yml', 'exec', 'mongo', 'whoami'],
	[],
	whoamiLogger,
);

ovrseer.addMainProcess('worker', worker);
ovrseer.addMainProcess('whoami', whoami);

const tui = new InkTUI();
tui.attachToManager(ovrseer);
ovrseer.start();
tui.init();
