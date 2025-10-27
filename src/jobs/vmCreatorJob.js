const cron = require('node-cron');
const { checkVM, tryCreateVM } = require('../services/ociService');
const config = require('../config');

function startVmCreatorJob() {
  console.log("Starting cron job...");
  
  // Schedule to run every 5 minutes
  const task = cron.schedule(config.cronSchedule, async () => {
    console.log(`\n[${new Date().toISOString()}] Running job...`);

    const vmExists = await checkVM();
    if (vmExists) {
      console.log("VM found. Stopping cron job.");
      task.stop();
      return;
    }

    const success = await tryCreateVM();
    if (success) {
      console.log("VM created or fatal error occurred. Stopping cron job.");
      task.stop();
    }
  });

  // Run one check immediately on start
  (async () => {
    console.log("Running initial check on startup...");
    const vmExists = await checkVM();
    if (vmExists) {
      console.log("VM found. Cron job will not start.");
      task.stop();
    } else {
      console.log("VM not found. Cron job is active.");
      // Optional: run create task immediately
      await tryCreateVM(); 
    }
  })();
}

module.exports = { startVmCreatorJob };