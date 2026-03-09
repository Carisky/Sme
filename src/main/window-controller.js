const path = require("path");
const { BrowserWindow } = require("electron");

function getWindowIconPath() {
  return path.join(
    __dirname,
    "..",
    "..",
    "assets",
    process.platform === "win32" ? "sme-icon.ico" : "sme-mark.png"
  );
}

function createWindowController() {
  let mainWindow = null;

  function createMainWindow() {
    mainWindow = new BrowserWindow({
      width: 1520,
      height: 980,
      minWidth: 1180,
      minHeight: 820,
      backgroundColor: "#e6e0d2",
      autoHideMenuBar: true,
      icon: getWindowIconPath(),
      webPreferences: {
        preload: path.join(__dirname, "..", "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    mainWindow.loadFile(path.join(__dirname, "..", "..", "app", "index.html"));
    return mainWindow;
  }

  function getMainWindow() {
    return mainWindow;
  }

  function hasMainWindow() {
    return Boolean(mainWindow && !mainWindow.isDestroyed());
  }

  function send(channel, payload) {
    if (!hasMainWindow()) {
      return;
    }

    mainWindow.webContents.send(channel, payload);
  }

  function setTitle(title) {
    if (!hasMainWindow()) {
      return;
    }

    mainWindow.setTitle(title);
  }

  return {
    createMainWindow,
    getMainWindow,
    hasMainWindow,
    send,
    setTitle,
  };
}

module.exports = {
  createWindowController,
};
