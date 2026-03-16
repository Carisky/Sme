const { app } = require("electron");
const { bootstrapMainApp } = require("./src/main/bootstrap");
const { runIconAssetGenerator } = require("./src/main/icon-asset-generator");

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
