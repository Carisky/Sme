import { fetchCollection, fetchEntity, fetchPagedCollection, getApiBaseUrl } from "./api.js";
import {
  escapeHtml,
  formatDate,
  formatDateTime,
  formatDelay,
  formatNumber,
  formatPercent,
  getProgressLabel,
  inferStatus,
  normalizeNamedEntity,
  normalizeProgress,
  normalizeStop,
  normalizeTrain,
  pickPrimaryText,
  valueToText,
  statusLabel,
} from "./format.js";

const state = {
  data: { operations: [], routes: [], stations: [], carriers: [], disruptions: [] },
  pagination: {
    operations: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    routes: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    stations: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    carriers: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    disruptions: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
  },
  filters: {
    trainSearch: "",
    trainDate: "",
    trainStation: "",
    trainStatus: "all",
    stationSearch: "",
    carrierSearch: "",
    disruptionSearch: "",
    disruptionType: "all",
  },
  selected: { trainId: "", routeId: "", stationId: "", carrierId: "", disruptionId: "" },
  detail: { train: null, progress: null, stops: [] },
  sync: { status: "idle", partial: false, message: "Waiting for data.", lastSyncAt: "" },
};

const $ = (id) => document.getElementById(id);
const els = {
  apiBaseUrl: $("api-base-url"),
  syncStatus: $("sync-status"),
  recordCounts: $("record-counts"),
  metricGrid: $("metric-grid"),
  latestOperationsCount: $("latest-operations-count"),
  latestOperations: $("latest-operations"),
  activeDisruptionsCount: $("active-disruptions-count"),
  dashboardDisruptions: $("dashboard-disruptions"),
  refreshButton: $("refresh-button"),
  trainSearch: $("train-search"),
  trainDate: $("train-date"),
  trainStation: $("train-station"),
  trainStatus: $("train-status"),
  trainListCount: $("train-list-count"),
  trainList: $("train-list"),
  trainPagerTop: $("train-pager-top"),
  detailTitle: $("detail-title"),
  detailStatus: $("detail-status"),
  detailSummary: $("detail-summary"),
  progressFill: $("progress-fill"),
  progressText: $("progress-text"),
  progressPercent: $("progress-percent"),
  detailCurrentStation: $("detail-current-station"),
  detailNextStation: $("detail-next-station"),
  detailPlannedArrival: $("detail-planned-arrival"),
  detailPlannedDeparture: $("detail-planned-departure"),
  detailProblems: $("detail-problems"),
  detailTimeline: $("detail-timeline"),
  detailStops: $("detail-stops"),
  routeCount: $("route-count"),
  routeList: $("route-list"),
  routePagerTop: $("route-pager-top"),
  routeDetailTitle: $("route-detail-title"),
  routeDetailBody: $("route-detail-body"),
  stationSearch: $("station-search"),
  stationCount: $("station-count"),
  stationList: $("station-list"),
  stationPagerTop: $("station-pager-top"),
  stationDetailTitle: $("station-detail-title"),
  stationDetailBody: $("station-detail-body"),
  carrierSearch: $("carrier-search"),
  carrierCount: $("carrier-count"),
  carrierList: $("carrier-list"),
  carrierPagerTop: $("carrier-pager-top"),
  carrierDetailTitle: $("carrier-detail-title"),
  carrierDetailBody: $("carrier-detail-body"),
  disruptionSearch: $("disruption-search"),
  disruptionType: $("disruption-type"),
  disruptionCount: $("disruption-count"),
  disruptionList: $("disruption-list"),
  disruptionPagerTop: $("disruption-pager-top"),
  disruptionDetailTitle: $("disruption-detail-title"),
  disruptionDetailBody: $("disruption-detail-body"),
  statusText: $("status-text"),
  trainPager: $("train-pager"),
  routePager: $("route-pager"),
  stationPager: $("station-pager"),
  carrierPager: $("carrier-pager"),
  disruptionPager: $("disruption-pager"),
};

const join = (...values) =>
  Array.from(
    new Set(
      values
        .flat()
        .map((value) => valueToText(value))
        .filter(Boolean)
    )
  ).join(" ");

function setSection(sectionName) {
  document.querySelectorAll("[data-section]").forEach((section) => {
    section.classList.toggle("is-active", section.dataset.section === sectionName);
  });
  document.querySelectorAll("[data-section-button]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.sectionButton === sectionName);
  });
}

function setStatus(message) {
  els.statusText.textContent = message;
}

function cardHeader(title, subtitle, badge = "") {
  return `
    <div class="card-item__top">
      <div>
        <div class="card-item__title">${escapeHtml(title)}</div>
        <div class="card-item__subtle">${escapeHtml(subtitle)}</div>
      </div>
      ${badge}
    </div>
  `;
}

