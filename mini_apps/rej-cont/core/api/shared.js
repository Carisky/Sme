function asText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeContainerNumber(value) {
  return asText(value).replace(/[\s\u00a0]+/g, "").toUpperCase();
}

function normalizeContainers(containers) {
  if (!Array.isArray(containers)) {
    return [];
  }

  return Array.from(
    new Set(containers.map((entry) => normalizeContainerNumber(entry)).filter(Boolean))
  );
}

function createLookupPayload(entry = {}) {
  return {
    mrn: asText(entry.cen || entry.mrn),
    stop: asText(entry.stop),
    status: asText(entry.t_state || entry.status),
  };
}

async function postContainerLookup(options = {}) {
  const label = asText(options.label) || "REJ-CONT";
  const requestedContainers = normalizeContainers(options.containers);
  if (requestedContainers.length === 0) {
    return {
      terminalName: label,
      requestedContainers: [],
      map: {},
      missingContainers: [],
    };
  }

  const url = asText(options.url);
  if (!url) {
    throw new Error(`${label} lookup URL is not configured.`);
  }

  const headers = {
    "content-type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      containers: requestedContainers,
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`${label} lookup failed with ${response.status}: ${responseText || response.statusText}`);
  }

  let parsed = {};
  if (responseText) {
    try {
      parsed = JSON.parse(responseText);
    } catch (error) {
      throw new Error(`${label} lookup returned invalid JSON: ${error.message}`);
    }
  }

  const sourceMap = parsed?.map && typeof parsed.map === "object" ? parsed.map : {};
  const normalizedMap = {};

  for (const containerNumber of requestedContainers) {
    const entry = sourceMap[containerNumber];
    if (!entry || typeof entry !== "object") {
      continue;
    }

    normalizedMap[containerNumber] = createLookupPayload(entry);
  }

  return {
    terminalName: label,
    requestedContainers,
    map: normalizedMap,
    missingContainers: requestedContainers.filter((entry) => !normalizedMap[entry]),
  };
}

module.exports = {
  asText,
  createLookupPayload,
  normalizeContainerNumber,
  normalizeContainers,
  postContainerLookup,
};
