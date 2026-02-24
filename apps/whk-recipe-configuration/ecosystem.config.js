module.exports = {
  apps: [
    {
      // Production Backend
      name: "whk-mes-backend",
      script: "dist/main.js",
      args: "-r newrelic", // Add the -r newrelic option here
      instances: 2, // Specify the number of instances directly
      exec_mode: "cluster", // Use cluster mode for load balancing
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },

    {
      // Staging Backend Application
      name: "whk-backend-staging",
      script: "./dist/main.js",
      cwd: __dirname,

      // Restart configuration
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,

      // Restart strategy
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: "1G",

      // Environment
      env_staging: {
        NODE_ENV: "production",
        PORT: 3000,
      },

      // Logging
      error_file: "./logs/backend-error.log",
      out_file: "./logs/backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,

      // Health check
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
    },

    {
      // ngrok Tunnel Process for Staging
      name: "ngrok-tunnel",
      script: "ngrok",
      args: "start whk-backend-staging --config ./ngrok.yml --log stdout",
      cwd: __dirname,

      // Restart configuration
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,

      // Aggressive restart for tunnel failures
      max_restarts: 100,
      min_uptime: "5s",
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: "300M",

      // Logging
      error_file: "./logs/ngrok-error.log",
      out_file: "./logs/ngrok-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,

      // Give ngrok time to establish tunnel
      wait_ready: false,
      listen_timeout: 15000,
      kill_timeout: 3000,
    },

    {
      // Health Monitor Process
      name: "ngrok-health-monitor",
      script: "../../scripts/ngrok-health-monitor.sh",
      cwd: __dirname,
      interpreter: "/bin/bash",

      // Restart configuration
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,

      // Less aggressive restart for monitor
      max_restarts: 10,
      min_uptime: "30s",
      restart_delay: 5000,

      // Logging
      error_file: "./logs/health-monitor-error.log",
      out_file: "./logs/health-monitor-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],

  deploy: {
    production: {
      user: "pmannion",
      host: "10.4.8.25",
      ref: "origin/main",
      repo: "git@github.com:WhiskeyHouse/whk-mes.git",
      // repo: 'https://pmannion2:@github.com/WhiskeyHouse/whk-mes.git',
      path: "/usr/local/src/repos/whk-mes-backend",
      "post-deploy": "bash deploy.sh", // Use the custom deployment script
      key: "~/.ssh/id_ed25519", // Specify the SSH key to use
    },

    staging: {
      // Staging runs locally with ngrok, no remote deployment needed
      // PM2 apps are managed via start-staging.sh script
    },
  },
};
