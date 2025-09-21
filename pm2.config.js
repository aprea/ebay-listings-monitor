export const apps = [
	{
		name: 'ebay-listings-monitor',
		script: 'index.ts',
		interpreter: 'bun',
		watch: true,
		ignore_watch: ['logs', 'heartbeat.txt'],
		env: {
			NODE_ENV: 'production',
			PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`,
		},
		error_file: './logs/error.log',
		out_file: './logs/out.log',
		log_file: './logs/combined.log',
	},
	{
		name: 'watchdog',
		script: 'watchdog.ts',
		interpreter: 'bun',
		watch: true,
		ignore_watch: ['logs', 'heartbeat.txt'],
		env: {
			NODE_ENV: 'production',
			PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`,
		},
		error_file: './logs/watchdog-error.log',
		out_file: './logs/watchdog-out.log',
		log_file: './logs/watchdog-combined.log',
	},
];
