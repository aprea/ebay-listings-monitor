import path from 'path';
import cron from 'node-cron';
import pm2 from 'pm2';
import { promisify } from 'util';

const HEARTBEAT_FILE = path.join(process.cwd(), 'heartbeat.txt');
const PM2_PROCESS_NAME = 'ebay-listings-monitor';
const TIMEOUT_MINUTES = 2;

// Promisify PM2 methods for better async/await usage
const pm2Connect = promisify(pm2.connect.bind(pm2));
const pm2Restart = promisify(pm2.restart.bind(pm2));

let pm2Connected = false;

// Initialize PM2 connection
async function initializePM2() {
	if (!pm2Connected) {
		try {
			await pm2Connect();
			pm2Connected = true;
			console.log('Connected to PM2');
		} catch (error) {
			console.error('Failed to connect to PM2:', error);
			throw error;
		}
	}
}

async function checkHeartbeat() {
	console.log(`[${new Date().toISOString()}] Checking heartbeat...`);

	// Check if heartbeat file exists
	const heartbeatFile = Bun.file(HEARTBEAT_FILE);
	if (!(await heartbeatFile.exists())) {
		console.error('Heartbeat file not found, restarting process...');
		await restartProcess();
		return;
	}

	// Read the last heartbeat timestamp
	const heartbeatContent = await heartbeatFile.text();
	const lastHeartbeat = new Date(heartbeatContent.trim());

	if (isNaN(lastHeartbeat.getTime())) {
		console.error('Invalid heartbeat timestamp, restarting process...');
		await restartProcess();
		return;
	}

	// Check if heartbeat is older than timeout
	const now = new Date();
	const timeDifferenceMinutes =
		(now.getTime() - lastHeartbeat.getTime()) / (1000 * 60);

	console.log(
		`Last heartbeat: ${lastHeartbeat.toISOString()} (${timeDifferenceMinutes.toFixed(1)} minutes ago)`
	);

	if (timeDifferenceMinutes > TIMEOUT_MINUTES) {
		console.error(
			`Heartbeat is ${timeDifferenceMinutes.toFixed(1)} minutes old (timeout: ${TIMEOUT_MINUTES}min), restarting process...`
		);
		await restartProcess();
	} else {
		console.log('Heartbeat is healthy');
	}
}

async function restartProcess() {
	console.log(`Restarting PM2 process: ${PM2_PROCESS_NAME}`);

	// Restart the process
	await pm2Restart(PM2_PROCESS_NAME);

	console.log(`Successfully restarted process: ${PM2_PROCESS_NAME}`);
}

// Initialize PM2 connection on startup
async function startup() {
	try {
		await initializePM2();
		console.log(`Starting watchdog for PM2 process: ${PM2_PROCESS_NAME}`);
		console.log(
			`Checking heartbeat every minute (timeout: ${TIMEOUT_MINUTES} minutes)`
		);

		// Schedule the heartbeat check to run every minute
		const task = cron.schedule('* * * * *', checkHeartbeat, {
			noOverlap: true,
		});

		// Handle cron task events
		task.on('execution:overlap', () => {
			console.error(
				'Previous heartbeat check still running, overlap detected'
			);
		});

		// Keep the process alive
		console.log('Watchdog started successfully');

		// Graceful shutdown handling
		process.on('SIGTERM', async () => {
			console.log('Received SIGTERM, stopping watchdog...');
			task.stop();
			if (pm2Connected) {
				pm2.disconnect();
			}
			process.exit(0);
		});

		process.on('SIGINT', async () => {
			console.log('Received SIGINT, stopping watchdog...');
			task.stop();
			if (pm2Connected) {
				pm2.disconnect();
			}
			process.exit(0);
		});

		// Handle uncaught exceptions
		process.on('uncaughtException', async (error) => {
			console.error('Uncaught exception:', error);
			if (pm2Connected) {
				pm2.disconnect();
			}
			process.exit(1);
		});
	} catch (error) {
		console.error('Failed to start watchdog:', error);
		process.exit(1);
	}
}

// Start the watchdog
startup();
