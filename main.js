const { app } = require("electron");
const { initializeRejContRuntimeEnv } = require("./src/rej-cont/env");
const { bootstrapMainApp } = require("./src/main/bootstrap");
const { runIconAssetGenerator } = require("./src/main/icon-asset-generator");

initializeRejContRuntimeEnv();

if (process.argv.includes("--generate-icons")) {
  runIconAssetGenerator()
    .then(() => {
      app.quit();
    })
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });
} else {
  bootstrapMainApp();
}
