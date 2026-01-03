module.exports = {
  apps: [
    {
      name: 'onefunders-backend',
      script: 'tsx',
      args: 'src/server.ts',
      cwd: '/opt/onefunders/app/backend',
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/opt/onefunders/app/backend/logs/err.log',
      out_file: '/opt/onefunders/app/backend/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
    },
  ],
};

