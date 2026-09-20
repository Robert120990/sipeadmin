module.exports = {
  apps: [
    {
      name: 'sipeadmin-backend',
      cwd: './backend',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 5001
      },
      env_file: './backend/.env',
      max_restarts: 10,
      restart_delay: 3000,
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      merge_logs: true,
      time: true
    },
    {
      name: 'sipeadmin-webhook',
      cwd: '.',
      script: 'webhook-server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        WEBHOOK_PORT: 7778
      },
      env_file: './backend/.env',
      max_restarts: 10,
      restart_delay: 3000,
      error_file: './logs/webhook-error.log',
      out_file: './logs/webhook-out.log',
      merge_logs: true,
      time: true
    }
  ]
};
