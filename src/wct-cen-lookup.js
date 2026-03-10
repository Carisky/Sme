const LOOKUP_URL = "http://85.11.79.242:3400/lookup";
const LOOKUP_CHUNK_SIZE = 50;

function normalizeContainerNumber(value) {
  return String(value || "").replace(/[\s\u00a0]+/g, "").toUpperCase();
}

function chunk(values = [], size = LOOKUP_CHUNK_SIZE) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function splitCsvLine(line) {
  const output = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      output.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  output.push(current);
  return output;
}

function asText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeItem(item) {
  return {
    cen: asText(item?.cen),
    tState: asText(item?.t_state),
    stop: asText(item?.stop),
  };
}

function parseLookupJson(data) {
  const payload =
    isRecord(data) && isRecord(data.map) ? data.map : isRecord(data) ? data : {};
  const map = new Map();

  Object.keys(payload).forEach((key) => {
    const containerNumber = normalizeContainerNumber(key);
    if (!containerNumber) {
      return;
    }

    const value = payload[key];
    if (typeof value === "string") {
      map.set(containerNumber, {
        cen: asText(value),
        tState: "",
        stop: "",
      });
      return;
    }

    map.set(containerNumber, normalizeItem(value));
  });

  return map;
}

function parseLookupCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerIndex = lines.findIndex((line) => /CEN\s*Number/i.test(line));
  if (headerIndex < 0) {
    return new Map();
  }

  const headers = splitCsvLine(lines[headerIndex]).map((value) =>
    value.replace(/^"|"$/g, "").trim()
  );
  const containerIndex = headers.findIndex((value) => /^container(\s*number)?$/i.test(value));
  const cenIndex = headers.findIndex((value) => /^cen(\s*number)?$/i.test(value));

  if (containerIndex < 0 || cenIndex < 0) {
    return new Map();
  }

  const map = new Map();

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const row = splitCsvLine(lines[index]).map((value) => value.replace(/^"|"$/g, "").trim());
    const containerNumber = normalizeContainerNumber(row[containerIndex]);
    if (!containerNumber) {
      continue;
    }

    map.set(containerNumber, {
      cen: asText(row[cenIndex]),
      tState: "",
      stop: "",
    });
  }

  return map;
}

async function lookupContainers(containers = [], options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Global fetch API jest niedostepne.");
  }

  const normalized = Array.from(
    new Set(containers.map(normalizeContainerNumber).filter(Boolean))
  );

  const lookupMap = new Map();
  const errors = [];

  for (const containerChunk of chunk(normalized, options.chunkSize || LOOKUP_CHUNK_SIZE)) {
    let response;
    try {
      response = await fetchImpl(options.url || LOOKUP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": options.apiKey || "dev-local-key",
        },
        body: JSON.stringify({
          containers: containerChunk,
          t_status: true,
        }),
      });
    } catch (error) {
      errors.push(`Blad sieci dla chunku ${containerChunk[0]}: ${error.message}`);
      continue;
    }

    if (!response.ok) {
      let reason = "";
      try {
        reason = await response.text();
      } catch {
        reason = "";
      }

      errors.push(`Serwis lookup zwrocil ${response.status} ${reason}`.trim());
      continue;
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const parsed = contentType.includes("application/json")
      ? parseLookupJson(await response.json())
      : parseLookupCsv(await response.text());

    parsed.forEach((value, key) => {
      lookupMap.set(key, {
        cen: asText(value.cen),
        tState: asText(value.tState),
        stop: asText(value.stop),
      });
    });
  }

  return {
    map: lookupMap,
    errors,
  };
}

module.exports = {
  LOOKUP_CHUNK_SIZE,
  LOOKUP_URL,
  lookupContainers,
};
