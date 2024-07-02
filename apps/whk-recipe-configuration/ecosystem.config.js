module.exports = {
  apps: [
    {
      name: 'whk-mes-backend',
      script: 'dist/main.js',
      instances: 'max', // Or specify the number of instances you want
      exec_mode: 'cluster', // Use cluster mode for load balancing
      watch: true, // Enable watch to restart on file changes
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '500M', // Restart if it exceeds 500MB
      max_cpu: 50, // Restart if CPU usage exceeds 50%
    },
  ],

  deploy: {
    production: {
      user: 'pmannion',
      host: '10.4.8.25',
      ref: 'origin/main',
      repo: 'git@github.com:WhiskeyHouse/whk-mes.git',
      // repo: 'https://pmannion2:@github.com/WhiskeyHouse/whk-mes.git',
      path: '/usr/local/src/repos/whk-mes-backend',
      'post-deploy':
        'cd apps/whk-recipe-configuration && npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      key: '~/.ssh/id_ed25519', // Specify the SSH key to use
    },
  },
};
