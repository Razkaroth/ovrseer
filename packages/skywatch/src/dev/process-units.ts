import {ProcessLogger, ProcessUnit} from '@ovrseer/core';

export const processUnits: {
	dependencies: {
		[key: string]: {
			name: string;
			processUnit: ProcessUnit;
		};
	};
	mainProcesses: {
		[key: string]: {
			name: string;
			processUnit: ProcessUnit;
		};
	};
	cleanupProcesses: {
		[key: string]: {
			name: string;
			processUnit: ProcessUnit;
		};
	};
} = {
	dependencies: {},
	mainProcesses: {},
	cleanupProcesses: {},
};

const sleep = (t = 1000) =>
	`await new Promise(resolve => setTimeout(resolve, ${t}));`;

const dbLogger = new ProcessLogger({
	maxBufferSize: 100,
	maxLogSize: 100,
});
dbLogger.addFlag('ready', {
	pattern: /Database is ready!/,
	color: 'green',
	contextWindowSize: 3,
});
dbLogger.addFlag('deletes', {
	pattern: /Deleted/i,
	color: 'red',
	contextWindowSize: 5,
});

const dbDependency = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		`(async () => {
		    console.log("Waiting for database to be ready...");
			console.log("Database is ready!");
			await new Promise(resolve => setTimeout(resolve, 2000));
     setInterval(() => {
        console.log("Wrote to database");
     }, 800);
     setInterval(() => {
        console.log("Read from database");
     }, 300);
     setInterval(() => {
        console.log("Deleted from database");
     }, 10000);
		})();
		`,
	],
	readyChecks: [{logPattern: /Database is ready!/, timeout: 5000}],
	logger: dbLogger,
});

processUnits.dependencies['db'] = {
	name: 'db',
	processUnit: dbDependency,
};

const redisLogger = new ProcessLogger({
	maxBufferSize: 1000,
	maxLogSize: 100,
});
redisLogger.addFlag('ready', {
	pattern: /Redis server started/i,
	color: 'blue',
	contextWindowSize: 2,
});
redisLogger.addFlag('connections', {
	pattern: /client connected|connections:/i,
	color: 'teal',
	contextWindowSize: 1,
});

const redisDependency = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		`(async () => {
			console.log("[Redis] Initializing Redis server...");
			${sleep(800)}
			console.log("[Redis] Redis server started on port 6379");
			let connCount = 0;
			setInterval(() => {
				connCount++;
				console.log("[Redis] Client connected. Active connections: " + connCount);
			}, 3000);
		})();`,
	],
	readyChecks: [
		{
			logPattern: /Redis server started/i,
			timeout: 5000,
		},
	],
	logger: redisLogger,
});

processUnits.dependencies['redis'] = {
	name: 'redis',
	processUnit: redisDependency,
};

const webLogger = new ProcessLogger({
	maxBufferSize: 1000,
	maxLogSize: 100,
});
webLogger.addFlag('deletes', {
	pattern: /DELETE/i,
	color: 'yellow',
	contextWindowSize: 2,
});
webLogger.addFlag('errors', {
	pattern: /error|exception|500|502/i,
	color: 'red',
	contextWindowSize: 3,
});

const webServerMain = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		`(async () => {
			console.log("[WebServer] Starting web server on port 3000...");
			${sleep(600)}
			console.log("[WebServer] Server ready");
			const methods = ["GET", "POST", "PUT", "DELETE"];
			let reqNum = 0;
			setInterval(() => {
				reqNum++;
				const method = methods[Math.floor(Math.random() * methods.length)];
				const endpoints = ["/api/users", "/api/posts", "/api/comments", "/health"];
				const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
				console.log("[WebServer] " + method + " " + endpoint + " - Request #" + reqNum);
				if (Math.random() > 0.9) console.log("[WebServer] error: Request timeout");
			}, 1500);
		})();`,
	],
	readyChecks: [{logPattern: /Server ready/, timeout: 5000}],
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
apiLogger.addFlag('client-errors', {
	pattern: /400|401|403|404/,
	color: 'orange',
	contextWindowSize: 2,
});
apiLogger.addFlag('server-errors', {
	pattern: /500|502|503/,
	color: 'red',
	contextWindowSize: 3,
});

const apiServerMain = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		`(async () => {
			console.log("[API] API server initializing...");
			${sleep(500)}
			console.log("[API] API server listening on port 3001");
			let respNum = 0;
			setInterval(() => {
				respNum++;
				const statusCodes = [200, 201, 201, 204, 400, 404, 500];
				const code = statusCodes[Math.floor(Math.random() * statusCodes.length)];
				console.log("[API] Response #" + respNum + " - Status: " + code);
			}, 2000);
		})();`,
	],
	readyChecks: [{logPattern: /API server listening/, timeout: 5000}],
	logger: apiLogger,
});

const workerLogger = new ProcessLogger({
	maxBufferSize: 1000,
	maxLogSize: 100,
});
workerLogger.addFlag('jobs-completed', {
	pattern: /Job completed|success/i,
	color: 'green',
	contextWindowSize: 2,
});
workerLogger.addFlag('retries', {
	pattern: /retry|retrying/i,
	color: 'yellow',
	contextWindowSize: 3,
});

