export const apps = [
	{
		name: 'ebay-listings-monitor',
		script: 'index.ts',
		interpreter: 'bun',
		watch: true,
		env: {
			NODE_ENV: 'production',
			PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`,
		},
		error_file: './logs/error.log',
		out_file: './logs/out.log',
		log_file: './logs/combined.log',
	},
];
