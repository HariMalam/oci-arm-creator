require('dotenv').config();
const app = require("./app");
const config = require("./config");
const { startVmCreatorJob } = require("./jobs/vmCreatorJob");


app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
  
  // Start the cron job after the server is running
  startVmCreatorJob();
});