const workerMain = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		`(async () => {
			console.log("[Worker] Job queue worker started");
			let jobNum = 0;
			setInterval(() => {
				jobNum++;
				console.log("[Worker] Processing job #" + jobNum + "...");
				if (Math.random() > 0.7) {
					console.log("[Worker] Job failed, retrying...");
				} else {
					console.log("[Worker] Job completed successfully");
				}
			}, 3500);
		})();`,
	],
	readyChecks: [{logPattern: /Job queue worker started/, timeout: 5000}],
	logger: workerLogger,
});

const echoLogger = new ProcessLogger({
	maxBufferSize: 1000,
	maxLogSize: 100,
});

// This ono reads from stdin and writes to stdout
const echoProcess = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		`while (true) {
			process.stdin.setEncoding("utf8");
      process.stdout.write("Echo service started\\n");
			let buf = "";
			process.stdin.on("data", d => {
				buf += d;
				if (buf.includes("\\n")) {
					console.log(buf.trim());
				}
				if (buf.includes("exit")) {
					process.exit(0);
				}
			});
		}`,
	],
	readyChecks: [{logPattern: /Echo service started/, timeout: 5000}],
	logger: echoLogger,
});

processUnits.mainProcesses['api'] = {
	name: 'api',
	processUnit: apiServerMain,
};
processUnits.mainProcesses['worker'] = {
	name: 'worker',
	processUnit: workerMain,
};

processUnits.mainProcesses['web'] = {
	name: 'web',
	processUnit: webServerMain,
};

processUnits.mainProcesses['echo'] = {
	name: 'echo',
	processUnit: echoProcess,
};

const cacheLogger = new ProcessLogger({
	maxBufferSize: 1000,
	maxLogSize: 100,
});
cacheLogger.addFlag('hits', {
	pattern: /cache hit/i,
	color: 'green',
	contextWindowSize: 1,
});
cacheLogger.addFlag('misses', {
	pattern: /cache miss/i,
	color: 'yellow',
	contextWindowSize: 1,
});

const cacheMain = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		`(async () => {
			console.log("[Cache] Cache service started");
			${sleep(300)}
			let accessNum = 0;
			setInterval(() => {
				accessNum++;
				if (Math.random() > 0.3) {
					console.log("[Cache] Cache hit - Key: user:" + accessNum);
				} else {
					console.log("[Cache] Cache miss - Key: product:" + accessNum);
				}
			}, 1200);
		})();`,
	],
	readyChecks: [{logPattern: /Cache service started/, timeout: 5000}],
	logger: cacheLogger,
});

processUnits.dependencies['cache'] = {
	name: 'cache',
	processUnit: cacheMain,
};

// Step 1: Starting cleanup tasks
const startCleanup = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		`(async () => {
			console.log("[Cleanup] Starting cleanup tasks...");
			${sleep(1000)}
		})();`,
	],
	readyChecks: [
		{
			logPattern: /Starting cleanup tasks.../i,
			timeout: 5000,
		},
	],
	logger: new ProcessLogger({
		maxBufferSize: 500,
		maxLogSize: 100,
	}),
});

// Step 2: Flush cache
const flushCacheProcess = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		`(async () => {
			console.log("[Cleanup] Flushing cache");
			${sleep(500)}
		})();`,
	],
	readyChecks: [
		{
			logPattern: /Flushing cache/i,
			timeout: 5000,
		},
	],
	logger: new ProcessLogger({
		maxBufferSize: 500,
		maxLogSize: 100,
	}),
});

// Step 3: Close database connections
const closeDbProcess = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		`(async () => {
			console.log("[Cleanup] Closing database connections");
			${sleep(500)}
		})();`,
	],
	readyChecks: [
		{
			logPattern: /Closing database connections/i,
			timeout: 5000,
		},
	],
	logger: new ProcessLogger({
		maxBufferSize: 500,
		maxLogSize: 100,
	}),
});

// Step 4: Finalize cleanup
const finalizeCleanup = new ProcessUnit({
	command: 'node',
	args: [
		'-e',
		`(async () => {
			console.log("[Cleanup] All cleanup tasks completed");
		})();`,
	],
	readyChecks: [
		{
			logPattern: /All cleanup tasks completed/i,
			timeout: 10000,
		},
	],
	logger: new ProcessLogger({
		maxBufferSize: 500,
		maxLogSize: 100,
	}),
});

processUnits.cleanupProcesses['start'] = {
	name: 'start',
	processUnit: startCleanup,
};
processUnits.cleanupProcesses['flush'] = {
	name: 'flush',
	processUnit: flushCacheProcess,
};
processUnits.cleanupProcesses['close'] = {
	name: 'close',
	processUnit: closeDbProcess,
};
processUnits.cleanupProcesses['finalize'] = {
	name: 'finalize',
	processUnit: finalizeCleanup,
};
