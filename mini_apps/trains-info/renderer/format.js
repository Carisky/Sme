export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatDateTime(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "-";
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatDate(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "-";
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

export function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-GB").format(number) : "-";
}

export function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "0%";
  }

  return `${Math.max(0, Math.min(100, Math.round(number)))}%`;
}

export function formatDelay(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) {
    return "on time";
  }

  const prefix = number > 0 ? "+" : "";
  return `${prefix}${Math.round(number)} min`;
}

function collectText(...values) {
  return values
    .flat()
    .map((value) => valueToText(value))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function collectFirstText(...values) {
  for (const value of values.flat()) {
    const text = directText(value);
    if (text) {
      return text;
    }
  }

  return "";
}

function directText(value, depth = 0) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }

  if (Array.isArray(value)) {
    return collectFirstText(...value);
  }

  if (typeof value !== "object") {
    return "";
  }

  const preferredKeys = [
    "name",
    "title",
    "label",
    "code",
    "stationName",
    "carrierName",
    "routeName",
    "trainNumber",
    "number",
    "id",
    "message",
    "text",
    "summary",
    "description",
  ];

  for (const key of preferredKeys) {
    if (key in value) {
      const text = directText(value[key], depth + 1);
      if (text) {
        return text;
      }
    }
  }

  if (depth >= 1) {
    return "";
  }

  const nestedKeys = ["currentStation", "nextStation", "origin", "destination", "journey", "route", "station", "sourcePayload", "rawPayload", "train", "carrier"];
  for (const key of nestedKeys) {
    if (key in value) {
      const text = directText(value[key], depth + 1);
      if (text) {
        return text;
      }
    }
  }

  return "";
}

export function valueToText(value, depth = 0) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }

  if (Array.isArray(value)) {
    return collectText(...value);
  }

  if (typeof value !== "object") {
    return "";
  }

  const preferredKeys = [
    "name",
    "title",
    "label",
    "code",
    "stationName",
    "carrierName",
    "routeName",
    "trainNumber",
    "number",
    "id",
    "message",
    "text",
    "summary",
    "description",
  ];

  for (const key of preferredKeys) {
    if (key in value) {
      const text = valueToText(value[key], depth + 1);
      if (text) {
        return text;
      }
    }
  }

  if (depth >= 2) {
    return "";
  }

  const nestedKeys = ["currentStation", "nextStation", "origin", "destination", "journey", "route", "station", "sourcePayload", "rawPayload", "train", "carrier"];
  for (const key of nestedKeys) {
    if (key in value) {
      const text = valueToText(value[key], depth + 1);
      if (text) {
        return text;
      }
    }
  }

  return Object.values(value)
    .map((entry) => valueToText(entry, depth + 1))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function parseProgress(rawProgress, rawStops = []) {
  const progress = rawProgress && typeof rawProgress === "object" ? rawProgress : {};
  const completed = Number(
    progress.completed ?? progress.completedStops ?? progress.done ?? progress.passed ?? progress.index
  );
  const total = Number(progress.total ?? progress.totalStops ?? rawStops.length);
  const percent = Number(
    progress.percent ??
      progress.progressPercent ??
      (Number.isFinite(completed) && Number.isFinite(total) && total > 0
        ? (completed / total) * 100
        : NaN)
  );

  if (!Number.isFinite(completed) && !Number.isFinite(total) && !Number.isFinite(percent)) {
    return null;
  }

  return {
    completed: Number.isFinite(completed) ? Math.max(0, Math.round(completed)) : 0,
    total: Number.isFinite(total) && total > 0 ? Math.round(total) : rawStops.length || 0,
    percent: Number.isFinite(percent)
      ? Math.max(0, Math.min(100, Math.round(percent)))
      : Number.isFinite(completed) && Number.isFinite(total) && total > 0
        ? Math.max(0, Math.min(100, Math.round((completed / total) * 100)))
        : 0,
  };
}

export function normalizeProgress(raw = {}, rawStops = []) {
  return parseProgress(raw, rawStops) || { completed: 0, total: rawStops.length || 0, percent: 0 };
}

export function getProgressLabel(progress) {
  return `${progress?.completed || 0}/${progress?.total || 0}`;
}

