module.exports = {
  apps: [
    {
      name: "jobportal-api",
      script: "dist/app.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "jobportal-worker",
      script: "dist/workers/index.worker.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
