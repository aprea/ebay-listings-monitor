module.exports = {
	apps: [
		{
			name: 'ebay-listings-monitor',
			script: 'bun',
			args: 'run index.ts',
			cwd: '~/git/ebay-listings-monitor',
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: '1G',
			env: {
				NODE_ENV: 'production',
				PATH: '/home/linuxbrew/.linuxbrew/bin:/usr/local/bin:/usr/bin:/bin',
			},
			error_file: './logs/error.log',
			out_file: './logs/out.log',
			log_file: './logs/combined.log',
			time: true,
			merge_logs: true,
			max_restarts: 10,
			min_uptime: '10s',
			restart_delay: 4000,
			exp_backoff_restart_delay: 100,
		},
	],
};