export function inferStatus(entry = {}) {
  const rawStatus = String(
    entry.status || entry.state || entry.operationStatus || entry.tripStatus || ""
  )
    .trim()
    .toLowerCase();

  if (rawStatus.includes("cancel") || rawStatus.includes("fail") || rawStatus.includes("problem")) {
    return "problem";
  }

  if (rawStatus.includes("completed") || rawStatus.includes("done") || rawStatus.includes("arrived")) {
    return "completed";
  }

  if (rawStatus.includes("station") || rawStatus.includes("at_station") || rawStatus.includes("dwell")) {
    return "at_station";
  }

  if (rawStatus.includes("transit") || rawStatus.includes("moving") || rawStatus.includes("running")) {
    return "in_transit";
  }

  if (rawStatus.includes("schedule") || rawStatus.includes("planned") || rawStatus.includes("ready")) {
    return "scheduled";
  }

  const progress = normalizeProgress(entry.progress, entry.stops || []);
  if (progress.percent >= 100) {
    return "completed";
  }

  if (Number(entry.delayMinutes) > 0 || Number(entry.delay) > 0) {
    return "problem";
  }

  if (entry.currentStation || entry.current_station) {
    return "at_station";
  }

  if (entry.nextStation || entry.next_station) {
    return "in_transit";
  }

  return "unknown";
}

export function statusLabel(status) {
  return status || "unknown";
}

export function statusTone(status) {
  switch (status) {
    case "completed":
      return "success";
    case "at_station":
    case "in_transit":
      return "info";
    case "problem":
      return "danger";
    case "scheduled":
      return "warning";
    default:
      return "neutral";
  }
}

export function pickPrimaryText(...values) {
  return collectFirstText(...values) || "-";
}

export function normalizeTrain(raw = {}) {
  const route = raw.route && typeof raw.route === "object" ? raw.route : {};
  const journey = raw.journey && typeof raw.journey === "object" ? raw.journey : {};
  const sourceStops =
    (Array.isArray(raw.stops) && raw.stops) ||
    (Array.isArray(route?.sourcePayload?.stations) && route.sourcePayload.stations) ||
    (Array.isArray(raw.route?.sourcePayload?.stations) && raw.route.sourcePayload.stations) ||
    [];
  const stops = sourceStops;
  const progress = normalizeProgress(
    journey.progress || raw.progress || {
      completed: journey.completedStops,
      total: journey.totalStops,
      percent: journey.progressPercent,
    },
    stops
  );
  const scheduleId = String(raw.scheduleId || raw.schedule_id || route.scheduleId || route.schedule_id || "").trim();
  const orderId = String(raw.orderId || raw.order_id || raw.trainOrderId || raw.train_order_id || route.orderId || route.order_id || "").trim();
  const operatingDate = String(raw.operatingDate || raw.operating_date || journey.operatingDate || route.operatingDate || raw.date || "").trim();
  const currentStation = pickPrimaryText(
    journey.currentStation,
    raw.currentStation,
    raw.current_station,
    raw.station
  );
  const nextStation = pickPrimaryText(journey.nextStation, raw.nextStation, raw.next_station);
  const routeName = pickPrimaryText(
    route.name,
    route.routeName,
    route.commercialCategorySymbol,
    route.nationalNumber,
    route.internationalDepartureNumber,
    route.internationalArrivalNumber,
    raw.routeName,
    raw.route_name,
    raw.lineName,
    scheduleId && orderId ? `Schedule ${scheduleId} / Order ${orderId}` : ""
  );
  const trainNumber = pickPrimaryText(raw.trainNumber, raw.number, raw.trainNo, raw.train_no, route.trainNumber, orderId);
  const carrierName = pickPrimaryText(route.carrierName, route.carrierCode, raw.carrierName, raw.carrier, raw.operatorName, raw.operator);
  const status = inferStatus({
    ...raw,
    ...journey,
    progress,
    currentStation,
    nextStation,
    stops,
  });

  return {
    raw,
    id: String(raw.id || route.id || journey.id || "").trim() || [scheduleId, orderId, operatingDate].filter(Boolean).join("/") || pickPrimaryText(trainNumber, operatingDate),
    scheduleId,
    orderId,
    operatingDate,
    trainNumber: trainNumber || (orderId ? `#${orderId}` : ""),
    routeName: routeName || (scheduleId && orderId ? `Schedule ${scheduleId} / Order ${orderId}` : ""),
    carrierName: carrierName || pickPrimaryText(route.carrierCode, raw.carrierCode, raw.operatorCode),
    status,
    currentStation,
    nextStation,
    plannedArrival: pickPrimaryText(
      journey.plannedCurrentArrival,
      journey.plannedNextArrival,
      raw.plannedArrival,
      raw.expectedArrival,
      raw.arrivalPlanned,
      raw.destination?.plannedArrival
    ),
    plannedDeparture: pickPrimaryText(
      journey.plannedCurrentDeparture,
      journey.plannedNextDeparture,
      raw.plannedDeparture,
      raw.expectedDeparture,
      raw.departurePlanned,
      raw.origin?.plannedDeparture
    ),
    actualArrival: pickPrimaryText(
      journey.currentStation?.actualArrival,
      raw.actualArrival,
      raw.arrivalActual
    ),
    actualDeparture: pickPrimaryText(
      journey.currentStation?.actualDeparture,
      raw.actualDeparture,
      raw.departureActual
    ),
    delayMinutes: Number(
      journey.currentDelayMinutes ??
        raw.delayMinutes ??
        raw.delay ??
        raw.delay_min ??
        0
    ),
    problems: Array.isArray(journey.problems)
      ? journey.problems
      : Array.isArray(raw.problems)
        ? raw.problems
        : Array.isArray(raw.disruptions)
          ? raw.disruptions
          : [],
    stops,
    progress,
  };
}

