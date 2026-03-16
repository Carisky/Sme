const { execFileSync } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const electronExecutable = require("electron");
const childEnv = { ...process.env };

delete childEnv.ELECTRON_RUN_AS_NODE;

execFileSync(electronExecutable, [rootDir, "--generate-icons"], {
  cwd: rootDir,
  env: childEnv,
  stdio: "inherit",
  windowsHide: true,
});
