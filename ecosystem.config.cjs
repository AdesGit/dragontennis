module.exports = {
  apps: [
    {
      name: "tennis",
      cwd: "/var/www/tennis",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      env: { NODE_ENV: "production" },
    },
  ],
};