export function normalizeStop(raw = {}, index = 0, train = {}) {
  const actualSequence = Number(raw.actualSequenceNumber ?? raw.sequenceNumber ?? raw.orderNumber ?? raw.sequence ?? index + 1);
  const plannedSequence = Number(raw.plannedSequenceNumber ?? raw.plannedSequence ?? raw.orderNumber ?? actualSequence);
  const trainJourney = train.raw?.journey || train.journey || {};
  const currentSequence = Number(
    trainJourney.currentStation?.sequenceNumber ??
      trainJourney.currentStation?.plannedSequenceNumber ??
      trainJourney.completedStops ??
      train.progress?.completed ??
      -1
  );
  const isProblem = Boolean(
    raw.isCancelled ||
      raw.cancelled ||
      raw.canceled ||
      raw.skipped ||
      raw.problem ||
      raw.status === "cancelled"
  );
  let status = "upcoming";

  if (isProblem) {
    status = "problem";
  } else if (Number(raw.isCurrent ?? raw.current) === 1 || raw.current === true || plannedSequence === currentSequence || actualSequence === currentSequence) {
    status = "current";
  } else if (plannedSequence < currentSequence || actualSequence < currentSequence) {
    status = "completed";
  } else if (String(raw.status || "").toLowerCase().includes("completed")) {
    status = "completed";
  }

  return {
    raw,
    id: pickPrimaryText(raw.id, raw.stopId, raw.code, index),
    name: pickPrimaryText(raw.name, raw.stationName, raw.station, raw.title, `Stop ${index + 1}`),
    plannedArrival: pickPrimaryText(raw.plannedArrival, raw.arrivalPlanned, raw.arrival, raw.timePlanned),
    plannedDeparture: pickPrimaryText(
      raw.plannedDeparture,
      raw.departurePlanned,
      raw.departure,
      raw.timeDeparture
    ),
    actualArrival: pickPrimaryText(raw.actualArrival, raw.arrivalActual),
    actualDeparture: pickPrimaryText(raw.actualDeparture, raw.departureActual),
    delayMinutes: Number(
      raw.arrivalDelayMinutes ??
        raw.departureDelayMinutes ??
        raw.delayMinutes ??
        raw.delay ??
        0
    ),
    status,
    cancelled: Boolean(raw.cancelled || raw.canceled || raw.isCancelled),
    skipped: Boolean(raw.skipped),
    note: pickPrimaryText(raw.note, raw.problem, raw.message, raw.disruptionText),
    order: actualSequence || plannedSequence || index,
  };
}

export function normalizeNamedEntity(raw = {}, kind = "entity") {
  const name = pickPrimaryText(raw.name, raw.title, raw.label, raw.stationName, raw.carrierName);
  const code = pickPrimaryText(raw.code, raw.id, raw.stationCode, raw.carrierCode);
  const description = pickPrimaryText(raw.description, raw.note, raw.summary, raw.message);

  return {
    raw,
    id: pickPrimaryText(raw.id, code, name),
    code,
    name: name || code || kind,
    description,
    routeCount: Number(raw.routeCount ?? raw.routesCount ?? raw.trainsCount ?? raw.count ?? raw.counts?.routeConnections ?? 0),
    stopCount: Number(raw.stopCount ?? raw.stopsCount ?? raw.stationCount ?? raw.count ?? raw.counts?.routeStops ?? 0),
    trainCount: Number(raw.trainCount ?? raw.operationsCount ?? raw.count ?? raw.counts?.operationStations ?? 0),
    operatingDate: pickPrimaryText(raw.operatingDate, raw.date),
  };
}