function metricCard(label, value, sublabel) {
  return `
    <article class="metric-card">
      <div class="metric-card__label">${escapeHtml(label)}</div>
      <div class="metric-card__value">${escapeHtml(value)}</div>
      <div class="card-item__subtle">${escapeHtml(sublabel)}</div>
    </article>
  `;
}

function statusBadge(status) {
  return `<span class="badge ${status === "problem" ? "badge--warn" : status === "completed" ? "badge--accent" : ""}">${escapeHtml(statusLabel(status))}</span>`;
}

function renderEmpty(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function normalizeRoute(raw = {}) {
  const stations = Array.isArray(raw.stations) ? raw.stations : Array.isArray(raw.stops) ? raw.stops : [];
  const scheduleId = String(raw.scheduleId || raw.schedule_id || raw.schedule || "").trim();
  const orderId = String(raw.orderId || raw.order_id || raw.order || "").trim();
  return {
    raw,
    id: String(raw.id || "").trim() || [scheduleId, orderId].filter(Boolean).join("/"),
    scheduleId,
    orderId,
    number: pickPrimaryText(raw.number, raw.routeNumber, raw.lineNumber),
    name: pickPrimaryText(raw.name, raw.title, raw.routeName, raw.lineName),
    carrierName: join(raw.carrierName, raw.carrier, raw.operatorName, raw.operator),
    stopCount: Number(raw.stopCount ?? raw.stopsCount ?? stations.length ?? 0),
    stations: stations.map((station) => normalizeNamedEntity(station, "station")),
  };
}

function normalizeStation(raw = {}) {
  return { ...normalizeNamedEntity(raw, "station"), trains: Array.isArray(raw.trains) ? raw.trains : [] };
}

function normalizeCarrier(raw = {}) {
  return { ...normalizeNamedEntity(raw, "carrier"), routes: Array.isArray(raw.routes) ? raw.routes : [] };
}

function normalizeDisruption(raw = {}) {
  return {
    ...normalizeNamedEntity(raw, "disruption"),
    title: join(raw.title, raw.name, raw.type, raw.code),
    type: join(raw.type, raw.category),
    message: join(raw.message, raw.text, raw.problem),
    stationName: join(raw.stationName, raw.station, raw.stationCode),
    routeName: join(raw.routeName, raw.route, raw.scheduleId),
  };
}

function trainCard(train) {
  const progress = train.progress || normalizeProgress({}, train.stops);
  return `
    <article class="card-item card-item--clickable" data-train-id="${escapeHtml(train.id)}">
      ${cardHeader(
        pickPrimaryText(train.trainNumber, train.id),
        join(train.routeName, train.carrierName) || "Route unavailable",
        statusBadge(train.status)
      )}
      <div class="card-item__meta">Operating date: ${escapeHtml(formatDate(train.operatingDate))}</div>
      <div class="card-item__chips">
        <span class="chip chip--info">${escapeHtml(getProgressLabel(progress))} | ${escapeHtml(formatPercent(progress.percent))}</span>
        <span class="chip">${escapeHtml(train.currentStation || "current: -")}</span>
        <span class="chip">${escapeHtml(train.nextStation || "next: -")}</span>
      </div>
      <div class="card-item__subtle">${escapeHtml(Number(train.delayMinutes) > 0 ? `Delay ${formatDelay(train.delayMinutes)}` : "No reported delay")}</div>
    </article>
  `;
}

function routeCard(route) {
  return `
    <article class="card-item card-item--clickable" data-route-id="${escapeHtml(route.id)}">
      ${cardHeader(pickPrimaryText(route.name, route.number, route.id), join(route.scheduleId, route.orderId, route.carrierName), statusBadge("scheduled"))}
      <div class="card-item__chips">
        <span class="chip">${escapeHtml(formatNumber(route.stopCount || route.stations.length || 0))} stops</span>
        <span class="chip">${escapeHtml(route.carrierName || "carrier: -")}</span>
      </div>
    </article>
  `;
}

function stationCard(station) {
  return `
    <article class="card-item card-item--clickable" data-station-id="${escapeHtml(station.id)}">
      ${cardHeader(pickPrimaryText(station.name, station.code), station.code || "Station", statusBadge("unknown"))}
      ${station.description ? `<div class="card-item__subtle">${escapeHtml(station.description)}</div>` : ""}
    </article>
  `;
}

function carrierCard(carrier) {
  return `
    <article class="card-item card-item--clickable" data-carrier-id="${escapeHtml(carrier.id)}">
      ${cardHeader(pickPrimaryText(carrier.name, carrier.code), carrier.code || "Carrier", statusBadge("unknown"))}
      ${carrier.description ? `<div class="card-item__subtle">${escapeHtml(carrier.description)}</div>` : ""}
    </article>
  `;
}

function disruptionCard(item) {
  return `
    <article class="card-item card-item--clickable" data-disruption-id="${escapeHtml(item.id)}">
      ${cardHeader(pickPrimaryText(item.title, item.type, item.id), join(item.stationName, item.routeName) || "Disruption", `<span class="badge badge--warn">${escapeHtml(item.type || "issue")}</span>`)}
      <div class="card-item__subtle">${escapeHtml(item.message || item.description || "")}</div>
    </article>
  `;
}

function filteredTrains() {
  const { trainSearch, trainDate, trainStation, trainStatus } = state.filters;
  const query = trainSearch.toLowerCase();

  return state.data.operations.filter((train) => {
    const text = join(
      train.trainNumber,
      train.routeName,
      train.carrierName,
      train.currentStation,
      train.nextStation,
      train.scheduleId,
      train.orderId
    ).toLowerCase();
    const matchesQuery = !query || text.includes(query);
    const matchesDate = !trainDate || train.operatingDate === trainDate || String(train.operatingDate).startsWith(trainDate);
    const matchesStation =
      !trainStation || join(train.currentStation, train.nextStation).toLowerCase().includes(trainStation.toLowerCase());
    const matchesStatus = trainStatus === "all" || train.status === trainStatus;
    return matchesQuery && matchesDate && matchesStation && matchesStatus;
  });
}

function getPaginationState(key) {
  return state.pagination[key] || { page: 1, pageSize: 25, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false };
}

function getPageSummary(key) {
  const pagination = getPaginationState(key);
  const totalItems = Number(pagination.totalItems) || 0;
  const totalPages = Number(pagination.totalPages) || 0;
  const page = Number(pagination.page) || 1;
  const pageSize = Number(pagination.pageSize) || 25;
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = totalItems === 0 ? 0 : Math.min(totalItems, start + Math.max(0, state.data[key].length - 1));

  return { totalItems, totalPages, page, pageSize, start, end };
}

function buildPaginationControls(key, label) {
  const pagination = getPaginationState(key);
  const summary = getPageSummary(key);
  const totalPages = Math.max(summary.totalPages, 1);
  if (summary.totalItems <= summary.pageSize && totalPages <= 1) {
    return "";
  }

  const currentPage = Math.min(Math.max(summary.page, 1), totalPages);
  const rangeText = summary.totalItems ? `${summary.start}-${summary.end} of ${summary.totalItems}` : "0 items";
  const pageButtons = [];
  const visiblePages = [];

  if (totalPages <= 5) {
    for (let page = 1; page <= totalPages; page += 1) {
      visiblePages.push(page);
    }
  } else {
    visiblePages.push(1);
    if (currentPage > 3) {
      visiblePages.push("...");
    }
    for (let page = Math.max(2, currentPage - 1); page <= Math.min(totalPages - 1, currentPage + 1); page += 1) {
      visiblePages.push(page);
    }
    if (currentPage < totalPages - 2) {
      visiblePages.push("...");
    }
    visiblePages.push(totalPages);
  }

  for (const page of visiblePages) {
    if (page === "...") {
      pageButtons.push(`<span class="pagination__ellipsis">...</span>`);
      continue;
    }

    pageButtons.push(`
      <button
        class="pagination__button${page === currentPage ? " is-active" : ""}"
        type="button"
        data-pagination-key="${escapeHtml(key)}"
        data-pagination-page="${escapeHtml(page)}"
        ${page === currentPage ? 'aria-current="page"' : ""}
      >
        ${escapeHtml(page)}
      </button>
    `);
  }

  return `
    <div class="pagination__summary">
      ${escapeHtml(label)}: page ${escapeHtml(currentPage)} / ${escapeHtml(totalPages)} | ${escapeHtml(rangeText)}
    </div>
    <div class="pagination__controls">
      <button class="pagination__button" type="button" data-pagination-key="${escapeHtml(key)}" data-pagination-page="${Math.max(1, summary.page - 1)}" ${pagination.hasPreviousPage ? "" : "disabled"}>
        Prev
      </button>
      ${pageButtons.join("")}
      <button class="pagination__button" type="button" data-pagination-key="${escapeHtml(key)}" data-pagination-page="${Math.min(totalPages, currentPage + 1)}" ${pagination.hasNextPage ? "" : "disabled"}>
        Next
      </button>
    </div>
  `;
}

function renderPagination(key, label, ...targetNodes) {
  const markup = buildPaginationControls(key, label);
  for (const targetNode of targetNodes) {
    if (targetNode) {
      targetNode.innerHTML = markup;
    }
  }
}

async function loadCollectionPage(key, page = 1) {
  const pathMap = {
    operations: "/api/trains/data/operations",
    routes: "/api/trains/data/routes",
    stations: "/api/trains/data/stations",
    carriers: "/api/trains/data/carriers",
    disruptions: "/api/trains/data/disruptions",
  };

  const normalizers = {
    operations: normalizeTrain,
    routes: normalizeRoute,
    stations: normalizeStation,
    carriers: normalizeCarrier,
    disruptions: normalizeDisruption,
  };

  const result = await fetchPagedCollection(pathMap[key], page);
  state.data[key] = result.items.map((item) => normalizers[key](item));
  state.pagination[key] = {
    page: Number(result.pagination?.page) || page || 1,
    pageSize: Number(result.pagination?.pageSize) || 25,
    totalItems: Number(result.pagination?.totalItems) || state.data[key].length,
    totalPages: Number(result.pagination?.totalPages) || 0,
    hasNextPage: Boolean(result.pagination?.hasNextPage),
    hasPreviousPage: Boolean(result.pagination?.hasPreviousPage),
  };

  return result;
}

async function loadTrainDetail(train) {
  if (!train?.scheduleId || !train?.orderId || !train?.operatingDate) {
    state.detail = { train: null, progress: null, stops: [] };
    renderTrainDetail(null);
    return;
  }

  const base = `/api/trains/data/operations/${encodeURIComponent(train.scheduleId)}/${encodeURIComponent(train.orderId)}/${encodeURIComponent(train.operatingDate)}`;
  const [detailResult, progressResult, stopsResult] = await Promise.allSettled([
    fetchEntity(base),
    fetchEntity(`${base}/progress`),
    fetchCollection(`${base}/stops`),
  ]);

  state.detail = {
    train: detailResult.status === "fulfilled" ? detailResult.value : null,
    progress: progressResult.status === "fulfilled" ? progressResult.value : null,
    stops: stopsResult.status === "fulfilled" ? stopsResult.value : [],
  };

  renderTrainDetail(train);
}

function renderTrainDetail(train) {
  if (!train) {
    els.detailTitle.textContent = "Select a train";
    els.detailStatus.textContent = "unknown";
    els.detailSummary.innerHTML = renderEmpty("Choose a train from the list to inspect route, progress, delays, and timeline.");
    els.progressFill.style.width = "0%";
    els.progressText.textContent = "0/0";
    els.progressPercent.textContent = "0%";
    els.detailCurrentStation.textContent = "-";
    els.detailNextStation.textContent = "-";
    els.detailPlannedArrival.textContent = "-";
    els.detailPlannedDeparture.textContent = "-";
    els.detailProblems.innerHTML = "";
    els.detailTimeline.innerHTML = "";
    els.detailStops.innerHTML = "";
    return;
  }

  const merged = {
    ...train,
    ...(state.detail.train || {}),
    progress: state.detail.progress || train.progress,
    stops: Array.isArray(state.detail.stops) && state.detail.stops.length ? state.detail.stops : train.stops,
  };
  const progress = normalizeProgress(merged.progress, merged.stops);
  const status = inferStatus(merged);
  const summary = [
    pickPrimaryText(merged.trainNumber, merged.id),
    join(merged.routeName, merged.carrierName),
    merged.operatingDate ? `Service date ${formatDate(merged.operatingDate)}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  els.detailTitle.textContent = pickPrimaryText(merged.trainNumber, merged.id);
  els.detailStatus.textContent = statusLabel(status);
  els.detailSummary.innerHTML = `
    <div class="card-item">
      <div class="card-item__top">
        <div>
          <div class="card-item__title">${escapeHtml(pickPrimaryText(merged.trainNumber, merged.id))}</div>
          <div class="card-item__subtle">${escapeHtml(summary)}</div>
        </div>
        ${statusBadge(status)}
      </div>
      <div class="card-item__chips">
        <span class="chip">${escapeHtml(merged.currentStation || "current: -")}</span>
        <span class="chip">${escapeHtml(merged.nextStation || "next: -")}</span>
        <span class="chip chip--info">${escapeHtml(getProgressLabel(progress))} | ${escapeHtml(formatPercent(progress.percent))}</span>
      </div>
    </div>
  `;

  els.progressFill.style.width = `${progress.percent}%`;
  els.progressText.textContent = getProgressLabel(progress);
  els.progressPercent.textContent = formatPercent(progress.percent);
  els.detailCurrentStation.textContent = merged.currentStation || "-";
  els.detailNextStation.textContent = merged.nextStation || "-";
  els.detailPlannedArrival.textContent = merged.plannedArrival || "-";
  els.detailPlannedDeparture.textContent = merged.plannedDeparture || "-";

  const problems = [];
  if (Number(merged.delayMinutes) > 0) {
    problems.push({ title: `Delay ${formatDelay(merged.delayMinutes)}`, text: "Train is reporting a delay." });
  }
  for (const problem of merged.problems || []) {
    problems.push({
      title: pickPrimaryText(problem.title, problem.type, "Issue"),
      text: pickPrimaryText(problem.message, problem.description, problem.text),
    });
  }
  els.detailProblems.innerHTML = problems.length
    ? problems
        .map(
          (problem) => `
            <div class="card-item">
              <div class="card-item__title">${escapeHtml(problem.title)}</div>
              <div class="card-item__subtle">${escapeHtml(problem.text)}</div>
            </div>
          `
        )
        .join("")
    : renderEmpty("No issues reported for this train.");

  const stops = (merged.stops || []).map((stop, index) => normalizeStop(stop, index, merged));
  els.detailTimeline.innerHTML = stops.length
    ? stops
        .map(
          (stop) => `
            <div class="timeline-item timeline-item--${escapeHtml(stop.status)}${stop.cancelled || stop.skipped ? " timeline-item--problem" : ""}">
              <div class="timeline-item__top">
                <strong class="timeline-item__station">${escapeHtml(stop.name)}</strong>
                <span class="badge">${escapeHtml(stop.status)}</span>
              </div>
              <div class="card-item__subtle">Planned ${escapeHtml(join(stop.plannedArrival, stop.plannedDeparture) || "-")}</div>
              <div class="card-item__subtle">Actual ${escapeHtml(join(stop.actualArrival, stop.actualDeparture) || "-")} | Delay ${escapeHtml(formatDelay(stop.delayMinutes))}</div>
              ${stop.note ? `<div class="card-item__subtle">${escapeHtml(stop.note)}</div>` : ""}
            </div>
          `
        )
        .join("")
    : renderEmpty("Ordered stop list is not available for this train.");

  els.detailStops.innerHTML = stops.length
    ? stops
        .map(
          (stop) => `
            <tr>
              <td>${escapeHtml(stop.name)}</td>
              <td>${escapeHtml(join(stop.plannedArrival, stop.plannedDeparture) || "-")}</td>
              <td>${escapeHtml(join(stop.actualArrival, stop.actualDeparture) || "-")}</td>
              <td>${escapeHtml(formatDelay(stop.delayMinutes))}</td>
              <td>${escapeHtml(stop.status)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="5">No stop list available.</td></tr>`;
}

function renderRouteDetail(route) {
  if (!route) {
    els.routeDetailTitle.textContent = "Select a route";
    els.routeDetailBody.innerHTML = "";
    return;
  }

  els.routeDetailTitle.textContent = pickPrimaryText(route.name, route.number, route.id);
  els.routeDetailBody.innerHTML = `
    <div class="card-item">
      <div class="card-item__title">${escapeHtml(pickPrimaryText(route.name, route.number, route.id))}</div>
      <div class="card-item__subtle">Schedule ${escapeHtml(route.scheduleId || "-")} / Order ${escapeHtml(route.orderId || "-")}</div>
      <div class="card-item__chips">
        <span class="chip">${escapeHtml(route.carrierName || "carrier: -")}</span>
        <span class="chip">${escapeHtml(formatNumber(route.stopCount || route.stations.length || 0))} stops</span>
      </div>
    </div>
    <div class="card-item">
      <div class="card-item__title">Stations</div>
      <div class="stack stack--compact">
        ${route.stations.length ? route.stations.map((station, index) => `<div class="card-item__subtle">${escapeHtml(index + 1)}. ${escapeHtml(pickPrimaryText(station.name, station.code))}</div>`).join("") : renderEmpty("No station list available for this route.")}
      </div>
    </div>
  `;
}

function renderStationDetail(station) {
  if (!station) {
    els.stationDetailTitle.textContent = "Select a station";
    els.stationDetailBody.innerHTML = "";
    return;
  }

  const linked = state.data.operations.filter((train) =>
    [train.currentStation, train.nextStation, train.routeName].join(" ").toLowerCase().includes(
      String(station.name || station.code || "").toLowerCase()
    )
  );

  els.stationDetailTitle.textContent = pickPrimaryText(station.name, station.code);
  els.stationDetailBody.innerHTML = `
    <div class="card-item">
      <div class="card-item__title">${escapeHtml(pickPrimaryText(station.name, station.code))}</div>
      <div class="card-item__subtle">Code ${escapeHtml(station.code || "-")}</div>
      <div class="card-item__chips"><span class="chip">${escapeHtml(formatNumber(linked.length))} trains</span></div>
      ${station.description ? `<div class="card-item__subtle">${escapeHtml(station.description)}</div>` : ""}
    </div>
    <div class="card-item">
      <div class="card-item__title">Linked trains</div>
      <div class="stack stack--compact">
        ${linked.length ? linked.slice(0, 8).map((train) => `<button class="card-item card-item--clickable" type="button" data-train-id="${escapeHtml(train.id)}"><div class="card-item__title">${escapeHtml(pickPrimaryText(train.trainNumber, train.id))}</div><div class="card-item__subtle">${escapeHtml(join(train.routeName, train.currentStation, train.nextStation))}</div></button>`).join("") : renderEmpty("No linked trains matched this station.")}
      </div>
    </div>
  `;
}

function renderCarrierDetail(carrier) {
  if (!carrier) {
    els.carrierDetailTitle.textContent = "Select a carrier";
    els.carrierDetailBody.innerHTML = "";
    return;
  }

  const linked = state.data.routes.filter((route) =>
    [route.carrierName, route.name].join(" ").toLowerCase().includes(String(carrier.name || carrier.code || "").toLowerCase())
  );

  els.carrierDetailTitle.textContent = pickPrimaryText(carrier.name, carrier.code);
  els.carrierDetailBody.innerHTML = `
    <div class="card-item">
      <div class="card-item__title">${escapeHtml(pickPrimaryText(carrier.name, carrier.code))}</div>
      <div class="card-item__subtle">Code ${escapeHtml(carrier.code || "-")}</div>
      <div class="card-item__chips"><span class="chip">${escapeHtml(formatNumber(linked.length))} routes</span></div>
      ${carrier.description ? `<div class="card-item__subtle">${escapeHtml(carrier.description)}</div>` : ""}
    </div>
    <div class="card-item">
      <div class="card-item__title">Related routes</div>
      <div class="stack stack--compact">
        ${linked.length ? linked.slice(0, 8).map((route) => `<div class="card-item__subtle">${escapeHtml(pickPrimaryText(route.name, route.number, route.id))}</div>`).join("") : renderEmpty("No related routes found.")}
      </div>
    </div>
  `;
}

function renderDisruptionDetail(disruption) {
  if (!disruption) {
    els.disruptionDetailTitle.textContent = "Select a disruption";
    els.disruptionDetailBody.innerHTML = "";
    return;
  }

  els.disruptionDetailTitle.textContent = pickPrimaryText(disruption.title, disruption.type, disruption.id);
  els.disruptionDetailBody.innerHTML = `
    <div class="card-item">
      <div class="card-item__title">${escapeHtml(pickPrimaryText(disruption.title, disruption.type, disruption.id))}</div>
      <div class="card-item__subtle">${escapeHtml(join(disruption.stationName, disruption.routeName) || "No linked station or route")}</div>
      ${disruption.message ? `<div class="card-item__subtle">${escapeHtml(disruption.message)}</div>` : ""}
      <div class="card-item__chips"><span class="chip chip--danger">${escapeHtml(disruption.type || "issue")}</span></div>
    </div>
    <div class="card-item">
      <div class="card-item__title">References</div>
      <div class="stack stack--compact">
        <div class="card-item__subtle">Route: ${escapeHtml(disruption.routeName || "-")}</div>
        <div class="card-item__subtle">Station: ${escapeHtml(disruption.stationName || "-")}</div>
      </div>
    </div>
  `;
}

function populateFilterOptions() {
  const stations = Array.from(new Set(state.data.operations.flatMap((train) => [train.currentStation, train.nextStation]).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  els.trainStation.innerHTML = [`<option value="">All stations</option>`, ...stations.map((station) => `<option value="${escapeHtml(station)}">${escapeHtml(station)}</option>`)].join("");
  els.trainStatus.innerHTML = [
    ["all", "All statuses"],
    ["scheduled", "scheduled"],
    ["at_station", "at_station"],
    ["in_transit", "in_transit"],
    ["completed", "completed"],
    ["unknown", "unknown"],
  ].map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
  const disruptionTypes = Array.from(new Set(state.data.disruptions.map((item) => String(item.type || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  els.disruptionType.innerHTML = [`<option value="all">All types</option>`, ...disruptionTypes.map((type) => `<option value="${escapeHtml(type.toLowerCase())}">${escapeHtml(type)}</option>`)].join("");
}

function renderAll() {
  const operationInfo = getPageSummary("operations");
  const routeInfo = getPageSummary("routes");
  const stationInfo = getPageSummary("stations");
  const carrierInfo = getPageSummary("carriers");
  const disruptionInfo = getPageSummary("disruptions");
  const counts = [
    operationInfo.totalItems || state.data.operations.length,
    routeInfo.totalItems || state.data.routes.length,
    stationInfo.totalItems || state.data.stations.length,
    carrierInfo.totalItems || state.data.carriers.length,
    disruptionInfo.totalItems || state.data.disruptions.length,
  ];
  els.recordCounts.textContent = counts.join(" / ");

  const delayed = state.data.operations.filter((train) => Number(train.delayMinutes) > 0).length;
  els.metricGrid.innerHTML = [
    metricCard("Operations", formatNumber(operationInfo.totalItems || state.data.operations.length), `${delayed} delayed on page ${operationInfo.page}`),
    metricCard("Routes", formatNumber(routeInfo.totalItems || state.data.routes.length), "Route catalog"),
    metricCard("Stations", formatNumber(stationInfo.totalItems || state.data.stations.length), "Station directory"),
    metricCard("Disruptions", formatNumber(disruptionInfo.totalItems || state.data.disruptions.length), "Active issues"),
  ].join("");

  els.latestOperationsCount.textContent = `${state.data.operations.length}${operationInfo.totalItems ? ` / ${operationInfo.totalItems}` : ""}`;
  els.activeDisruptionsCount.textContent = String(disruptionInfo.totalItems || state.data.disruptions.length);

  const trains = filteredTrains();
  els.trainListCount.textContent = String(trains.length);
  els.trainList.innerHTML = trains.length ? trains.slice(0, 200).map(trainCard).join("") : renderEmpty("No trains match the current filters.");
  els.latestOperations.innerHTML = state.data.operations.length ? state.data.operations.slice(0, 5).map(trainCard).join("") : renderEmpty("No operations loaded yet.");
  els.dashboardDisruptions.innerHTML = state.data.disruptions.length ? state.data.disruptions.slice(0, 5).map(disruptionCard).join("") : renderEmpty("No disruptions reported.");
  renderPagination("operations", "Operations", els.trainPagerTop, els.trainPager);

  els.routeCount.textContent = `${state.data.routes.length}${routeInfo.totalItems ? ` / ${routeInfo.totalItems}` : ""}`;
  els.routeList.innerHTML = state.data.routes.length ? state.data.routes.map(routeCard).join("") : renderEmpty("No routes loaded.");
  renderPagination("routes", "Routes", els.routePagerTop, els.routePager);

  const stations = state.data.stations.filter((station) => {
    const query = state.filters.stationSearch.toLowerCase();
    const text = join(station.name, station.code, station.description).toLowerCase();
    return !query || text.includes(query);
  });
  els.stationCount.textContent = `${state.data.stations.length}${stationInfo.totalItems ? ` / ${stationInfo.totalItems}` : ""}`;
  els.stationList.innerHTML = stations.length ? stations.map(stationCard).join("") : renderEmpty("No stations match the current search.");
  renderPagination("stations", "Stations", els.stationPagerTop, els.stationPager);

  const carriers = state.data.carriers.filter((carrier) => {
    const query = state.filters.carrierSearch.toLowerCase();
    const text = join(carrier.name, carrier.code, carrier.description).toLowerCase();
    return !query || text.includes(query);
  });
  els.carrierCount.textContent = `${state.data.carriers.length}${carrierInfo.totalItems ? ` / ${carrierInfo.totalItems}` : ""}`;
  els.carrierList.innerHTML = carriers.length ? carriers.map(carrierCard).join("") : renderEmpty("No carriers match the current search.");
  renderPagination("carriers", "Carriers", els.carrierPagerTop, els.carrierPager);

  const disruptions = state.data.disruptions.filter((item) => {
    const query = state.filters.disruptionSearch.toLowerCase();
    const type = state.filters.disruptionType;
    const text = join(item.title, item.type, item.message, item.stationName, item.routeName).toLowerCase();
    const typeOk = type === "all" || String(item.type || "").toLowerCase() === type;
    return typeOk && (!query || text.includes(query));
  });
  els.disruptionCount.textContent = `${state.data.disruptions.length}${disruptionInfo.totalItems ? ` / ${disruptionInfo.totalItems}` : ""}`;
  els.disruptionList.innerHTML = disruptions.length ? disruptions.map(disruptionCard).join("") : renderEmpty("No disruptions match the current filters.");
  renderPagination("disruptions", "Disruptions", els.disruptionPagerTop, els.disruptionPager);

  renderTrainDetail(state.data.operations.find((item) => item.id === state.selected.trainId) || trains[0] || null);
  renderRouteDetail(state.data.routes.find((item) => item.id === state.selected.routeId) || state.data.routes[0] || null);
  renderStationDetail(stations.find((item) => item.id === state.selected.stationId) || stations[0] || null);
  renderCarrierDetail(carriers.find((item) => item.id === state.selected.carrierId) || carriers[0] || null);
  renderDisruptionDetail(disruptions.find((item) => item.id === state.selected.disruptionId) || disruptions[0] || null);
}

async function loadData() {
  setStatus("Loading train data from api/trains/data...");
  els.refreshButton.disabled = true;

  const keys = ["operations", "routes", "stations", "carriers", "disruptions"];
  const results = await Promise.allSettled(
    keys.map((key) => loadCollectionPage(key, getPaginationState(key).page))
  );
  const failed = [];

  results.forEach((result, index) => {
    const key = keys[index];
    if (result.status === "fulfilled") {
      if (!state.pagination[key].totalItems && !state.data[key].length) {
        state.data[key] = [];
      }
    } else {
      failed.push(key);
      state.data[key] = [];
    }
  });

  state.sync = {
    status: failed.length ? "partial" : "ok",
    partial: failed.length > 0,
    message: failed.length ? `Loaded with ${failed.length} failed endpoint(s).` : "All datasets loaded successfully.",
    lastSyncAt: new Date().toISOString(),
  };

  els.syncStatus.textContent = `${state.sync.status.toUpperCase()}${state.sync.partial ? " / partial" : ""} | ${formatDateTime(state.sync.lastSyncAt)}`;
  setStatus(state.sync.message);

  populateFilterOptions();
  renderAll();
  els.refreshButton.disabled = false;
}

function applyFilterHandlers() {
  els.trainSearch.addEventListener("input", () => { state.filters.trainSearch = els.trainSearch.value.trim(); renderAll(); });
  els.trainDate.addEventListener("change", () => { state.filters.trainDate = els.trainDate.value; renderAll(); });
  els.trainStation.addEventListener("change", () => { state.filters.trainStation = els.trainStation.value; renderAll(); });
  els.trainStatus.addEventListener("change", () => { state.filters.trainStatus = els.trainStatus.value; renderAll(); });
  els.stationSearch.addEventListener("input", () => { state.filters.stationSearch = els.stationSearch.value.trim(); renderAll(); });
  els.carrierSearch.addEventListener("input", () => { state.filters.carrierSearch = els.carrierSearch.value.trim(); renderAll(); });
  els.disruptionSearch.addEventListener("input", () => { state.filters.disruptionSearch = els.disruptionSearch.value.trim(); renderAll(); });
  els.disruptionType.addEventListener("change", () => { state.filters.disruptionType = els.disruptionType.value; renderAll(); });
}

function installNavigation() {
  document.querySelectorAll("[data-section-button]").forEach((button) => {
    button.addEventListener("click", () => setSection(button.dataset.sectionButton));
  });
}

function installDelegation() {
  document.addEventListener("click", (event) => {
    const paginationNode = event.target.closest("[data-pagination-key]");
    if (paginationNode) {
      const key = paginationNode.dataset.paginationKey;
      const nextPage = Number(paginationNode.dataset.paginationPage) || 1;
      if (key && state.pagination[key] && nextPage !== state.pagination[key].page) {
        void (async () => {
          try {
            await loadCollectionPage(key, nextPage);
            renderAll();
          } catch (error) {
            console.error(error);
            setStatus(error.message);
          }
        })();
      }
      return;
    }

    const trainNode = event.target.closest("[data-train-id]");
    if (trainNode) {
      const train = state.data.operations.find((item) => item.id === trainNode.dataset.trainId);
      if (train) {
        state.selected.trainId = train.id;
        void loadTrainDetail(train);
      }
      return;
    }

    const routeNode = event.target.closest("[data-route-id]");
    if (routeNode) {
      state.selected.routeId = routeNode.dataset.routeId;
      renderRouteDetail(state.data.routes.find((item) => item.id === state.selected.routeId) || null);
      return;
    }

    const stationNode = event.target.closest("[data-station-id]");
    if (stationNode) {
      state.selected.stationId = stationNode.dataset.stationId;
      renderStationDetail(state.data.stations.find((item) => item.id === state.selected.stationId) || null);
      return;
    }

    const carrierNode = event.target.closest("[data-carrier-id]");
    if (carrierNode) {
      state.selected.carrierId = carrierNode.dataset.carrierId;
      renderCarrierDetail(state.data.carriers.find((item) => item.id === state.selected.carrierId) || null);
      return;
    }

    const disruptionNode = event.target.closest("[data-disruption-id]");
    if (disruptionNode) {
      state.selected.disruptionId = disruptionNode.dataset.disruptionId;
      renderDisruptionDetail(state.data.disruptions.find((item) => item.id === state.selected.disruptionId) || null);
    }
  });
}

async function bootstrap() {
  try {
    els.apiBaseUrl.textContent = getApiBaseUrl();
    await loadData();
  } catch (error) {
    console.error(error);
    setStatus(error.message);
    els.metricGrid.innerHTML = renderEmpty("Failed to load train data.");
  }
}

installNavigation();
installDelegation();
applyFilterHandlers();
els.refreshButton.addEventListener("click", () => bootstrap());
void bootstrap();
