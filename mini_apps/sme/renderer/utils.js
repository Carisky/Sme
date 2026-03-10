export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function basename(filePath) {
  if (!filePath) {
    return "";
  }

  return String(filePath).split(/[\\/]/).pop();
}

export function getValueAtPath(object, path) {
  return String(path || "")
    .split(".")
    .reduce((current, key) => current?.[key], object);
}

export function setValueAtPath(object, path, value) {
  const parts = String(path || "").split(".");
  const lastKey = parts.pop();
  let current = object;

  for (const key of parts) {
    if (!(key in current)) {
      current[key] = {};
    }

    current = current[key];
  }

  current[lastKey] = value;
}

export function getDateSeparatorForPath(path = "") {
  if (path === "entryDate") {
    return "-";
  }

  if (path === "letter.printDate") {
    return ".";
  }

  if (/^correctionRows\.\d+\.noteDate$/.test(path)) {
    return "-";
  }

  return null;
}

function normalizeDateParts(yearText, monthText, dayText) {
  let year = String(yearText || "").trim();
  const month = String(monthText || "").trim().padStart(2, "0");
  const day = String(dayText || "").trim().padStart(2, "0");

  if (year.length === 2) {
    year = Number(year) >= 70 ? `19${year}` : `20${year}`;
  }

  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    return null;
  }

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return { year, month, day };
}

export function formatDateForControlValue(path, rawValue) {
  const separator = getDateSeparatorForPath(path);
  const text = String(rawValue ?? "").trim();
  if (!separator || !text) {
    return text;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const match = text.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})$/);
  if (!match) {
    return "";
  }

  const parts = normalizeDateParts(match[3], match[2], match[1]);
  if (!parts) {
    return "";
  }

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatDateFromControlValue(path, rawValue) {
  const separator = getDateSeparatorForPath(path);
  const text = String(rawValue ?? "").trim();
  if (!separator || !text) {
    return text;
  }

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return "";
  }

  const parts = normalizeDateParts(match[1], match[2], match[3]);
  if (!parts) {
    return "";
  }

  return `${parts.day}${separator}${parts.month}${separator}${parts.year}`;
}

export function readControlValue(input) {
  if (input instanceof HTMLInputElement && input.type === "checkbox") {
    return input.checked;
  }

  if (input instanceof HTMLInputElement && input.type === "date" && input.dataset.path) {
    return formatDateFromControlValue(input.dataset.path, input.value);
  }

  return input.value;
}

export function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export function waitForImages(container) {
  const images = Array.from(container.querySelectorAll("img"));
  if (images.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(
    images.map(
      (image) =>
        new Promise((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }

          function settle() {
            image.removeEventListener("load", settle);
            image.removeEventListener("error", settle);
            resolve();
          }

          image.addEventListener("load", settle, { once: true });
          image.addEventListener("error", settle, { once: true });
        })
    )
  );
}
