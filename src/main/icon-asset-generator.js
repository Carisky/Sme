const fs = require("fs/promises");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const rootDir = path.resolve(__dirname, "..", "..");
const pngSize = 512;
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
let rendererWindow = null;

const jobs = [
  {
    source: path.join(rootDir, "assets", "silesdoc-mark.svg"),
    png: path.join(rootDir, "assets", "silesdoc-mark.png"),
    ico: path.join(rootDir, "assets", "silesdoc-icon.ico"),
  },
  {
    source: path.join(rootDir, "mini_apps", "sme", "icon.svg"),
    png: path.join(rootDir, "assets", "sme-mark.png"),
    ico: path.join(rootDir, "assets", "sme-icon.ico"),
  },
  {
    source: path.join(rootDir, "mini_apps", "wct-cen", "icon.svg"),
    ico: path.join(rootDir, "assets", "wct-cen-icon.ico"),
  },
  {
    source: path.join(rootDir, "mini_apps", "cen-imtreks", "icon.svg"),
    ico: path.join(rootDir, "assets", "cen-imtreks-icon.ico"),
  },
];

function createIcoBuffer(entries) {
  const headerSize = 6 + entries.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  let imageOffset = headerSize;
  entries.forEach((entry, index) => {
    const offset = 6 + index * 16;
    header[offset] = entry.size >= 256 ? 0 : entry.size;
    header[offset + 1] = entry.size >= 256 ? 0 : entry.size;
    header[offset + 2] = 0;
    header[offset + 3] = 0;
    header.writeUInt16LE(1, offset + 4);
    header.writeUInt16LE(32, offset + 6);
    header.writeUInt32LE(entry.buffer.length, offset + 8);
    header.writeUInt32LE(imageOffset, offset + 12);
    imageOffset += entry.buffer.length;
  });

  return Buffer.concat([header, ...entries.map((entry) => entry.buffer)]);
}

async function renderSvgToPngBuffer(sourcePath, size) {
  const svg = await fs.readFile(sourcePath, "utf8");
  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:transparent;overflow:hidden;">
    <img id="icon" src="${svgDataUrl}" alt="" style="display:block;width:${size}px;height:${size}px;" />
  </body>
</html>`;

  if (!rendererWindow || rendererWindow.isDestroyed()) {
    rendererWindow = new BrowserWindow({
      width: size,
      height: size,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      useContentSize: true,
      paintWhenInitiallyHidden: true,
      backgroundColor: "#00000000",
      webPreferences: {
        backgroundThrottling: false,
        offscreen: true,
        sandbox: false,
      },
    });
  } else {
    rendererWindow.setContentSize(size, size);
  }

  await rendererWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await rendererWindow.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const icon = document.getElementById("icon");
      const done = () => {
        if (icon.decode) {
          icon.decode().then(resolve).catch(resolve);
          return;
        }
        resolve();
      };

      if (icon.complete && icon.naturalWidth > 0) {
        done();
        return;
      }

      icon.addEventListener("load", done, { once: true });
      icon.addEventListener("error", () => reject(new Error("Unable to load icon SVG.")), {
        once: true,
      });
    });
  `);
  await new Promise((resolve) => setTimeout(resolve, 40));
  const image = await rendererWindow.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  return image.resize({ width: size, height: size, quality: "best" }).toPNG();
}

async function writeJobOutputs(job) {
  if (job.png) {
    const pngBuffer = await renderSvgToPngBuffer(job.source, pngSize);
    await fs.writeFile(job.png, pngBuffer);
  }

  if (job.ico) {
    const entries = [];
    for (const size of icoSizes) {
      entries.push({
        size,
        buffer: await renderSvgToPngBuffer(job.source, size),
      });
    }
    await fs.writeFile(job.ico, createIcoBuffer(entries));
  }
}

async function runIconAssetGenerator() {
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("force-device-scale-factor", "1");
  app.commandLine.appendSwitch("high-dpi-support", "1");
  app.on("window-all-closed", (event) => {
    event.preventDefault();
  });

  await app.whenReady();

  try {
    for (const job of jobs) {
      await writeJobOutputs(job);
      console.log(`Generated icon assets from ${path.relative(rootDir, job.source)}`);
    }
  } finally {
    if (rendererWindow && !rendererWindow.isDestroyed()) {
      rendererWindow.destroy();
    }
    rendererWindow = null;
  }
}

module.exports = {
  runIconAssetGenerator,
};
