const {
  asText,
  normalizeContainerNumber,
  normalizeContainers,
} = require("./shared");

const DEFAULT_BCT_LOOKUP_URL = "https://demo.polskipcs.pl/gateway/containers";
const DEFAULT_BCT_BATCH_SIZE = 10;

function asPositiveInteger(value, fallbackValue) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function chunkValues(values, chunkSize) {
  const chunks = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

function parseTimestamp(value) {
  const rawValue = asText(value);
  if (!rawValue) {
    return null;
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractMrnValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => asText(entry)).find(Boolean) || "";
  }

  return asText(value);
}

function createBctLookupPayload(entries) {
  const normalizedEntries = Array.isArray(entries)
    ? entries
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({
          timestamp: parseTimestamp(entry.timestamp),
          status: asText(entry.status),
          mrn: extractMrnValue(entry.mrn),
        }))
    : [];

  const latestStatusEntry = normalizedEntries.reduce((latest, entry) => {
    if (!entry.timestamp || !entry.status) {
      return latest;
    }
    if (!latest || entry.timestamp.getTime() > latest.timestamp.getTime()) {
      return entry;
    }
    return latest;
  }, null);

  const latestMrnEntry = normalizedEntries.reduce((latest, entry) => {
    if (!entry.timestamp || !entry.mrn) {
      return latest;
    }
    if (!latest || entry.timestamp.getTime() > latest.timestamp.getTime()) {
      return entry;
    }
    return latest;
  }, null);

  const payload = {};
  if (latestMrnEntry?.mrn) {
    payload.mrn = latestMrnEntry.mrn;
  }
  if (latestStatusEntry?.status) {
    payload.status = latestStatusEntry.status;
  }

  return Object.keys(payload).length > 0 ? payload : null;
}

async function fetchBctLookupBatch(containers, options = {}) {
  const requestedContainers = normalizeContainers(containers);
  if (requestedContainers.length === 0) {
    return [];
  }

  const requestUrl = new URL(options.baseUrl);
  requestUrl.searchParams.set("numbers", requestedContainers.join(","));

  const response = await fetch(requestUrl, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...(options.headers || {}),
    },
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `BCT lookup failed with ${response.status}: ${responseText || response.statusText}`
    );
  }

  if (!responseText) {
    return [];
  }

  try {
    const parsed = JSON.parse(responseText);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    throw new Error(`BCT lookup returned invalid JSON: ${error.message}`);
  }
}

async function lookupBctContainers(containers, options = {}) {
  const requestedContainers = normalizeContainers(containers);
  if (requestedContainers.length === 0) {
    return {
      terminalName: "BCT",
      requestedContainers: [],
      map: {},
      missingContainers: [],
    };
  }

  const baseUrl = asText(
    options.url || process.env.REJ_CONT_BCT_LOOKUP_URL || DEFAULT_BCT_LOOKUP_URL
  );
  if (!baseUrl) {
    throw new Error("BCT lookup URL is not configured.");
  }
  const batchSize = asPositiveInteger(
    options.batchSize || process.env.REJ_CONT_BCT_LOOKUP_BATCH_SIZE,
    DEFAULT_BCT_BATCH_SIZE
  );
  const parsed = [];
  const batches = chunkValues(requestedContainers, batchSize);

  for (const batch of batches) {
    const batchEntries = await fetchBctLookupBatch(batch, {
      baseUrl,
      headers: options.headers,
    });
    parsed.push(...batchEntries);
  }

  const groupedEntries = new Map();
  requestedContainers.forEach((containerNumber) => {
    groupedEntries.set(containerNumber, []);
  });

  if (Array.isArray(parsed)) {
    parsed.forEach((entry) => {
      const containerNumber = normalizeContainerNumber(
        entry?.containerNumber || entry?.number
      );
      if (!containerNumber || !groupedEntries.has(containerNumber)) {
        return;
      }

      groupedEntries.get(containerNumber).push(entry);
    });
  }

  const map = {};
  for (const containerNumber of requestedContainers) {
    const payload = createBctLookupPayload(groupedEntries.get(containerNumber));
    if (payload) {
      map[containerNumber] = payload;
    }
  }

  return {
    terminalName: "BCT",
    requestedContainers,
    map,
    missingContainers: requestedContainers.filter((containerNumber) => !map[containerNumber]),
  };
}

module.exports = {
  DEFAULT_BCT_BATCH_SIZE,
  DEFAULT_BCT_LOOKUP_URL,
  lookupBctContainers,
};
