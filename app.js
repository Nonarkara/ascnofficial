"use strict";

/* ============================================================
   ASCN Open Platform — tabbed living observatory
   Data: data/ascn-v2-data.json (project engine, 378 appendix rows)
         data/ascn-knowledge.json (narrative + structured reference)
         data/ascn-cities.json (38 city profiles + geo)
   ============================================================ */

const tileLayers = {
  map: { url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", attr: "&copy; OpenStreetMap &copy; CARTO" },
  night: { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attr: "&copy; OpenStreetMap &copy; CARTO" },
};

const TABS = ["overview", "history", "cities", "projects", "framework", "partners"];

const state = {
  data: null, K: null, C: [], L: null, LF: null,
  country: "all", focus: "all", search: "",
  citySearch: "", cityCountry: "all", selectedCity: null,
  mapMode: "map", map: null, tileLayer: null, markerLayer: null, markers: {}, mapReady: false,
  tab: "overview", rendered: new Set(),
  libSearch: "", libType: "all",
};

const fmt = new Intl.NumberFormat("en-US");
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const FOCUS_COLORS = {
  "Civic & Social": "#183a5a",
  "Built Infrastructure": "#b53a2e",
  "Quality Environment": "#2a7a4f",
  "Safety & Security": "#a86d14",
  "Industry & Innovation": "#5a3070",
  "Health & Well-Being": "#5a5a6a",
};

function esc(v) {
  return `${v ?? ""}`.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}
function latestReport() { return state.data.reports[state.data.reports.length - 1]; }
function usd(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 1e10 ? 0 : 2)}B`;
  if (n >= 1e6) return `$${Math.round(n / 1e6)}M`;
  return `$${fmt.format(n)}`;
}
function markerColor(year) {
  if (year >= 2026) return "#101418";
  if (year >= 2025) return "#b53a2e";
  if (year >= 2023) return "#a86d14";
  return "#183a5a";
}
function bar(label, value, max, cls = "", suffix = "", wide = false) {
  const w = max ? Math.max(2, (value / max) * 100) : 0;
  return `<div class="bar-row${wide ? " wide-label" : ""}"><span>${esc(label)}</span><div class="bar-track"><div class="bar-fill ${cls}" style="width:${w}%"></div></div><strong>${fmt.format(value)}${suffix}</strong></div>`;
}

function svgDonut(segments, size = 160) {
  const total = segments.reduce((s, d) => s + d.v, 0);
  const r = 54, cx = size / 2, cy = size / 2, sw = 22;
  const circ = 2 * Math.PI * r;
  let accumulated = 0;
  const arcs = segments.map(({ v, color }) => {
    const dash = (v / total) * circ;
    const dashOffset = circ - accumulated;
    const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-dasharray="${dash.toFixed(2)} ${(circ - dash).toFixed(2)}" stroke-dashoffset="${dashOffset.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})" />`;
    accumulated += dash;
    return arc;
  });
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${arcs.join("")}</svg>`;
}

function svgSpark(vals, w = 150, h = 44, color = "var(--ink)") {
  if (vals.length < 2) return "";
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const px = 4, py = 6;
  const pts = vals.map((v, i) => {
    const x = px + (i / (vals.length - 1)) * (w - px * 2);
    const y = range === 0 ? h / 2 : h - py - ((v - min) / range) * (h - py * 2);
    return [+x.toFixed(1), +y.toFixed(1)];
  });
  const ptStr = pts.map((p) => p.join(",")).join(" ");
  const area = `${pts[0][0]},${h - py + 2} ` + ptStr + ` ${pts[pts.length - 1][0]},${h - py + 2}`;
  const [lx, ly] = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:${w}px;height:${h}px;overflow:visible"><polygon points="${area}" fill="${color}" opacity="0.12"/><polyline points="${ptStr}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${lx}" cy="${ly}" r="2.5" fill="${color}"/></svg>`;
}

function svgLine(points, w = 280, h = 90) {
  if (points.length < 2) return "";
  const vals = points.map((p) => p.v);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const padT = 6, padB = 18, padL = 6, padR = 6;
  const scX = (i) => padL + (i / (points.length - 1)) * (w - padL - padR);
  const scY = (v) => padT + (1 - (v - minV) / (maxV - minV || 1)) * (h - padT - padB);
  const ptStr = points.map((p, i) => `${scX(i).toFixed(1)},${scY(p.v).toFixed(1)}`);
  const area = `M${scX(0).toFixed(1)},${(h - padB).toFixed(1)} L${ptStr.join(" L")} L${scX(points.length - 1).toFixed(1)},${(h - padB).toFixed(1)} Z`;
  const dots = points.map((p, i) => `<circle cx="${scX(i).toFixed(1)}" cy="${scY(p.v).toFixed(1)}" r="2.5" fill="var(--amber)" />`).join("");
  const labels = points.map((p, i) => `<text x="${scX(i).toFixed(1)}" y="${h - 3}" text-anchor="middle" fill="var(--muted)" font-size="8" font-family="inherit">${esc(p.label)}</text>`).join("");
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${area}" fill="var(--amber)" opacity="0.1" /><polyline points="${ptStr.join(" ")}" fill="none" stroke="var(--amber)" stroke-width="2" stroke-linejoin="round" />${dots}${labels}</svg>`;
}

/* ---------------- Routing ---------------- */
function setTab(tab, push = true) {
  if (!TABS.includes(tab)) tab = "overview";
  state.tab = tab;
  $$(".view").forEach((v) => { v.hidden = v.dataset.view !== tab; });
  $$("#tab-nav a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
  renderTab(tab);
  if (push && location.hash !== `#${tab}`) history.replaceState(null, "", `#${tab}`);
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function renderTab(tab) {
  if (tab === "cities") ensureMap();
  if (state.rendered.has(tab)) return;
  ({
    overview: renderOverview, history: renderHistory, cities: renderCitiesView,
    projects: renderProjects, framework: renderFramework, partners: renderPartners,
  }[tab] || (() => {}))();
  state.rendered.add(tab);
}

/* ---------------- Overview ---------------- */
function renderOverview() {
  const s = state.K.summary;
  const kpis = [
    [s.cities, "Cities", "across 11 countries"],
    [s.countries, "Countries", "10 AMS + Timor-Leste"],
    [s.projects, "Projects", "latest M&E cycle"],
    [s.ongoing, "Ongoing", "in implementation"],
    [s.completed, "Completed", "concluded"],
  ];
  $("#kpi-grid").innerHTML = kpis.map(([v, l, n]) => `<article class="kpi"><strong>${fmt.format(v)}</strong><span>${l} — ${n}</span></article>`).join("");
  $("#gap-headline").textContent = "The performance question no official report asks.";
  $("#gap-body").textContent = s.the_gap;
  $("#evidence-status").textContent = `${state.data.reports.length} M&E reports · ${state.data.projects.length} appendix rows · ${state.K.documents.length} source documents.`;
  const fa = [...state.K.framework.focus_areas].sort((a, b) => b.share - a.share);
  const max = Math.max(...fa.map((f) => f.share));
  $("#focus-mini").innerHTML = fa.map((f) => bar(f.name, f.share, max, f.name.includes("Built") ? "red" : "", "%")).join("");
  $("#glance-note").innerHTML = `<strong>Established</strong>${esc(s.established)} · ${esc(s.established_event)}.<br><strong>Framework</strong>${esc(s.framework_adopted)}.<br><strong>Mission</strong>${esc(s.mission)}`;
  renderPerspective();
}

function renderPerspective() {
  const p = state.K.perspective, st = state.K.stance;
  $("#perspective").innerHTML = `
    <div class="persp-stance">
      <p class="label">The stance</p>
      <h2>${esc(st.headline)}</h2>
      <p class="lede">${esc(st.body)}</p>
    </div>
    <div class="persp-article">
      <p class="label">${esc(p.kicker)}</p>
      <h3>${esc(p.author)}</h3>
      <p class="persp-role">${esc(p.role)} · ${esc(p.credentials)}</p>
      <p class="persp-framing">${esc(p.framing)}</p>
      <blockquote class="persp-quote">${esc(p.pull_quote)}</blockquote>
      <div class="persp-points">${p.points.map((pt) => `<div class="persp-point"><b>${esc(pt.h)}</b><span>${esc(pt.t)}</span></div>`).join("")}</div>
      <a class="persp-link" href="${esc(p.url)}" target="_blank" rel="noreferrer">Read the full essay — ${esc(p.source)} ↗</a>
    </div>`;
}

/* ---------------- History ---------------- */
function renderHistory() {
  const h = state.K.history;
  $("#history-timeline").innerHTML = h.milestones.map((m) => `
    <div class="timeline-item"><time>${esc(m.year)}</time><div><h3>${esc(m.title)}</h3><p>${esc(m.text)}</p></div></div>`).join("");
  const maxTotal = Math.max(...h.membership_evolution.map((e) => e.total));
  $("#growth-bars").innerHTML = h.membership_evolution.map((e) => bar(`${e.year}`, e.total, maxTotal, "", "")).join("");
  const chairs = state.K.governance.chairs.map((c) => `
    <div class="chair-row"><b>${esc(c.year)}</b><span>${esc(c.chair)} chair${c.note ? `<em>${esc(c.note)}</em>` : ""}</span></div>`).join("");
  const sheps = state.K.governance.shepherds.map((s) => `
    <div class="chair-row"><b>${esc(s.term)}</b><span>${esc(s.country)} — Shepherd<em>${esc(s.note)}</em></span></div>`).join("");
  $("#chair-roster").innerHTML = chairs + `<div class="chair-row"><b>Shepherd</b><span class="muted" style="text-transform:none;letter-spacing:0">Multi-year continuity role</span></div>` + sheps;

  if (h.clc_quote) {
    const q = h.clc_quote;
    $("#history-quote").innerHTML = `
      <blockquote>${esc(q.text)}</blockquote>
      <cite><b>${esc(q.attribution)}</b> · ${esc(q.role)}<br><span class="quote-source">${esc(q.source)}</span></cite>`;
  }

  if (h.moments) {
    $("#history-moments").innerHTML = h.moments.map((m) => `
      <div class="moment-card">
        <figure><img src="${esc(m.photo)}" alt="${esc(m.label)}" loading="lazy" /></figure>
        <div class="moment-body">
          <span class="moment-year">${esc(m.year)}</span>
          <span class="moment-label">${esc(m.label)}</span>
          <p class="moment-caption">${esc(m.caption)}</p>
        </div>
      </div>`).join("");
  }

  $("#meetings-grid").innerHTML = h.annual_meetings.map((m) => `
    <article class="meeting-card"><span class="yr">${esc(m.year)}</span><b>${esc(m.n)} ASCN</b><p>${esc(m.host)} — ${esc(m.outcome)}</p></article>`).join("");
  $("#ascap-panel").innerHTML = ascapHtml();
}

function ascapHtml() {
  const a = state.K.ascap;
  return `<p class="label">Forward agenda</p><h3>${esc(a.name)}</h3><p class="lede" style="margin:0.5rem 0 0">${esc(a.note)} Adopted ${esc(a.adopted)}.</p>
    <div class="pillars">${a.pillars.map((p, i) => `<div class="ascap-pillar"><span class="num">P${i + 1}</span><b>${esc(p)}</b></div>`).join("")}</div>`;
}

/* ---------------- Cities ---------------- */
function normCity(s) { return `${s}`.toLowerCase().replace(/\s+city$/, "").trim(); }
function projectsForCity(name) {
  const t = normCity(name);
  const ly = latestReport().year;
  let rows = state.data.projects.filter((p) => p.report_year === ly && normCity(p.city) === t);
  if (!rows.length) rows = state.data.projects.filter((p) => normCity(p.city) === t);
  const seen = new Set();
  return rows.filter((p) => { const k = `${p.project}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

function renderCitiesView() {
  const countries = [...new Set(state.C.map((c) => c.country))].sort();
  $("#city-country").insertAdjacentHTML("beforeend", countries.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join(""));
  $("#map-legend").innerHTML = [["#183a5a", "2018 founding"], ["#a86d14", "2023–24"], ["#b53a2e", "2025"], ["#101418", "2026"]]
    .map(([col, lab]) => `<span><i style="background:${col}"></i>${lab}</span>`).join("");
  renderCityCards();
  selectCity(state.C.find((c) => c.name === "Bangkok") || state.C[0]);
  $("#city-search").addEventListener("input", (e) => { state.citySearch = e.target.value; renderCityCards(); });
  $("#city-country").addEventListener("change", (e) => { state.cityCountry = e.target.value; renderCityCards(); syncMarkers(); });
}

function visibleCities() {
  const q = state.citySearch.trim().toLowerCase();
  return state.C.filter((c) =>
    (state.cityCountry === "all" || c.country === state.cityCountry) &&
    (!q || c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q)));
}

function renderCityCards() {
  const list = visibleCities();
  $("#city-cards").innerHTML = list.map((c) => `
    <button class="city-card${state.selectedCity && c.name === state.selectedCity.name ? " active" : ""}" data-city="${esc(c.name)}">
      <b>${esc(c.name)}</b><span class="cc-country">${esc(c.country)}</span>
      <span class="cc-meta">Joined ${c.year} · ${esc(c.pop)}</span></button>`).join("") ||
    `<p class="muted" style="padding:1rem 0">No cities match.</p>`;
  $$("#city-cards .city-card").forEach((b) => b.addEventListener("click", () => {
    const city = state.C.find((c) => c.name === b.dataset.city);
    if (city) { selectCity(city); if (state.map) state.map.setView([city.lat, city.lon], Math.max(state.map.getZoom(), 6), { animate: true }); }
  }));
}

function selectCity(city) {
  state.selectedCity = city;
  const projects = projectsForCity(city.name);
  const flagshipNames = new Set((city.flagship || []).map((f) => f.name.toLowerCase()));
  const extra = projects.filter((p) => !flagshipNames.has(`${p.project}`.toLowerCase()));
  const flagHtml = (city.flagship || []).map((f) => `
    <div class="cd-project"><div><div class="p-name">${esc(f.name)}</div><div class="p-focus">${esc(f.focus || "")}${f.note ? ` · ${esc(f.note)}` : ""}</div></div><span class="cd-tag">Flagship</span></div>`).join("");
  const extraHtml = extra.slice(0, 14).map((p) => `
    <div class="cd-project"><div><div class="p-name">${esc(p.project)}</div><div class="p-focus">${esc(p.focus_area || "")}</div></div><span class="cd-tag" style="color:var(--muted)">${esc(p.report_year)}</span></div>`).join("");
  $("#city-detail").innerHTML = `
    <div class="cd-place">${esc(city.country)} · joined ${city.year}</div>
    <h2>${esc(city.name)}</h2>
    <div class="cd-meta"><span>Population <b>${esc(city.pop)}</b></span><span>Documented projects <b>${projects.length || city.flagship.length}</b></span></div>
    <p style="color:var(--ink-2);margin:0 0 0.4rem">${esc(city.summary)}</p>
    ${flagHtml ? `<div class="cd-section-label">Flagship work</div><div class="cd-projects">${flagHtml}</div>` : ""}
    ${extraHtml ? `<div class="cd-section-label">From the M&E appendix</div><div class="cd-projects">${extraHtml}</div>` : (projects.length ? "" : `<p class="cd-empty">Detailed project rows pending in the public appendix.</p>`)}
    ${city.portal ? `<a class="cd-portal" href="${esc(city.portal)}" target="_blank" rel="noreferrer">Open city data portal ↗</a>` : ""}`;
  $$("#city-cards .city-card").forEach((b) => b.classList.toggle("active", b.dataset.city === city.name));
}

/* ---------------- Map ---------------- */
function ensureMap() {
  if (state.mapReady) { setTimeout(() => state.map && state.map.invalidateSize(), 60); return; }
  if (!window.L || !$("#sea-map")) return;
  state.map = L.map("sea-map", { zoomControl: true, scrollWheelZoom: false, minZoom: 3, maxZoom: 9, worldCopyJump: false }).setView([8.5, 112], 4);
  state.tileLayer = L.tileLayer(tileLayers.map.url, { attribution: tileLayers.map.attr }).addTo(state.map);
  state.map.setMaxBounds([[-15, 88], [25, 142]]);
  state.markerLayer = L.layerGroup().addTo(state.map);
  buildMarkers();
  $("#map-mode").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn) return;
    state.mapMode = btn.dataset.mode;
    $$("#map-mode button").forEach((b) => b.classList.toggle("active", b === btn));
    if (state.tileLayer) state.map.removeLayer(state.tileLayer);
    state.tileLayer = L.tileLayer(tileLayers[state.mapMode].url, { attribution: tileLayers[state.mapMode].attr }).addTo(state.map);
    buildMarkers();
  });
  state.mapReady = true;
  setTimeout(() => state.map.invalidateSize(), 60);
}

function buildMarkers() {
  if (!state.markerLayer) return;
  state.markerLayer.clearLayers();
  state.markers = {};
  for (const c of state.C) {
    const m = L.circleMarker([c.lat, c.lon], {
      radius: c.year >= 2025 ? 7 : 5,
      color: state.mapMode === "night" ? "rgba(255,255,255,0.8)" : "#fff",
      weight: 1.5, fillColor: markerColor(c.year), fillOpacity: 0.92,
    });
    m.bindTooltip(`${c.name} — ${c.country} (${c.year})`, { direction: "top", offset: [0, -3] });
    m.on("click", () => selectCity(c));
    m.addTo(state.markerLayer);
    state.markers[c.name] = m;
  }
  syncMarkers();
}
function syncMarkers() {
  const vis = new Set(visibleCities().map((c) => c.name));
  Object.entries(state.markers).forEach(([name, m]) => m.setStyle({ opacity: vis.has(name) ? 1 : 0.15, fillOpacity: vis.has(name) ? 0.92 : 0.1 }));
}

/* ---------------- Projects ---------------- */
function latestProjects() { const ly = latestReport().year; return state.data.projects.filter((p) => p.report_year === ly); }
function filteredProjects() {
  const q = state.search.trim().toLowerCase();
  return latestProjects().filter((p) => {
    const cm = state.country === "all" || p.country === state.country;
    const fm = state.focus === "all" || p.focus_area === state.focus;
    const sm = !q || [p.city, p.country, p.project, p.focus_area].some((v) => `${v}`.toLowerCase().includes(q));
    return cm && fm && sm;
  });
}

function renderProjects() {
  const r = latestReport();
  const k = [[r.total_projects, "Projects"], [r.status.ongoing, "Ongoing"], [r.status.completed, "Completed"], [r.status.planning, "Planning"]];
  $("#project-kpis").innerHTML = k.map(([v, l]) => `<article class="kpi"><strong>${fmt.format(v)}</strong><span>${l}</span></article>`).join("");
  $("#status-count").textContent = `${r.total_projects} projects`;
  const fe = Object.entries(r.focus_share);
  const fmax = Math.max(...fe.map(([, v]) => v));
  $("#focus-bars").innerHTML = fe.map(([l, v]) => bar(l, v, fmax, l.includes("Built") ? "red" : "", "%", true)).join("");
  $("#status-bars").innerHTML = [["Ongoing", r.status.ongoing, "green"], ["Completed", r.status.completed, ""], ["Planning", r.status.planning, "amber"]]
    .map(([l, v, cls]) => bar(l, v, r.total_projects, cls)).join("");
  const countries = [...new Set(state.C.map((c) => c.country))].sort();
  $("#country-filter").insertAdjacentHTML("beforeend", countries.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join(""));
  $("#focus-filter").insertAdjacentHTML("beforeend", Object.keys(r.focus_share).map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join(""));
  $("#big-projects").innerHTML = state.K.financing.big_projects.map((p) => `
    <div class="big-project"><div><b>${esc(p.project)}</b><div class="bp-city">${esc(p.city)}</div><div class="bp-fund">${esc(p.funders)}</div></div><div class="bp-amt">${usd(p.investment_usd)}</div></div>`).join("");
  $("#search-filter").addEventListener("input", (e) => { state.search = e.target.value; renderProjectTables(); });
  $("#country-filter").addEventListener("change", (e) => { state.country = e.target.value; renderProjectTables(); });
  $("#focus-filter").addEventListener("change", (e) => { state.focus = e.target.value; renderProjectTables(); });
  $("#export-csv").addEventListener("click", () => downloadBlob("ascn-projects-filtered.csv", projectsCsv(filteredProjects()), "text/csv"));
  renderProjectTables();
}

function statusPill(s) {
  const v = `${s}`.toLowerCase();
  const cls = v.includes("complete") ? "completed" : v.includes("plan") ? "planning" : "ongoing";
  return `<span class="status-pill ${cls}">${esc(s)}</span>`;
}
function renderProjectTables() {
  const rows = filteredProjects();
  const counts = new Map();
  rows.forEach((p) => counts.set(p.city, (counts.get(p.city) || 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12);
  const cmax = Math.max(...top.map((t) => t[1]), 1);
  $("#city-load").innerHTML = top.map(([c, n]) => bar(c, n, cmax, "red")).join("") || `<p class="muted">No rows.</p>`;
  $("#project-count").textContent = `${rows.length} rows`;
  $("#project-table").innerHTML = rows.slice(0, 200).map((p) => `
    <tr><td>${esc(p.city)}</td><td>${esc(p.country)}</td><td>${esc(p.project)}</td><td>${esc(p.focus_area)}</td><td>${statusPill(p.status)}</td></tr>`).join("");
}

/* ---------------- Framework ---------------- */
function renderFramework() {
  const f = state.K.framework, g = state.K.governance;
  $("#framework-status").textContent = f.status;
  const block = (label, items) => `<p class="label">${label}</p><ul class="fw-list">${items.map((i) => `<li><b>${esc(i)}</b></li>`).join("")}</ul>`;
  $("#fw-outcomes").innerHTML = `<h3>Three strategic outcomes</h3>` + block("Outcomes", f.strategic_outcomes);
  $("#fw-systems").innerHTML = `<h3>Two urban systems</h3>` + block("Systems", f.urban_systems);
  $("#fw-enablers").innerHTML = `<h3>Two enablers</h3>` + block("Enablers", f.enablers);
  const fmax = Math.max(...f.focus_areas.map((a) => a.share));
  $("#focus-detail").innerHTML = f.focus_areas.map((a) => `
    <div class="focus-item"><div class="fi-head"><b>${esc(a.name)}</b><span class="fi-share">${a.share}%</span></div>
      <p>${esc(a.blurb)}</p><div class="bar-track"><div class="bar-fill${a.name.includes("Built") ? " red" : ""}" style="width:${(a.share / fmax) * 100}%"></div></div></div>`).join("");
  $("#gov-grid").innerHTML = `
    <article class="gov-card"><h3>Leadership model</h3><p>${esc(g.model)}</p></article>
    <article class="gov-card"><h3>Decisions &amp; legal status</h3><p>${esc(g.decision_making)}</p><p class="muted" style="text-transform:none;letter-spacing:0;margin-top:0.5rem">Reporting: ${esc(g.reporting_chain)}</p></article>
    <article class="gov-card"><h3>Open challenges</h3><ul>${g.challenges.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></article>`;
  $("#framework-ascap").innerHTML = ascapHtml();
}

/* ---------------- Partners ---------------- */
function renderPartners() {
  $("#partner-cards").innerHTML = state.K.partnerships.map((p) => `
    <article class="partner-card"><div class="pc-head"><b>${esc(p.partner)}</b><span class="pc-prog">${esc(p.programme)}</span></div>
      <div class="pc-budget">${esc(p.budget)}</div><div class="pc-cov">${esc(p.coverage)}</div><p>${esc(p.note)}</p></article>`).join("");
  $("#multi-list").innerHTML = state.K.multilateral_partners.map((m) => `
    <div class="def-row"><b>${esc(m.org)}</b><span>${esc(m.role)} — </span><em>${esc(m.activity)}</em></div>`).join("");
  const f = state.K.financing;
  $("#finance-block").innerHTML = `
    <div class="finance-stat">${esc(f.scale_note)}</div>
    <div class="finance-stat"><b>Financing Toolkit.</b> ${esc(f.toolkit)}</div>
    <div class="finance-stat"><b>Blended finance.</b> ${esc(f.blended)}</div>
    <div class="finance-stat"><b>Open challenges.</b> ${esc(f.challenges.join(" "))}</div>`;

  // ── Programme networks ────────────────────────────────────────────────────
  const PROGRAMMES = [
    {
      name: "Smart JAMP", country: "Japan", flag: "JP",
      tagline: "Japan's largest smart city overseas commitment",
      url: "https://www.mlit.go.jp/toshi/toshi_tk1_000073.html",
      desc: "USD 2.4 billion (JPY 250B) programme combining JBIC loans and JOIN equity. Japan conducted feasibility studies in 26 ASCN pilot cities across 10 sectors, making SmartJAMP the single largest bilateral smart city commitment in ASEAN.",
      cities: ["Bangkok", "Da Nang", "Nay Pyi Taw", "Mandalay", "Yangon", "Kuching", "Johor Bahru", "Batam", "Surabaya", "Bandung"],
      stat: "JPY 250B · 26 ASCN cities · 10 sectors",
    },
    {
      name: "K-City Network", country: "South Korea", flag: "KR",
      tagline: "Korea's urban intelligence, deployed across 49 nations",
      url: "https://smartcity.go.kr/en/",
      desc: "South Korea's Ministry of Land (MOLIT) programme exporting Korean smart city solutions via two tracks: Smart City &amp; Solution Planning (consulting) and Smart Solution Demonstration (live pilot deployments). From 2020–2024, completed 26 projects across 49 countries.",
      cities: ["Bacoor (PH)", "Ho Chi Minh City", "Can Tho", "Penang", "Surin", "Jakarta", "Hue", "Puerto Princesa", "Siem Reap", "Brunei"],
      stat: "26 projects · 49 countries · since 2020",
    },
    {
      name: "USASCP", country: "United States", flag: "US",
      tagline: "City-to-city twinning across the Pacific",
      url: "https://www.usascp.org/",
      desc: "U.S. Department of State initiative connecting American public and private sector expertise with ASCN pilot cities. Over USD 10M committed to 20+ projects since 2018. Flagship WiSE twinning pairs: Vientiane–Hillsboro (OR), Phuket–Milwaukee (WI), Ho Chi Minh City–San Francisco (CA).",
      cities: ["Vientiane", "Phuket", "Ho Chi Minh City", "Kuala Lumpur", "Makassar", "Jakarta"],
      stat: "USD 10M+ · 20+ projects · since 2018",
    },
  ];
  $("#programme-networks").innerHTML = PROGRAMMES.map((p) => `
    <article class="prog-card">
      <div class="prog-head">
        <span class="prog-flag" aria-label="${esc(p.country)}">${esc(p.flag)}</span>
        <div><b>${esc(p.name)}</b><span class="prog-country">${esc(p.country)}</span></div>
        <a class="prog-link" href="${p.url}" target="_blank" rel="noopener">↗</a>
      </div>
      <p class="prog-tagline">${esc(p.tagline)}</p>
      <p class="prog-desc">${p.desc}</p>
      <div class="prog-cities">${p.cities.map((c) => `<span>${esc(c)}</span>`).join("")}</div>
      <div class="prog-stat">${esc(p.stat)}</div>
    </article>`).join("");

  // ── Smart City Financing Toolkit ──────────────────────────────────────────
  const LANGS = ["English", "Bahasa", "Thai", "Vietnamese", "Khmer", "Burmese", "Filipino", "Lao", "Malay"];
  $("#toolkit-feature").innerHTML = `
    <div class="toolkit-card">
      <div class="toolkit-card-meta">
        <span class="label">ADB · Aus4ASEAN Futures Initiative</span>
        <a href="https://smartcitytoolkit.asean.org/" target="_blank" rel="noopener" class="toolkit-link">smartcitytoolkit.asean.org ↗</a>
      </div>
      <p>A web platform helping ASEAN city officials navigate financing options for smart city projects. Core feature: <b>FIRST</b> — a Financial Instrument Recommendation and Selection Tool that maps financing instruments to project characteristics, risk profile, and city capacity. Includes case study library, discussion board, and AI chatbot. Available in all 9 ASEAN languages.</p>
      <div class="toolkit-tags">${LANGS.map((l) => `<span class="toolkit-tag">${esc(l)}</span>`).join("")}</div>
    </div>`;

  // ── Jakarta Workshop, November 2024 ───────────────────────────────────────
  const PHOTOS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `https://asean.org/wp-content/uploads/2024/12/${n}.jpeg`);
  $("#workshop-section").innerHTML = `
    <div class="workshop-lede">
      <p>The ASEAN Smart City Financing Toolkit was formally launched on 26–27 November 2024 in Jakarta, Indonesia. National and city-level officials from all ASEAN Member States and Timor-Leste participated in hands-on demonstrations and discussed country outreach plans. ASEAN Dialogue Partners joined the launch ceremony on 26 November.</p>
      <p>Supported by the Australian Government through the Aus4ASEAN Futures Initiative. Managed by the ASEAN Secretariat in partnership with ADB.</p>
    </div>
    <div class="workshop-gallery">${PHOTOS.map((src) => `<figure class="workshop-photo"><img src="${esc(src)}" alt="ASEAN Smart City Financing Toolkit workshop, Jakarta, November 2024" loading="lazy" /></figure>`).join("")}</div>`;
}

/* ---------------- Insights ---------------- */
function renderInsights() {
  const reports = state.data.reports;
  const derived = state.data.derived;
  const projects = state.data.projects;
  const YEARS = ["2022", "2023", "2024", "2025"];

  // ── 1. Portfolio momentum ────────────────────────────────────────────────
  const totals = reports.map((rp) => ({ year: rp.year, total: rp.status.ongoing + rp.status.completed + rp.status.planning, completed: rp.status.completed }));
  const me = state.K.history.membership_evolution;
  const deltas = derived.project_deltas;
  const compRate = (t) => (t.completed / t.total * 100).toFixed(1);
  const momentumStats = [
    { v: totals[3].total, label: "Projects documented", note: `+${deltas[2].project_delta} from 2024 — largest single-year jump` },
    { v: `${compRate(totals[3])}%`, label: "Completion rate 2025", note: `vs 2.6% in 2022 — five-fold improvement in three years` },
    { v: me[me.length - 1].total, label: "Cities in network", note: `Founded with 26 cities in 2018; Timor-Leste joined 2025` },
    { v: `+${deltas[0].project_delta} / +${deltas[1].project_delta} / +${deltas[2].project_delta}`, label: "Annual additions 2022→23→24→25", note: "Accelerating each cycle; 2024 jump driven by completion surge" },
  ];
  const linePoints = totals.map((t) => ({ v: t.total, label: `'${String(t.year).slice(2)}` }));
  $("#ig-momentum").innerHTML = `<div class="ig-momentum-row">${momentumStats.map((s) => `<div class="ig-stat-card"><strong>${esc(String(s.v))}</strong><span>${esc(s.label)}</span><em>${esc(s.note)}</em></div>`).join("")}</div><div class="ig-mini-line">${svgLine(linePoints, 380, 72)}</div>`;

  // ── 2. Focus area trends (4-year sparklines) ─────────────────────────────
  const focusTrends = derived.focus_trends;
  const arrow = (vals) => { const d = vals[vals.length - 1] - vals[0]; return d >= 3 ? { sym: "↑", cls: "trend-up" } : d <= -3 ? { sym: "↓", cls: "trend-dn" } : { sym: "→", cls: "trend-flat" }; };
  const sparkItems = Object.entries(focusTrends).sort((a, b) => b[1]["2025"] - a[1]["2025"]).map(([name, byYear]) => {
    const vals = YEARS.map((y) => byYear[y]);
    const { sym, cls } = arrow(vals);
    const delta = vals[3] - vals[0];
    const deltaStr = delta > 0 ? `+${delta}pp` : delta < 0 ? `${delta}pp` : "flat";
    const color = FOCUS_COLORS[name] || "#444";
    const yLabels = vals.map((v, i) => `<span>${esc(String(v))}%</span>`).join("");
    return `<div class="ig-spark-item"><div class="ig-spark-head"><span class="ig-spark-dot" style="background:${color}"></span><span class="ig-spark-name">${esc(name)}</span><span class="ig-spark-pct">${vals[3]}%</span><span class="ig-spark-delta ${cls}">${sym} ${esc(deltaStr)}</span></div>${svgSpark(vals, 152, 44, color)}<div class="ig-spark-vals">${yLabels}</div><div class="ig-spark-yrs"><span>'22</span><span>'23</span><span>'24</span><span>'25</span></div></div>`;
  }).join("");
  $("#ig-focus-trends").innerHTML = `<div class="ig-spark-grid">${sparkItems}</div>`;

  // ── 3. Country trajectories 2022 → 2025 ──────────────────────────────────
  const appS = derived.appendix_summaries;
  const countrySet = new Set();
  YEARS.forEach((y) => Object.keys(appS[y]?.by_country || {}).forEach((c) => countrySet.add(c)));
  const countryRows = Array.from(countrySet).map((country) => ({
    country,
    vals: YEARS.map((y) => appS[y]?.by_country?.[country] || 0),
  })).sort((a, b) => b.vals[3] - a.vals[3]);
  const cTrajMax = Math.max(...countryRows.flatMap((c) => c.vals));
  const trajHtml = countryRows.map(({ country, vals }) => {
    const curr = vals[3], base = vals[0];
    const silent = curr === 0 && base > 0;
    const delta = curr - base;
    const dStr = silent ? "SILENT 2025" : delta > 0 ? `+${delta}` : `${delta}`;
    const dCls = silent ? "traj-silent" : delta > 0 ? "traj-up" : delta < 0 ? "traj-dn" : "";
    const bgW = cTrajMax ? Math.max(2, (base / cTrajMax) * 100) : 0;
    const fgW = cTrajMax ? Math.max(2, (curr / cTrajMax) * 100) : 0;
    return `<div class="ig-traj-row${silent ? " ig-traj-silent-row" : ""}"><span class="ig-traj-country">${esc(country)}</span><div class="ig-traj-bars"><div class="ig-traj-track"><div class="ig-traj-bg" style="width:${bgW}%"></div><div class="ig-traj-fg${silent ? " silent" : ""}" style="width:${fgW}%"></div></div><span class="ig-traj-n${silent ? " traj-silent" : ""}">${silent ? "—" : curr}</span><span class="ig-traj-delta ${dCls}">${esc(dStr)}</span></div></div>`;
  }).join("");
  $("#ig-country-traj").innerHTML = `<div class="ig-traj-legend"><span class="ig-traj-swatch ig-traj-swatch--base"></span>2022 baseline &nbsp;·&nbsp; <span class="ig-traj-swatch ig-traj-swatch--curr"></span>2025 (amber)</div><div class="ig-traj-wrap">${trajHtml}</div>`;

  // ── 4. Country specialisation (stacked bars) ─────────────────────────────
  const cFocus = {};
  projects.filter((p) => p.report_year === 2025).forEach((p) => { if (!cFocus[p.country]) cFocus[p.country] = {}; cFocus[p.country][p.focus_area] = (cFocus[p.country][p.focus_area] || 0) + 1; });
  const SHORT = { "Industry & Innovation": "Ind. & Innov.", "Quality Environment": "Quality Env.", "Built Infrastructure": "Built Infra.", "Health & Well-Being": "Health & W-B", "Safety & Security": "Safety & Sec.", "Civic & Social": "Civic & Social" };
  const specRows = Object.entries(cFocus).sort((a, b) => Object.values(b[1]).reduce((s, v) => s + v, 0) - Object.values(a[1]).reduce((s, v) => s + v, 0)).map(([country, foci]) => {
    const total = Object.values(foci).reduce((s, v) => s + v, 0);
    const segs = Object.entries(foci).sort((a, b) => b[1] - a[1]).map(([fa, n]) => `<div class="ig-spec-seg" style="width:${(n / total * 100).toFixed(1)}%;background:${FOCUS_COLORS[fa] || "#888"}" title="${fa}: ${n} (${Math.round(n / total * 100)}%)"></div>`).join("");
    const top = Object.entries(foci).sort((a, b) => b[1] - a[1])[0][0];
    return `<div class="ig-spec-row"><span class="ig-spec-country">${esc(country)}</span><div class="ig-spec-bar">${segs}</div><span class="ig-spec-top">${esc(SHORT[top] || top)}</span></div>`;
  }).join("");
  const specLegend = Object.entries(FOCUS_COLORS).map(([name, color]) => `<span class="ig-spec-leg"><span style="background:${color}"></span>${esc(name)}</span>`).join("");
  $("#ig-country-spec").innerHTML = `<div class="ig-spec-legend">${specLegend}</div><div class="ig-spec-wrap">${specRows}</div>`;

  // ── 5. Projects per million residents ────────────────────────────────────
  const cityPop = {};
  (state.CS || []).forEach((c) => { if (c.population) cityPop[c.city] = { pop: c.population, country: c.country }; });
  const city2025 = {};
  projects.filter((p) => p.report_year === 2025).forEach((p) => { city2025[p.city] = (city2025[p.city] || 0) + 1; });
  const density = Object.entries(cityPop).filter(([city]) => city2025[city]).map(([city, { pop, country }]) => ({ city, country, pop, n: city2025[city], ratio: +(city2025[city] / (pop / 1e6)).toFixed(1) })).sort((a, b) => b.ratio - a.ratio);
  const dMax = density[0]?.ratio || 1;
  const fmtPop = (p) => p >= 1e6 ? `${(p / 1e6).toFixed(1)}M` : `${Math.round(p / 1e3)}K`;
  const densityHtml = density.slice(0, 14).map((d) => `<div class="bar-row"><span>${esc(d.city)} <em class="bar-sub">${esc(d.country)}</em></span><div class="bar-track"><div class="bar-fill amber" style="width:${Math.max(2, d.ratio / dMax * 100)}%"></div></div><strong>${d.ratio}/M <em class="bar-sub">${d.n} proj · ${fmtPop(d.pop)}</em></strong></div>`).join("");
  const tailHtml = density.length > 14 ? `<p class="ig-note">Large cities for comparison:</p>` + density.slice(-5).reverse().map((d) => `<div class="bar-row"><span>${esc(d.city)} <em class="bar-sub">${esc(d.country)}</em></span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(1, d.ratio / dMax * 100)}%;background:var(--muted)"></div></div><strong class="muted">${d.ratio}/M <em class="bar-sub">${d.n} proj · ${fmtPop(d.pop)}</em></strong></div>`).join("") : "";
  $("#ig-density").innerHTML = `<div class="ig-bars">${densityHtml}</div>${tailHtml}`;

  // ── 6. Signal flags ───────────────────────────────────────────────────────
  const signals = [
    { icon: "⊘", cls: "sig-warn", flag: "Vietnam: silent in 2025", body: "Da Nang, Ha Noi, and Ho Chi Minh City — all founding members — appeared consistently through 2022–2024 (6 projects each year). The 2025 cycle shows zero Vietnam rows in the appendix. Whether this reflects delayed reporting or withdrawal from the M&E cycle is not stated in the report. It is the single largest gap in the 2025 record." },
    { icon: "━", cls: "sig-flat", flag: "Health & Well-Being: 6% for four consecutive years", body: "Every other focus area moved. This one did not: 6%, 6%, 6%, 6%. The COVID-19 pandemic — which began one year after ASCN's founding and disrupted urban health systems across the region — produced zero measurable reorientation of the portfolio. That is a finding, not a data gap." },
    { icon: "↑", cls: "sig-note", flag: "Myanmar: steady growth after the 2021 coup", body: "Myanmar's documented projects increased every single cycle: 11 (2022), 12 (2023), 13 (2024), 14 (2025). ASEAN's non-interference principle kept the network intact; the data shows Myanmar among the more active contributors during a period when most international engagement with Naypyidaw was suspended or constrained." },
    { icon: "△", cls: "sig-gap", flag: "13 projects reported but not in the appendix", body: "The 2025 report declares 134 total projects. The appendix — the row-by-row evidence table from which this platform's data is drawn — contains 121 entries. Thirteen projects have no individual record. Without an appendix entry, a project cannot be cross-referenced against prior cycles or independently verified." },
  ];
  $("#ig-signals").innerHTML = `<div class="ig-signals-grid">${signals.map((s) => `<div class="ig-signal-card ${s.cls}"><div class="ig-sig-icon">${s.icon}</div><strong>${esc(s.flag)}</strong><p>${esc(s.body)}</p></div>`).join("")}</div>`;

  // ── 7–9. Carry-forward panels ─────────────────────────────────────────────
  $("#ig-impact").innerHTML = state.K.citizen_impact.map((c) => `<div class="impact-stat"><strong>${esc(c.metric)}</strong><span>${esc(c.project)}</span><em>${esc(c.city)}</em></div>`).join("");
  const investments = [...state.K.financing.big_projects].sort((a, b) => b.investment_usd - a.investment_usd);
  const invMax = investments[0]?.investment_usd || 1;
  $("#ig-investment").innerHTML = investments.map((p) => bar(`${p.city} — ${p.project.slice(0, 42)}`, p.investment_usd, invMax, "amber", "", true)).join("");

  // ── "What Completed Actually Means" ─────────────────────────────────────
  // Source: ASCN M&E Report 2025, Appendix + ascn_dim05.md §4.2
  // These are the actual 18 projects the 2025 report classes as "completed"
  const COMPLETED = [
    { city: "Bandar Seri Begawan", project: "National Information Hub",               type: "digital" },
    { city: "Bandar Seri Begawan", project: "Clean River Management",                 type: "physical" },
    { city: "Bandar Seri Begawan", project: "Digital Payment Hub",                    type: "digital" },
    { city: "Phnom Penh",          project: "Smart City Strategic Planning",          type: "planning" },
    { city: "Siem Reap",           project: "Formulation of Smart City Roadmap",      type: "planning" },
    { city: "Siem Reap",           project: "38-Road Construction",                   type: "physical" },
    { city: "Siem Reap",           project: "Smart Waste Management",                 type: "digital" },
    { city: "Banyuwangi",          project: "Tourism-Based Development",              type: "planning" },
    { city: "Luang Prabang",       project: "Smart City Planning and Development",    type: "planning" },
    { city: "Luang Prabang",       project: "Smart and Integrated Urban Strategy",    type: "planning" },
    { city: "Johor Bahru",         project: "Iskandar Malaysia Integrated Urban Services", type: "digital" },
    { city: "Johor Bahru",         project: "Management of Water Resources",          type: "physical" },
    { city: "Kuala Lumpur",        project: "OSC 3.0 Plus Online",                   type: "digital" },
    { city: "Kuching",             project: "Introduction of Blockchain Technology",  type: "digital" },
    { city: "Mandalay",            project: "Cadastral Map and GIS Database",         type: "planning" },
    { city: "Singapore",           project: "E-Payments",                             type: "digital" },
    { city: "Singapore",           project: "National Digital Identity",              type: "digital" },
    { city: "Singapore",           project: "Smart Nation 1.0 Initiatives",          type: "planning" },
  ];
  const planningCount = COMPLETED.filter((p) => p.type === "planning").length;
  const typeColor = { planning: "var(--muted)", digital: "var(--ink-2)", physical: "var(--amber)" };
  const typeLabel = { planning: "Plan / strategy", digital: "Digital system", physical: "Physical infra" };
  const compRows = COMPLETED.map((p) => `<div class="comp-row"><span class="comp-city">${esc(p.city)}</span><span class="comp-proj">${esc(p.project)}</span><span class="comp-type" style="color:${typeColor[p.type]}">${typeLabel[p.type]}</span></div>`).join("");
  $("#ig-completed").innerHTML = `
    <div class="comp-summary">
      <span class="comp-sum-n" style="color:var(--muted)">${planningCount}/18</span><span class="comp-sum-label">are planning or strategy documents — no physical delivery, no resident outcomes verifiable</span>
      <span class="comp-sum-n" style="color:var(--amber)">3/18</span><span class="comp-sum-label">are physical infrastructure — a road, a river, a water pipe</span>
    </div>
    <p class="ig-note">Completion criterion: "successfully concluded." No standardized thresholds, no external verification, no post-completion check. Source: ASCN M&E Report 2025, Appendix + ascn_dim05.md §4.2.</p>
    <div class="comp-list">${compRows}</div>`;

  // ── M&E maturity vs peers (7-feature matrix) ──────────────────────────────
  // Source: ascn_dim05.md §11.6
  const ME_FEATURES = ["Standardized KPIs", "Independent verification", "Citizen feedback", "City benchmarking / ranking", "Digital monitoring dashboard", "Outcome indicators", "Annual public reporting"];
  const ME_SYSTEMS = [
    { name: "ASCN",    vals: [0, 0, 0, 0, 0, 0, 1] },
    { name: "India",   vals: [1, 1, 0.5, 1, 1, 0.5, 1] },
    { name: "Thailand",vals: [1, 0.5, 1, 1, 0.5, 1, 1] },
    { name: "Korea",   vals: [1, 1, 1, 1, 1, 1, 1] },
    { name: "EU",      vals: [1, 1, 1, 1, 1, 1, 1] },
  ];
  const cellIcon = (v) => v === 1 ? `<span class="me-yes">✓</span>` : v === 0.5 ? `<span class="me-partial">~</span>` : `<span class="me-no">✗</span>`;
  const meHead = ME_SYSTEMS.map((s) => `<th class="${s.name === "ASCN" ? "me-ascn-col" : ""}">${esc(s.name)}</th>`).join("");
  const meRows = ME_FEATURES.map((f) => `<tr><td class="me-feature">${esc(f)}</td>${ME_SYSTEMS.map((s, i) => `<td class="me-cell${s.name === "ASCN" ? " me-ascn-col" : ""}">${cellIcon(s.vals[ME_FEATURES.indexOf(f)])}</td>`).join("")}</tr>`).join("");
  $("#ig-compare").innerHTML = `<table class="me-table"><thead><tr><th></th>${meHead}</tr></thead><tbody>${meRows}</tbody></table><p class="ig-note">Source: ascn_dim05.md §11.6. ✓ = yes · ~ = partial · ✗ = no</p>`;

  // ── IMD Smart City Index 2024 — ASEAN cities ────────────────────────────
  // Source: IMD World Competitiveness Center, ascn_dim05.md §7.1
  const IMD = [
    { city: "Singapore",       rank: 5,   rating: "A",   prev: 7,   country: "SG" },
    { city: "Kuala Lumpur",    rank: 73,  rating: "B",   prev: 89,  country: "MY" },
    { city: "Bangkok",         rank: 84,  rating: "CCC", prev: 88,  country: "TH" },
    { city: "Hanoi",           rank: 97,  rating: "CCC", prev: 100, country: "VN" },
    { city: "Jakarta",         rank: 103, rating: "CC",  prev: 102, country: "ID" },
    { city: "Ho Chi Minh City",rank: 105, rating: "CC",  prev: 103, country: "VN" },
    { city: "Medan",           rank: 112, rating: "CC",  prev: 112, country: "ID" },
    { city: "Makassar",        rank: 115, rating: "CC",  prev: 114, country: "ID" },
    { city: "Manila",          rank: 124, rating: "C",   prev: 115, country: "PH" },
  ];
  const imdMax = 142;
  const imdRows = IMD.map((c) => {
    const delta = c.prev - c.rank; // positive = improved
    const dStr = delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : "—";
    const dCls = delta > 0 ? "traj-up" : delta < 0 ? "traj-dn" : "";
    const barW = Math.max(2, ((imdMax - c.rank) / (imdMax - 5)) * 100);
    return `<div class="imd-row"><span class="imd-rank">#${c.rank}</span><span class="imd-city">${esc(c.city)}</span><div class="imd-track"><div class="imd-fill${c.city === "Singapore" ? " imd-fill--sg" : ""}" style="width:${barW}%"></div></div><span class="imd-rating ${c.rating === "A" ? "imd-rating--a" : c.rating === "B" ? "imd-rating--b" : "imd-rating--c"}">${esc(c.rating)}</span><span class="ig-traj-delta ${dCls}">${dStr}</span></div>`;
  }).join("");
  $("#ig-imd").innerHTML = `<div class="imd-wrap">${imdRows}</div><p class="ig-note">142 cities ranked by resident perception of structures &amp; technology. ASCN produces no internal ranking of its cities. Source: IMD World Competitiveness Center 2024.</p>`;

  // ── 10. Academic research map — languages & countries of origin ───────────
  // Source: Kimi_Agent_ASCN Research/ASCN_Academic_Perspectives_Report.md
  const LANG_DATA = [
    { lang: "English", n: 218, share: 95.2, countries: "Singapore, UK, Australia, US, Indonesia, Thailand, Malaysia, Philippines" },
    { lang: "Indonesian/Malay", n: 4, share: 1.7, countries: "Indonesia" },
    { lang: "Thai", n: 3, share: 1.3, countries: "Thailand" },
    { lang: "Chinese", n: 2, share: 0.9, countries: "China" },
    { lang: "Korean", n: 1, share: 0.4, countries: "South Korea" },
    { lang: "Vietnamese", n: 1, share: 0.4, countries: "Vietnam" },
  ];
  const langMax = LANG_DATA[0].n;
  const langRows = LANG_DATA.map((l) => {
    const barW = Math.max(2, (l.n / langMax) * 100);
    return `<div class="bar-row"><span>${esc(l.lang)} <em class="bar-sub">${esc(l.countries)}</em></span><div class="bar-track"><div class="bar-fill" style="width:${barW}%"></div></div><strong>${l.n} <em class="bar-sub">${l.share}%</em></strong></div>`;
  }).join("");
  const countrySchol = [
    { country: "Singapore", n: 45, note: "NUS, LKYSPP, SMU, ISEAS — dominant critical voice" },
    { country: "Indonesia", n: 35, note: "UGM, UI, Unhas, BINUS — implementation & diplomacy focus" },
    { country: "UK / Australia", n: 30, note: "Bristol, Cambridge, Sydney, ANU — governance & rights" },
    { country: "Thailand", n: 18, note: "Chula, Thammasat, KMUTT — city-level & policy studies" },
    { country: "Malaysia / Philippines", n: 16, note: "UKM, UP Diliman, De La Salle — digital inclusion, LGU capacity" },
    { country: "Japan / Korea / China", n: 12, note: "Partner-country perspectives on investment & technology transfer" },
  ];
  const csRows = countrySchol.map((c) => `<div class="lang-country-row"><span class="lang-country-n">${c.n}</span><span class="lang-country-name">${esc(c.country)}</span><span class="lang-country-note">${esc(c.note)}</span></div>`).join("");
  $("#ig-language-map").innerHTML = `
    <div class="lang-split">
      <div class="lang-col">
        <p class="ig-subhead">Languages of ASCN scholarship (229+ works)</p>
        <div class="ig-bars">${langRows}</div>
      </div>
      <div class="lang-col">
        <p class="ig-subhead">Research production by country/institution</p>
        <div class="lang-country-list">${csRows}</div>
      </div>
    </div>
    <p class="ig-note">Source: ASCN Academic Perspectives Report (July 2025). English-language scholarship dominates; local-language work is growing but remains underrepresented in the critical canon.</p>`;

  // ── 11. Stacked area — portfolio composition by focus area, 2022–2025 ─────
  const FOCUS_ORDER = ["Civic & Social", "Built Infrastructure", "Quality Environment", "Safety & Security", "Industry & Innovation", "Health & Well-Being"];
  const YEARS_F = ["2022", "2023", "2024", "2025"];
  const focusStack = YEARS_F.map((y) => {
    const segs = FOCUS_ORDER.map((fa) => ({ fa, pct: state.data.derived.focus_trends[fa][y] })).reverse();
    let acc = 0;
    const divs = segs.map((s) => {
      const h = s.pct;
      const style = `bottom:${acc}%;height:${h}%;background:${FOCUS_COLORS[s.fa]};width:100%;position:absolute;`;
      acc += h;
      return `<div class="stack-seg" style="${style}" title="${esc(s.fa)}: ${h}% (${y})"></div>`;
    }).join("");
    const labels = segs.filter((s) => s.pct >= 10).map((s) => `<span style="color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.4)">${s.pct}%</span>`).join("");
    return `<div class="stack-col"><div class="stack-bars">${divs}</div><span class="stack-year">${y}</span></div>`;
  }).join("");
  const focusLegend = FOCUS_ORDER.map((fa) => `<span class="ig-spec-leg"><span style="background:${FOCUS_COLORS[fa]}"></span>${esc(fa)}</span>`).join("");
  $("#ig-focus-stack").innerHTML = `
    <div class="stack-wrap">${focusStack}</div>
    <div class="stack-legend">${focusLegend}</div>
    <p class="ig-note">Built Infrastructure overtook Civic &amp; Social by 2024. Health &amp; Well-Being has stayed at 6% for four consecutive years. Source: ASCN M&amp;E Reports 2022–2025.</p>`;

  // ── 12. Country slope graph — 2022 baseline vs 2025 ───────────────────────
  const countrySlopeData = Object.entries(state.data.derived.appendix_summaries).reduce((acc, [year, sum]) => {
    Object.entries(sum.by_country).forEach(([country, n]) => {
      if (!acc[country]) acc[country] = {};
      acc[country][year] = n;
    });
    return acc;
  }, {});
  const slopeRows = Object.entries(countrySlopeData)
    .map(([country, vals]) => ({ country, base: vals["2022"] || 0, curr: vals["2025"] || 0 }))
    .filter((r) => r.base > 0 || r.curr > 0)
    .sort((a, b) => b.curr - a.curr);
  const slopeMax = Math.max(...slopeRows.map((r) => Math.max(r.base, r.curr)), 1);
  const slopeHtml = slopeRows.map((r) => {
    const delta = r.curr - r.base;
    const dStr = delta > 0 ? `+${delta}` : `${delta}`;
    const dCls = delta > 0 ? "traj-up" : delta < 0 ? "traj-dn" : "traj-flat";
    const leftPct = (r.base / slopeMax) * 100;
    const rightPct = (r.curr / slopeMax) * 100;
    const flat = delta === 0;
    return `
      <div class="slope-row">
        <span class="slope-country">${esc(r.country)}</span>
        <span class="slope-val slope-val--base">${r.base}</span>
        <div class="slope-track">
          <div class="slope-dot slope-dot--base" style="left:${leftPct}%"></div>
          <div class="slope-dot slope-dot--curr${flat ? " slope-dot--flat" : ""}" style="left:${rightPct}%"></div>
          <div class="slope-line${flat ? " slope-line--flat" : delta > 0 ? " slope-line--up" : " slope-line--dn"}" style="left:${Math.min(leftPct, rightPct)}%;width:${Math.abs(rightPct - leftPct)}%"></div>
        </div>
        <span class="slope-val slope-val--curr">${r.curr}</span>
        <span class="ig-traj-delta ${dCls}">${esc(dStr)}</span>
      </div>`;
  }).join("");
  $("#ig-country-slope").innerHTML = `
    <div class="slope-header"><span class="slope-h-country">Country</span><span class="slope-h-val">2022</span><span class="slope-h-track">→</span><span class="slope-h-val">2025</span><span class="slope-h-delta">Δ</span></div>
    <div class="slope-wrap">${slopeHtml}</div>
    <p class="ig-note">Thailand and Malaysia drove the 2024–25 surge. Vietnam is the only country with zero growth across all four cycles. Myanmar kept adding projects despite the 2021 crisis. Source: ASCN M&amp;E Reports 2022–2025.</p>`;

  // ── 13. Project churn funnel ──────────────────────────────────────────────
  // Track unique city+project combinations across the four cycles
  const uniq = {};
  state.data.projects.forEach((p) => {
    const key = `${p.country}|${p.city}|${p.project}`;
    if (!uniq[key]) uniq[key] = { key, country: p.country, city: p.city, project: p.project, years: new Set() };
    uniq[key].years.add(String(p.report_year));
  });
  const allKeys = Object.values(uniq);
  const allFour = allKeys.filter((p) => p.years.size === 4).length;
  const only2025 = allKeys.filter((p) => p.years.size === 1 && p.years.has("2025")).length;
  const only2022 = allKeys.filter((p) => p.years.size === 1 && p.years.has("2022")).length;
  const intermittent = allKeys.filter((p) => p.years.size >= 2 && p.years.size <= 3).length;
  $("#ig-churn").innerHTML = `
    <div class="churn-funnel">
      <div class="churn-total"><span class="churn-n">${allKeys.length}</span><span class="churn-label">unique city+project combinations, 2022–2025</span></div>
      <div class="churn-bar churn-bar--total" style="width:100%"></div>
      <div class="churn-segs">
        <div class="churn-seg" style="width:${(allFour / allKeys.length) * 100}%"><span class="churn-seg-n">${allFour}</span><span class="churn-seg-label">Tracked all 4 cycles</span></div>
        <div class="churn-seg churn-seg--new" style="width:${(only2025 / allKeys.length) * 100}%"><span class="churn-seg-n">${only2025}</span><span class="churn-seg-label">New in 2025</span></div>
        <div class="churn-seg churn-seg--drop" style="width:${(only2022 / allKeys.length) * 100}%"><span class="churn-seg-n">${only2022}</span><span class="churn-seg-label">Dropped after 2022</span></div>
        <div class="churn-seg churn-seg--int" style="width:${(intermittent / allKeys.length) * 100}%"><span class="churn-seg-n">${intermittent}</span><span class="churn-seg-label">Intermittent</span></div>
      </div>
    </div>
    <p class="ig-note">A project that disappears from the appendix is not necessarily cancelled — but it cannot be verified or compared across cycles. Source: ASCN M&amp;E appendix rows 2022–2025.</p>`;

  // ── 14. Completion rate by country ────────────────────────────────────────
  // Source: ASCN M&E Report 2025 Appendix + ascn_dim05.md §4.2
  const compByCountry = [
    { country: "Singapore", completed: 4, total: 4, rate: 100 },
    { country: "Lao PDR", completed: 2, total: 9, rate: 22.2 },
    { country: "Cambodia", completed: 4, total: 17, rate: 23.5 },
    { country: "Brunei Darussalam", completed: 3, total: 4, rate: 75 },
    { country: "Malaysia", completed: 1, total: 26, rate: 3.8 },
    { country: "Myanmar", completed: 1, total: 14, rate: 7.1 },
    { country: "Indonesia", completed: 1, total: 13, rate: 7.7 },
    { country: "Philippines", completed: 0, total: 8, rate: 0 },
    { country: "Thailand", completed: 0, total: 20, rate: 0 },
    { country: "Viet Nam", completed: 0, total: 6, rate: 0 },
  ].sort((a, b) => b.rate - a.rate);
  const compMax = 100;
  const compRows2 = compByCountry.map((c) => {
    const barW = Math.max(2, (c.rate / compMax) * 100);
    return `<div class="bar-row"><span>${esc(c.country)}</span><div class="bar-track"><div class="bar-fill ${c.rate === 100 ? "amber" : c.rate === 0 ? "" : ""}" style="width:${barW}%;background:${c.rate === 0 ? "var(--muted)" : c.rate === 100 ? "var(--ink-2)" : "var(--amber)"}"></div></div><strong>${c.rate}% <em class="bar-sub">${c.completed}/${c.total}</em></strong></div>`;
  }).join("");
  $("#ig-completion-rate").innerHTML = `
    <div class="ig-bars">${compRows2}</div>
    <p class="ig-note">Completion is self-defined by cities with no standardized criteria. 39% of the 18 "completed" projects are planning or strategy documents. Source: ASCN M&amp;E Report 2025 + ascn_dim05.md §4.2.</p>`;
}

/* ---------------- Open Data / Library ---------------- */
function renderOpenData() {
  $("#data-lede").textContent = "Everything behind this platform is open. Download the structured datasets, read the source documents, and search the full knowledge base — 62 sources, each with what we took from it.";

  const downloads = [
    ["Project evidence (CSV)", "378 appendix rows across four M&E cycles: city, country, project, focus area, status.", () => downloadBlob("ascn-projects.csv", projectsCsv(state.data.projects, true), "text/csv")],
    ["City profiles (CSV)", "38 member cities: country, join year, population, coordinates, flagship projects.", () => downloadBlob("ascn-cities.csv", citiesCsv(), "text/csv")],
    ["Full dataset (JSON)", "The complete knowledge layer, city profiles, and project engine in one bundle.", () => downloadBlob("ascn-open-dataset.json", JSON.stringify({ knowledge: state.K, cities: state.C, engine: state.data }, null, 2), "application/json")],
  ];
  $("#dataset-downloads").innerHTML = downloads.map(([t, d], i) => `
    <article class="download-card"><b>${esc(t)}</b><p>${esc(d)}</p><button class="text-button" type="button" data-dl="${i}">Download</button></article>`).join("");
  $$("#dataset-downloads [data-dl]").forEach((b) => b.addEventListener("click", () => downloads[Number(b.dataset.dl)][2]()));

  $("#document-grid").innerHTML = state.K.documents.map((d) => `
    <article class="doc-card"><span class="dc-kind">${esc(d.kind)} · ${d.year}</span><b>${esc(d.title)}</b><p>${esc(d.note)}</p>
      <div class="dc-foot"><span class="dc-size">${esc(d.size || "PDF")}</span><a class="dc-dl" href="docs/${encodeURIComponent(d.file)}" download>Download ↓</a></div></article>`).join("");

  $("#source-list").innerHTML = state.K.data_sources.map((s) => `
    <div class="def-row"><b><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.name)} ↗</a></b><em>${esc(s.type)}</em></div>`).join("");

  const m = state.data.metadata || {};
  const methods = [
    ["Source model", "Structured JSON and source URLs are committed; raw PDFs are served from the build, not stored in git."],
    ["Freshness", `Engine generated ${m.generated_at || "—"}. Knowledge layer synthesized ${state.K.meta.research_date} from official documents.`],
    ["Counts", "Network KPIs use figures stated in report text. Appendix rows are extracted from PDF tables — treat row-level counts as indicative."],
    ["The honest limit", "ASCN M&E counts projects, not outcomes. This platform surfaces the official record faithfully; it does not invent metrics the network does not yet collect."],
    ["Public information", "The 2026 contact list is cited as a source, but personal contact details are not exposed in this dataset."],
  ];
  $("#method-list").innerHTML = methods.map(([t, b]) => `<div class="method-row"><b>${esc(t)}</b><span>${esc(b)}</span></div>`).join("");

  // Searchable library
  renderLibrary();
  $("#lib-search").addEventListener("input", (e) => { state.libSearch = e.target.value; renderLibrary(); });
  $$("#lib-type-chips .lib-chip").forEach((btn) => btn.addEventListener("click", () => {
    state.libType = btn.dataset.type;
    $$("#lib-type-chips .lib-chip").forEach((b) => b.classList.toggle("active", b === btn));
    renderLibrary();
  }));
}

function renderLibrary() {
  const src = state.LF ? state.LF.entries : (state.L ? state.L.groups.flatMap((g) => g.items.map((it) => ({ type: "official", category: g.group, title: it.title, source: it.source, year: it.year, file: it.file, takeaway: it.takeaway, url: null }))) : []);
  const q = state.libSearch.trim().toLowerCase();
  const filtered = src.filter((e) => {
    const typeMatch = state.libType === "all" || e.type === state.libType;
    const textMatch = !q || [e.title, e.source, e.takeaway, e.category, ...(e.tags || [])].some((v) => `${v || ""}`.toLowerCase().includes(q));
    return typeMatch && textMatch;
  });

  const total = src.length;
  $("#lib-count").textContent = filtered.length === total ? `${total} sources` : `${filtered.length} of ${total}`;

  if (!filtered.length) {
    $("#lib-results").innerHTML = `<p class="lib-empty">No sources match "${esc(q)}".</p>`;
    return;
  }

  $("#lib-results").innerHTML = filtered.map((e) => {
    const actions = [];
    if (e.file) actions.push(`<a class="le-dl" href="docs/${encodeURIComponent(e.file)}" download>PDF ↓</a>`);
    if (e.url) actions.push(`<a class="le-ext" href="${esc(e.url)}" target="_blank" rel="noreferrer">View ↗</a>`);
    return `<div class="lib-entry">
      <span class="le-badge ${esc(e.type)}">${esc(e.type)}</span>
      <div class="le-body">
        <div class="le-title">${esc(e.title)}</div>
        <div class="le-meta">${esc(e.source)}${e.year ? ` · ${e.year}` : ""}${e.category ? ` · ${esc(e.category)}` : ""}</div>
        <p class="le-takeaway">${esc(e.takeaway)}</p>
      </div>
      <div class="le-actions">${actions.join("")}</div>
    </div>`;
  }).join("");
}

/* ---------------- Exports ---------------- */
function csvCell(v) { return `"${`${v ?? ""}`.replaceAll('"', '""')}"`; }
function projectsCsv(rows, all = false) {
  const head = ["report_year", "country", "city", "project", "focus_area", "status", "source_page"];
  return [head.join(","), ...rows.map((p) => head.map((k) => csvCell(p[k])).join(","))].join("\n");
}
function citiesCsv() {
  const head = ["name", "country", "year", "pop", "lat", "lon", "flagship_projects", "portal"];
  return [head.join(","), ...state.C.map((c) => [c.name, c.country, c.year, c.pop, c.lat, c.lon, (c.flagship || []).map((f) => f.name).join("; "), c.portal || ""].map(csvCell).join(","))].join("\n");
}
function downloadBlob(name, content, type) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/* ---------------- Boot ---------------- */
function wireNav() {
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-tab]");
    if (!link) return;
    e.preventDefault();
    setTab(link.dataset.tab);
  });
  window.addEventListener("hashchange", () => setTab((location.hash || "#overview").slice(1), false));
}

async function loadJson(path) {
  const res = await fetch(`${path}?v=32`);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

/* ---------------- Contacts ---------------- */
function renderContacts() {
  // National Representatives — as of 30 April 2026 contact list
  const NRS = {
    "Brunei Darussalam": { name: "Ir. Mohammad Nazri Mohammad Yusof", title: "Permanent Secretary", org: "Ministry of Transport and Infocommunications (MTIC)", url: "https://www.mtic.gov.bn" },
    "Cambodia":          { name: "Mr. Sor Vorin", title: "Under Secretary of State", org: "Ministry of Interior", url: "" },
    "Indonesia":         { name: "Dr. Safrizal ZA", title: "Director General, Directorate General of Regional Administration", org: "Ministry of Home Affairs", url: "https://www.kemendagri.go.id", badge: "Shepherd 2023–2027" },
    "Lao PDR":           { name: "Dr. Bounta Onnavong", title: "Director General, Department of Housing and Urban Planning", org: "Ministry of Public Works and Transport (MPWT)", url: "https://www.mpwt.gov.la", badge: "Chair 2024" },
    "Malaysia":          { name: "Mr. Mohd Hazli bin Ahmad @ Adnan", title: "Deputy Secretary General (Sustainability and Strategic Planning)", org: "Ministry of Housing and Local Government (KPKT)", url: "https://www.kpkt.gov.my", badge: "Chair 2025" },
    "Myanmar":           { name: "Mr. Zaw Myint Oo", title: "Permanent Secretary", org: "Nay Pyi Taw Development Committee", url: "" },
    "Philippines":       { name: "Mr. Juanito Victor C. Remulla", title: "Secretary", org: "Department of the Interior and Local Government (DILG)", url: "https://www.dilg.gov.ph" },
    "Singapore":         { name: "Mr. Hugh Lim", title: "Executive Director, Centre for Liveable Cities", org: "Ministry of National Development", url: "https://www.clc.gov.sg", badge: "Founding Shepherd 2018–2022" },
    "Thailand":          { name: "Distinguished Professor Wisit Wisitsora-at", title: "Permanent Secretary", org: "Ministry of Digital Economy and Society (MDES)", url: "https://www.mdes.go.th", badge: "Chair 2019" },
    "Timor-Leste":       { name: "Mr. Roger Tertuliano de F. B. Belo", title: "Director General for Spatial Planning", org: "Ministry of Planning and Strategic Investment", url: "", badge: "Newest Member" },
    "Viet Nam":          { name: "Dr. Nguyen Thanh Nghi", title: "Minister of Construction", org: "Ministry of Construction", url: "https://www.xaydung.gov.vn" },
  };

  // Chief Smart City Officers — per city, as of 30 April 2026 contact list
  const CSCOS = {
    "Bandar Seri Begawan": [{ name: null, org: "Bandar Seri Begawan Municipal Department" }],
    "Battambang":          [{ name: "Mr. Sok Lou", title: "Governor", org: "Battambang Provincial Administration" }],
    "Phnom Penh":          [{ name: "Mr. Seng Vannak", title: "Vice Governor", org: "Phnom Penh Capital Administration" }],
    "Siem Reap":           [{ name: "Mr. Yun Linne", title: "Deputy Governor", org: "Siem Reap Province" }],
    "Sihanoukville City":  [{ name: "Mr. Em Pheap", title: "Vice Governor", org: "Preah Sihanouk Province" }],
    "Jakarta":             [{ name: "Mr. Sigit Wijatmoko", title: "Acting Head of Communications, Informatics, & Statistics Department", org: "Jakarta Provincial Government" }],
    "Makassar":            [{ name: "Dr. Andi Zulkifly Nanda", title: "Makassar Regional Secretary", org: "Makassar City Government" }],
    "Banyuwangi":          [{ name: "Mr. Budi Santoso", title: "Head of Communication, Informatics and Encryption", org: "Banyuwangi Government" }],
    "Sumedang":            [{ name: "Ms. Tuti Ruswati", title: "Sumedang Regional Secretary", org: "Sumedang Regency Government" }],
    "Denpasar":            [{ name: "Mr. Gde Wirakusuma Wahyudi", title: "Head of the Communication Informatics and Statistic Agency", org: "Denpasar City Government" }],
    "Semarang":            [{ name: "Mr. Budi Prakosa", title: "Head of the Regional Development Planning Agency", org: "Semarang City Government" }],
    "Luang Prabang":       [{ name: "Mr. Saveuy Silavanh", title: "Chairman", org: "Luang Prabang City Government Committee" }],
    "Vientiane":           [{ name: "Mr. Bounyavath Niraxay", title: "Director General, Department of Public Works and Transport", org: "Vientiane Capital" }],
    "Johor Bahru":         [{ name: "Mr. Shamsudin Yusoff", title: "Head, Innovation & Technology", org: "Iskandar Regional Development Authority (IRDA)" }],
    "Kota Kinabalu":       [{ name: "Sr. Lifred Wong", title: "Director General", org: "Kota Kinabalu City Hall" }],
    "Kuching":             [{ name: "Mr. Hemlet Kiai", title: "Head of Digital Technology Division", org: "Sarawak Multimedia Authority" }],
    "Kuala Lumpur":        [{ name: "Mr. Zulkurnain bin Hassan", title: "Executive Director, City Planning Department", org: "Kuala Lumpur City Hall (DBKL)" }],
    "Ipoh":                [{ name: "Mr. Abdul Afiq bin Muhammad", title: "Assistant Director, Town Planning Department", org: "Ipoh City Council" }],
    "Putrajaya":           [{ name: "Mr. Mohd Musabri bin Shaharom", title: "Head of Smart City Section", org: "Putrajaya Corporation" }],
    "Seberang Perai":      [{ name: "Dato Haji Baderul Amin bin Abdul Hamid", title: "Mayor of Seberang Perai", org: "Seberang Perai City Council" }],
    "Mandalay":            [{ name: "Mr. Htun Linn Saw", title: "Deputy Director, Urban Planning and Land Administration Department", org: "Mandalay City Development Committee" }],
    "Nay Pyi Taw":         [{ name: "Mr. Moe Thar", title: "Director, Urban Planning and GIS Team", org: "Nay Pyi Taw Development Committee" }],
    "Yangon":              [{ name: "Mrs. Tin Tin Kyi", title: "Deputy Director General, Urban Planning Department", org: "Yangon City Development Committee" }],
    "Davao":               [{ name: "Atty. Tristan Dwight P. Domingo", title: "Asst. City Administrator", org: "Davao City Government" }],
    "Manila":              [{ name: "Mr. Arnel Eustacio M. Angeles", title: "Head III, Disaster Risk Reduction and Management Office", org: "City of Manila" }],
    "Cauayan City":        [{ name: "Atty. Reina Consorcia M. Santos", title: "Over-all Project Coordinator, Smart and Sustainable Cities Program", org: "Cauayan City Infotech Office" }],
    "Cebu City":           [{ name: "Ar. Ann Marie Y. Cuizon", title: "Department Head, City Planning and Development Office", org: "Cebu City Government" }],
    "Singapore":           [{ name: "Mr. Joel Chua", title: "Director of Smart City Division, Smart Nation Group", org: "Ministry of Digital Development and Information (MDDI)" }],
    "Bangkok":             [{ name: "Mr. Jiraroth Sukolrat", title: "Director General, Office of Transport and Traffic Policy and Planning", org: "Ministry of Transport" }],
    "Chiang Mai":          [{ name: "Mr. Nirat Phongsittithavorn", title: "Governor", org: "Chiang Mai Province" }],
    "Chonburi":            [{ name: "Mr. Wattanapong Kurovat", title: "Director General, Energy Policy and Planning Office", org: "Ministry of Energy" }],
    "Khon Kaen":           [{ name: "Mr. Kaisorn Kongchalad", title: "Governor", org: "Khon Kaen Province" }],
    "Phuket":              [{ name: "Mr. Pracha Asavateera", title: "District Manager, Upper Southern Region Office", org: "Digital Economy Promotion Agency (DEPA)" }],
    "Rayong":              [{ name: "Mr. Pirun Hemarak", title: "Vice Governor", org: "Rayong Province" }],
    "EEC":                 [{ name: null, org: "Eastern Economic Corridor Office (EECO)" }],
    "Dili":                [{ name: "Mr. Antonio Guterres", title: "Director General for Local Administration", org: "Ministry of State Administration" }],
    "Da Nang":             [{ name: "Mr. Le Trung Chinh", title: "Vice Chairperson", org: "People's Committee of Da Nang City" }],
    "Ha Noi":              [{ name: "Mr. Le Hong Son", title: "Vice Chairman", org: "People's Committee of Ha Noi City" }],
    "Ho Chi Minh City":    [{ name: "Mr. Duong Anh Duc", title: "Vice Chairman", org: "Ho Chi Minh City People's Committee" }],
  };

  // Staff contacts per city — April 2026 contact list
  const STAFF = {
    "Chiang Mai": [{ name: "Dr. Non Arkaraprasertkul", title: "Senior Expert in Smart City Promotion", org: "Digital Economy Promotion Agency (DEPA)" }],
    "Khon Kaen":  [{ name: "Dr. Non Arkaraprasertkul", title: "Senior Expert in Smart City Promotion", org: "Digital Economy Promotion Agency (DEPA)" }],
    "Phuket":     [{ name: "Dr. Non Arkaraprasertkul", title: "Senior Expert in Smart City Promotion", org: "Digital Economy Promotion Agency (DEPA)" }],
    "Rayong":     [{ name: "Dr. Non Arkaraprasertkul", title: "Senior Expert in Smart City Promotion", org: "Digital Economy Promotion Agency (DEPA)" }],
  };

  function cityPopupHtml(city) {
    const nr = NRS[city.country] || {};
    const cscos = CSCOS[city.name] || [];
    const staff = STAFF[city.name] || [];
    const officialListUrl = "https://asean.org/body/asean-smart-cities-network/";
    let h = `<div class="cpop">`;
    h += `<div class="cpop-city">${esc(city.name)}<span class="cpop-ctry"> · ${esc(city.country)}</span></div>`;
    // NR block
    h += `<div class="cpop-block">`;
    h += `<div class="cpop-role-label">National Representative</div>`;
    if (nr.name) {
      h += `<div class="cpop-name">${esc(nr.name)}</div>`;
      h += `<div class="cpop-detail">${esc(nr.title)}</div>`;
    }
    h += `<div class="cpop-org"><a href="${esc(nr.url || "#")}" target="_blank" rel="noopener">${esc(nr.org)}</a>`;
    if (nr.badge) h += ` <span class="cpop-badge">${esc(nr.badge)}</span>`;
    h += `</div></div>`;
    // CSCO block
    h += `<div class="cpop-block">`;
    h += `<div class="cpop-role-label">Chief Smart City Officer</div>`;
    if (cscos.length && cscos[0].name) {
      cscos.forEach((c) => {
        h += `<div class="cpop-name">${esc(c.name)}</div>`;
        if (c.title) h += `<div class="cpop-detail">${esc(c.title)}</div>`;
        h += `<div class="cpop-org">${esc(c.org)}</div>`;
      });
    } else if (cscos.length) {
      h += `<div class="cpop-org">${esc(cscos[0].org)}</div>`;
      h += `<div class="cpop-verify"><a href="${officialListUrl}" target="_blank" rel="noopener">Verify current contact ↗</a></div>`;
    } else {
      h += `<div class="cpop-verify"><a href="${officialListUrl}" target="_blank" rel="noopener">See official April 2026 list ↗</a></div>`;
    }
    h += `</div>`;
    // Staff contacts block (where listed)
    if (staff.length) {
      h += `<div class="cpop-block">`;
      h += `<div class="cpop-role-label">Staff Contact</div>`;
      staff.forEach((s) => {
        h += `<div class="cpop-name">${esc(s.name)}</div>`;
        h += `<div class="cpop-detail">${esc(s.title)}</div>`;
        h += `<div class="cpop-org">${esc(s.org)}</div>`;
      });
      h += `</div>`;
    }
    h += `</div>`;
    return h;
  }

  const memberCards = Object.entries(NRS).map(([country, nr]) => `
    <article class="contact-card">
      <div class="cc-head">
        <b class="cc-country">${esc(country)}</b>
        ${nr.badge ? `<span class="cc-badge">${esc(nr.badge)}</span>` : ""}
      </div>
      ${nr.name ? `<div class="cc-nr-name">${esc(nr.name)} <span class="cc-nr-role">NR</span></div>` : ""}
      <a class="cc-inst" href="${esc(nr.url)}" target="_blank" rel="noopener">${esc(nr.org)}</a>
    </article>`).join("");

  $("#contacts-content").innerHTML = `
    <div class="contacts-wrap">
      <div class="contacts-header">
        <p class="label">Network Contacts</p>
        <h2>Click any city to see the NR and CSCO.</h2>
        <p class="lede">38 cities, 11 countries. Each marker shows the National Representative at the top, followed by the Chief Smart City Officer for that city. Data: April 2026 ASCN contact list.</p>
        <a class="text-button" href="docs/11_ASCN_Contact_List_2026.pdf" target="_blank">Official contact list (Jan 2026 PDF)</a>
      </div>

      <div class="contacts-map-wrap">
        <div id="contacts-map" class="contacts-map"></div>
        <p class="contacts-map-hint">Click a city marker to view contacts · Scroll to zoom</p>
      </div>

      <div class="contacts-grid-wrap">
        <p class="label">National Representatives by country</p>
        <div class="contacts-grid">${memberCards}</div>
      </div>

      <div class="contacts-footer">
        <p class="contacts-source-note">Source: ASCN M&amp;E Reports (2022–2025) and official April 2026 ASCN Contact List. Names and positions change with government transitions — verify current contacts at <a href="https://asean.org/body/asean-smart-cities-network/" target="_blank" rel="noopener">asean.org</a>.</p>
      </div>

      ${renderAlumni()}
    </div>`;

  // Initialise contacts map after DOM is ready
  setTimeout(() => ensureContactsMap(cityPopupHtml), 60);
}

function ensureContactsMap(popupFn) {
  if (state.cMapReady) { state.cMap && state.cMap.invalidateSize(); return; }
  const el = document.getElementById("contacts-map");
  if (!window.L || !el) return;
  state.cMap = L.map("contacts-map", { zoomControl: true, scrollWheelZoom: true, minZoom: 3, maxZoom: 9, worldCopyJump: false })
    .setView([8.5, 112], 4);
  L.tileLayer(tileLayers.map.url, { attribution: tileLayers.map.attr }).addTo(state.cMap);
  // Tall popups (NR + CSCO + Staff) open above the marker and can clip the map's top
  // edge. Leaflet's autoPan/panInside are unreliable on programmatic opens, so recenter
  // explicitly: place the marker ~52px above the map's bottom edge, leaving the full
  // height above it for the popup. Deterministic — fires on every open.
  state.cMap.on("popupopen", function (e) {
    const map = state.cMap;
    setTimeout(function () {
      map.invalidateSize({ animate: false }); // first open after a tab switch can have a stale size
      const z = map.getZoom();
      const size = map.getSize();
      const mPx = map.project(e.popup.getLatLng(), z);
      const centerX = map.project(map.getCenter(), z).x;
      const newCenter = map.unproject(L.point(centerX, mPx.y - size.y / 2 + 52), z);
      map.setView(newCenter, z, { animate: false });
    }, 120);
  });
  for (const city of state.C) {
    const nr = (function(c) {
      const nrs = { "Brunei Darussalam": null, "Cambodia": null, "Indonesia": "Dr. Amran", "Lao PDR": null, "Malaysia": "Mohd Hazli Bin Ahmad Adnan", "Myanmar": null, "Philippines": null, "Singapore": null, "Thailand": "Non Arkaraprasertkul, PhD", "Timor-Leste": null, "Viet Nam": "Dr. Tran Quoc Thai" };
      return nrs[c] || null;
    })(city.country);
    const m = L.circleMarker([city.lat, city.lon], {
      radius: 7, color: "#fff", weight: 1.5,
      fillColor: nr ? "#f59e0b" : "#183a5a", fillOpacity: 0.9,
    });
    m.bindTooltip(`<b>${city.name}</b> · ${city.country}`, { direction: "top", offset: [0, -4] });
    m.bindPopup(popupFn(city), { maxWidth: 280, maxHeight: 310, className: "cpop-wrap", autoPan: false });
    m.addTo(state.cMap);
  }
  state.cMapReady = true;
  setTimeout(() => state.cMap.invalidateSize(), 60);
}

/* ---------------- ASCN Alumni (removed from active roster) ---------------- */
function renderAlumni() {
  const ALUMNI = [
    // Brunei Darussalam
    { country: "Brunei Darussalam", name: "Haji Amir Azman Bin POKPS DP Haji Abdul Rahman", role: "CSCO", org: "Bandar Seri Begawan Municipal Department", title: "Acting Chairman" },
    { country: "Brunei Darussalam", name: "Nur Hazirah Puasa", role: "Staff", org: "Smart Nation Office, Ministry of Transport and Infocommunications", title: "Special Duties Officer" },
    { country: "Brunei Darussalam", name: "Dk Khairunnisa Nurasikin Binti Pg Asmali", role: "Staff", org: "Bandar Seri Begawan Municipal Department", title: "Special Duties Officer" },
    { country: "Brunei Darussalam", name: "Asdeira Bin Lasut", role: "Staff", org: "Bandar Seri Begawan Municipal Department", title: "Head of International Relations Unit" },
    // Cambodia
    { country: "Cambodia", name: "Prak Samoeun", role: "NR", org: "Ministry of Interior", title: "Secretary of State" },
    { country: "Cambodia", name: "Tema Vichekal", role: "Staff", org: "Phnom Penh Capital Administration", title: "Deputy General Secretary" },
    // Indonesia
    { country: "Indonesia", name: "Indra Gunawan", role: "NR-Alt", org: "Ministry of Home Affairs", title: "Secretary, Directorate General of Regional Administration" },
    { country: "Indonesia", name: "Atika Nur Rahmania", role: "CSCO", org: "Jakarta Provincial Government", title: "Head of Communications, Informatics & Statistics" },
    { country: "Indonesia", name: "Firman Hamid Pagarra", role: "CSCO", org: "Makassar City", title: "Makassar Regional Secretary" },
    { country: "Indonesia", name: "Ismawaty Nur, ST. M.Sc, Ph.D", role: "CSCO", org: "Makassar City", title: "Head of Communication and Information Office" },
    { country: "Indonesia", name: "Christlan H.P. Jungjungan", role: "Staff", org: "Ministry of Home Affairs", title: "Urban Planning Analyst / Associate Policy Analyst" },
    { country: "Indonesia", name: "Daffa Rizky Ananda", role: "Staff", org: "Ministry of Home Affairs", title: "Staff" },
    { country: "Indonesia", name: "Abubakar Ali Masruri", role: "Staff", org: "Ministry of Home Affairs", title: "Associate Policy Analyst" },
    // Lao PDR
    { country: "Lao PDR", name: "Viengnam Douangphachanh", role: "NR", org: "Ministry of Public Works and Transport", title: "Director General, Housing and Urban Planning" },
    { country: "Lao PDR", name: "Viengthong Hatsachanh", role: "CSCO", org: "Luang Prabang City", title: "Mayor" },
    { country: "Lao PDR", name: "Yengher Vacha", role: "CSCO", org: "Luang Prabang City Administrative Office", title: "Vice Head" },
    // Malaysia
    { country: "Malaysia", name: "Saidatu Akhma binti Hassan", role: "NR", org: "Ministry of Housing and Local Government", title: "Deputy Secretary General (Sustainability Planning & Environment)" },
    { country: "Malaysia", name: "Muhamad Sade bin Mohamad Amin", role: "Staff", org: "Ministry of Housing and Local Government", title: "Undersecretary" },
    { country: "Malaysia", name: "Hasniza Binti Sheikh Said @ Ahmad", role: "Staff", org: "Ministry of Housing and Local Government", title: "Principal Assistant Secretary" },
    { country: "Malaysia", name: "Mohd Azlan bin Idris", role: "Staff", org: "Ministry of Housing and Local Government", title: "Principal Assistant Secretary" },
    { country: "Malaysia", name: "Maimunah Jaffar", role: "CSCO", org: "Iskandar Regional Development Authority", title: "Director, Strategic Driver" },
    // Myanmar
    { country: "Myanmar", name: "Myo Aung", role: "NR", org: "Nay Pyi Taw Development Committee", title: "Permanent Secretary" },
    // Philippines
    { country: "Philippines", name: "Benjamin C. Abalos, Jr.", role: "NR", org: "Department of the Interior and Local Government", title: "Secretary" },
    { country: "Philippines", name: "Floro Q. Casas, Jr.", role: "CSCO", org: "Cebu City Government", title: "City Administrator" },
    { country: "Philippines", name: "Kristine Batucan", role: "CSCO", org: "Cebu City Government", title: "City Administrator" },
    { country: "Philippines", name: "Fortunato Palileo", role: "CSCO", org: "City of Manila", title: "Officer" },
    { country: "Philippines", name: "Danilo Lacuna", role: "CSCO", org: "City of Manila", title: "Officer" },
    { country: "Philippines", name: "Rowena Henedine Dominguez-Narajos", role: "CSCO-Alt", org: "Davao City Government", title: "Information Technology Officer II" },
    { country: "Philippines", name: "Mitzi Ann B. Gabriel", role: "Staff", org: "Cauayan City", title: "Secretary to the City Mayor" },
    // Singapore
    { country: "Singapore", name: "Zhongren Ang", role: "CSCO", org: "Ministry of Digital Development and Information", title: "Director, Smart City Division" },
    // Thailand
    { country: "Thailand", name: "Punya Chupanit", role: "CSCO", org: "Ministry of Transport (Bangkok)", title: "Director General, Office of Transport and Traffic Policy and Planning" },
    { country: "Thailand", name: "Chaiwat Sangkapark", role: "Staff", org: "Ministry of Transport (Bangkok)", title: "Director, Bureau of Transport and Traffic System Development" },
    { country: "Thailand", name: "Suphatchaya Chonchanachai", role: "Staff", org: "Ministry of Energy (Chonburi)", title: "Plan and Policy Analyst" },
    { country: "Thailand", name: "Bussayamas Tongsapjaroen", role: "Staff", org: "Digital Economy Promotion Agency (Phuket)", title: "Senior Officer" },
    { country: "Thailand", name: "Sittilak Promjan", role: "Staff", org: "Ministry of Transport (Bangkok)", title: "Civil Engineer" },
    // Viet Nam
    { country: "Viet Nam", name: "Nguyen The Hung", role: "CSCO", org: "People's Committee of Ha Noi City", title: "Vice Chairperson" },
  ];

  const ROLE_CLASS = { NR: "alum-nr", "NR-Alt": "alum-nr", CSCO: "alum-csco", "CSCO-Alt": "alum-csco", Staff: "alum-staff" };
  const ROLE_LABEL = { NR: "NR", "NR-Alt": "NR-Alt", CSCO: "CSCO", "CSCO-Alt": "CSCO-Alt", Staff: "Staff" };

  const id = "alum-search";
  const rows = ALUMNI.map((a, i) => `
    <div class="alum-row" data-search="${(a.name + " " + a.country + " " + a.org + " " + a.title).toLowerCase()}">
      <span class="alum-name">${esc(a.name)}</span>
      <span class="alum-country">${esc(a.country)}</span>
      <span class="alum-title">${esc(a.title)}, ${esc(a.org)}</span>
      <span class="alum-role-badge ${ROLE_CLASS[a.role] || "alum-staff"}">${ROLE_LABEL[a.role] || a.role}</span>
    </div>`).join("");

  const html = `
    <div class="alum-section">
      <div class="alum-header">
        <div>
          <p class="label">ASCN Alumni</p>
          <h3 class="alum-title-h">Former officials, no longer on the active roster</h3>
          <p class="alum-lede">These individuals served in official ASCN roles — as National Representatives, Chief Smart City Officers, or staff contacts — and appeared in previous versions of the ASCN Contact List (October 2024 – March 2026). They are not present in the current roster (April 2026). Their affiliation was real and time-bound. Any current claims of active ASCN involvement by or on behalf of these individuals should be verified against <a href="https://asean.org/body/asean-smart-cities-network/" target="_blank" rel="noopener">asean.org</a>.</p>
        </div>
        <div class="alum-controls">
          <input class="alum-search-input" id="${id}" type="search" placeholder="Search by name, country, or organization…" aria-label="Search alumni" />
          <span class="alum-count muted" id="alum-count">${ALUMNI.length} former officials</span>
        </div>
      </div>
      <div class="alum-list" id="alum-list">${rows}</div>
    </div>`;

  // Wire search after render (called via setTimeout to ensure DOM is ready)
  setTimeout(() => {
    const input = document.getElementById(id);
    const list = document.getElementById("alum-list");
    const countEl = document.getElementById("alum-count");
    if (!input || !list) return;
    input.addEventListener("input", () => {
      const q = input.value.toLowerCase().trim();
      let visible = 0;
      list.querySelectorAll(".alum-row").forEach((row) => {
        const match = !q || row.dataset.search.includes(q);
        row.hidden = !match;
        if (match) visible++;
      });
      countEl.textContent = q ? `${visible} of ${ALUMNI.length} shown` : `${ALUMNI.length} former officials`;
    });
  }, 0);

  return html;
}

/* ---------------- Essay ---------------- */
/* ---------------- Research ---------------- */
function renderResearch() {
  const el = document.getElementById("research-content");
  if (!el) return;

  const THEMES = [
    {
      n: "01", label: "The Learning Gap",
      heading: "Information sharing ≠ knowledge transfer",
      body: "ASCN generates meetings, reports, and bilateral partnerships — but systematic learning across cities is largely absent. Tan, Taeihagh &amp; Sha (2021) conducted 19 key-informant interviews with ASCN participants and found that most knowledge transfer is voluntary and inspiration-based. Cities attend meetings, hear what others are doing, take away ideas. Copying a practice, adapting a methodology, or building on a peer city's failure data: rare. The network produces information. It has not yet built the infrastructure for knowledge.",
      tags: ["Tan et al. 2021", "Costoya 2022"],
    },
    {
      n: "02", label: "The Capacity Paradox",
      heading: "One table. Very different starting points.",
      body: "ASCN's 38 cities sit at one table. They do not sit at the same table. Singapore's GDP per capita (PPP) in 2017: $93,905. Cambodia's: $4,010. Singapore ranked 2nd in digital security globally; Bangkok 52nd, Yangon 57th, Manila 59th, Jakarta 60th. Crumpton et al. (2021) found that implementing even a mid-range smart city approach would require outside funding equivalent to some cities' entire annual operating budgets. Kanaev &amp; Fedorenko (2023) put it plainly: for Singapore, smart city development is trivially achievable. For the others, it is a genuine developmental challenge.",
      tags: ["Crumpton et al. 2021", "Kanaev &amp; Fedorenko 2023"],
    },
    {
      n: "03", label: "The Singapore Question",
      heading: "The shepherd that models its own flock",
      body: "Singapore founded ASCN in 2018, held the Shepherd role 2019–2023, and served as the primary source of capacity-building content through its Centre for Liveable Cities. Kong &amp; Woods (2021) named this technocratic regionalism: one member's institutional assumptions packaged as neutral methodology and distributed as shared knowledge. Tan et al. (2021) document how ASCN simultaneously functions as Singapore's soft power extension and international branding vehicle. This is institutional logic, not bad faith. The question is whether Singapore's model — built on state land ownership, unified planning authority, and an 80% public-housing population — transfers to cities where none of those conditions exist.",
      tags: ["Kong &amp; Woods 2021", "Tan et al. 2021", "Kanaev &amp; Fedorenko 2023"],
    },
    {
      n: "04", label: "The Implementation Pivot",
      heading: "From plans to bankable projects",
      body: "ASCN spent its first five years (2018–2022) building a framework: the Smart Cities Framework, the M&amp;E methodology, the Terms of Reference, the city typology. Indonesia's shepherdship (2023–2025) represented a deliberate pivot. Prayogo &amp; Juned (2025) document how Indonesia used dual roles as Chair and Shepherd to shift the network from conceptual planning to funded implementation. Key deliverable: the ASEAN Smart City Investment Toolkit. Projects grew from 77 (2022) to 108 (Sept 2024). Indonesia's Sumedang pilot — stunting rates reduced from 32.2% to 7.89% through data-driven social services — offered an alternative to capital-intensive models.",
      tags: ["Prayogo &amp; Juned 2025", "Lim 2024"],
    },
    {
      n: "05", label: "The Measurement Problem",
      heading: "Output vs outcome: what the M&amp;E framework counts",
      body: "Four M&amp;E cycles. 134 projects. What do we know about whether any of them worked? Hollands (2008) identified the central gap in smart city reporting a decade before ASCN was founded: the record consistently documents what was deployed, not whether deployment produced better lives. Kitchin (2014) confirmed the pattern globally. ASCN's M&amp;E framework is more sophisticated than most — it tracks implementation status and strategic target progress across six focus areas. But it does not yet systematically measure outcomes: whether Phnom Penh's waste management reduced illness rates; whether Da Nang's transport system cut commute times; whether Bangkok's digital platform produced decisions city officials could not previously make.",
      tags: ["Hollands 2008", "Kitchin 2014", "Costoya 2022"],
    },
    {
      n: "06", label: "The Diplomatic Dimension",
      heading: "Smart city as foreign policy",
      body: "ASCN is a technical governance network. It is also a diplomatic arena. Prayogo &amp; Juned (2025) introduce 'smart city diplomacy' to describe how Indonesia used the Shepherd role to assert middle-power regional leadership — offering diverse pilot city models as a counter-narrative to capital-intensive approaches. Thailand's 2019 chairmanship focused on external partner relations. Cambodia's 2022 chairmanship introduced the Green Deal theme. Brunei navigated digital resilience during COVID-19. Lao PDR chaired in 2024. Each annual chair shapes the network's emphasis in ways that serve domestic as well as regional goals. Reading the annual meeting communiqués as diplomatic texts reveals the political infrastructure beneath the smart city language.",
      tags: ["Prayogo &amp; Juned 2025", "Tan et al. 2021", "Lim 2024"],
    },
    {
      n: "07", label: "Rights &amp; Surveillance",
      heading: "The rights gap no one wants to name",
      body: "Half of ASEAN's member states rank as authoritarian or semi-authoritarian. The Democracy Index 2023 places Cambodia at rank 121, Vietnam at 136, Laos at 159, Myanmar at 166. Putra (2026), in F1000Research with open international peer review, identifies two structural risks: surveillance and control infrastructure deployed into governance contexts where democratic accountability is already constrained; and development models imposed by external funders (JICA, China BRI/Huawei) whose interests may not align with vulnerable communities. De Jonge (2023), applying a knowledge commons framework to ASCN's transport and energy projects, adds a related finding: the same top-down governance structures administering the network's smart city ambitions have historically treated economic efficiency as a constraint on rights, not the reverse. AI-driven civic participation is not a current feature of any ASCN project. Phnom Penh's experience of forced privatisation disadvantaging low-income residents is documented in the same literature. This is not a fringe concern — it is the convergent finding of the most recent wave of ASCN scholarship.",
      tags: ["Putra 2026", "de Jonge 2023", "Crumpton et al. 2021"],
    },
    {
      n: "08", label: "Perceptions &amp; Languages",
      heading: "Who writes about ASCN — and from where",
      body: "The academic literature on ASCN is overwhelmingly in English (95% of 229+ catalogued works) and produced from Singaporean, British, Australian, and Indonesian institutions. Local-language scholarship — Indonesian, Thai, Vietnamese, Chinese, Korean — exists but is underrepresented in the critical canon. Country perceptions diverge sharply: Indonesia frames its Shepherd role as regional leadership; Singapore is read as architect and knowledge broker; Thailand treats ASCN as an extension of its national smart-city programme; Vietnam is quiet in both M&amp;E reporting and critical scholarship; Cambodia and Laos emphasize external-partner support; Myanmar's participation persists through crisis. The result is not one ASCN narrative but several — each shaped by national capacity, political system, and proximity to the network's power centre.",
      tags: ["Academic Perspectives Report 2025", "Prayogo &amp; Juned 2025", "Kong &amp; Woods 2021"],
    },
  ];

  const FAQ = [
    { q: "What is ASCN?", a: "The ASEAN Smart Cities Network is a collaborative platform established at the 32nd ASEAN Summit, Singapore, April 2018. It connects cities across ASEAN member states to share knowledge, develop joint smart city frameworks, catalyse bankable projects, and secure support from external partners. Core objective (Singapore MFA's own framing): 'improving peoples' lives, using technology as an enabler.' Started with 26 pilot cities in 10 countries. As of January 2026 it has 38 cities across 11 member states — Dili (Timor-Leste) joined as the network's newest member when Timor-Leste acceded to ASEAN, making it the only ASCN city from the 11th member state." },
    { q: "What is the difference between a 'Chair' and a 'Shepherd'?", a: "The Chair follows ASEAN's annual rotation — a different member state leads each year. The NR of the Chair country leads the ASCN meeting for that year. The Shepherd is a multi-year appointment designed to provide institutional memory and continuity across the rotation. Singapore was Shepherd 2019–2023; Indonesia holds the role 2023–2025. The Shepherd does not chair meetings — it holds strategic stability so the network does not restart from scratch every year." },
    { q: "What is a Smart City Action Plan (SCAP)?", a: "Each ASCN member city develops a SCAP: Vision (what the city aims to achieve), Focus Areas (which of the 6 ASCN categories it is prioritising), Strategic Targets (measurable, time-bound goals), and Priority Projects (2–3 projects the city wants to implement, with support requirements specified). The original 26 SCAPs were developed at the Smart Cities Governance Workshop in Singapore, May 2018. They are living documents updated annually." },
    { q: "Has ASCN produced measurable results?", a: "The network has produced measurable outputs: 134 documented projects, 38 cities, 4 M&E cycles, bilateral partnerships with Japan, South Korea, Australia, the EU, and others, and an ASEAN Smart City Investment Toolkit launched in 2024. Whether those outputs have produced measurable outcomes — improved quality of life for residents — is a question the current M&E framework is not yet designed to answer systematically. Individual cities have documented results: Sumedang's stunting rate fell from 32.2% to 7.89% through data-driven social services governance. Cross-network outcome measurement remains an open challenge." },
    { q: "What are the main academic criticisms?", a: "Five structural concerns appear consistently across the literature. (1) Kong &amp; Woods (2021): Singapore's foundational role produces technocratic regionalism — its urban model circulates as neutral regional knowledge. (2) Tan et al. (2021): knowledge transfer is voluntary and shallow; cities inspire each other but do not systematically learn from each other. (3) Crumpton et al. (2021): vast capacity gaps between member states — and authoritarian governance tendencies in several — undermine the conditions for participatory smart city outcomes. (4) Kanaev &amp; Fedorenko (2023): what is trivially achievable for Singapore is a genuine developmental challenge for Cambodia, Laos, and Myanmar. (5) Putra (2026): deploying surveillance infrastructure into authoritarian and semi-authoritarian governance contexts is not a neutral technical act — half of ASEAN ranks as authoritarian or semi-authoritarian in the Democracy Index 2023; de Jonge (2023) adds that existing top-down governance structures treat economic efficiency as a constraint on rights, not a complement. The most consistent finding across all five: the gap between output tracking and outcome measurement." },
  { q: "Is ASCN viewed the same way across Southeast Asia?", a: "No. Country perceptions diverge with capacity and political context. Indonesia frames its Shepherd role as regional smart-city leadership. Singapore is seen — including by its own scholars — as the network's architect and primary knowledge broker. Thailand treats ASCN as a regional extension of its domestic smart-city programme. Vietnam participates but produces little public commentary or critical scholarship. Cambodia and Lao PDR emphasize external partner support and capacity gaps. Myanmar's participation continues technically despite the post-2021 crisis, though civil society opposes engagement with the junta. Brunei and Timor-Leste have the smallest footprints and the quietest public debates." },
    { q: "What happens at the annual meeting?", a: "The ASCN Annual Meeting is hosted by the Chair country and attended by National Representatives (SOM level) and Chief Smart City Officers (Director level) from each member city. Agenda: progress reporting against SCAPs, M&E results discussion, new projects seeking partnerships, and bilateral engagement sessions with external partners. Meeting outcomes are submitted to ASEAN Leaders through the Joint Consultative Meeting and ASEAN Coordinating Council. Eight consecutive meetings have been held since 2018." },
    { q: "How does a city join?", a: "Membership is state-based: a city is nominated by its national government, not independently. The original 26 were nominated at founding in 2018; subsequent additions were added through national nomination endorsed at annual meetings. A city interested in joining should engage its national ministry responsible for urban development or digital economy to initiate the nomination process." },
  ];

  const PAPERS = [
    { n: "R1", type: "journal", author: "Tan, S.-Y., Taeihagh, A. &amp; Sha, K.", year: 2021,
      title: "How Transboundary Learning Occurs: Case Study of the ASEAN Smart Cities Network (ASCN)",
      venue: "Sustainability, 13(6), 6502 · doi:10.3390/su13116502",
      summary: "19 key-informant interviews. ASCN functions simultaneously as Singapore's soft power extension, a regional branding tool, and a symbiotic public-private platform. Knowledge transfer is voluntary and inspiration-based. Enablers: effective branding, knowledge demand, external partner interest. Barriers: governance complexity, limited political will, lack of explicit transfer mechanisms. Most rigorous empirical study of the network to date.",
      themes: ["learning", "singapore"] },
    { n: "R2", type: "journal", author: "Crumpton, C.D., Wongthanavasu, S., Kamnuansilpa, P., Draper, J. &amp; Bialobrzeski, E.", year: 2021,
      title: "Assessing the ASEAN Smart Cities Network (ASCN) via the Quintuple Helix Innovation Framework",
      venue: "International Journal of Urban Sustainable Development, 13(1), 97–116",
      summary: "Quintuple Helix analysis (academia–industry–government–civil society–environment). GDP/PPP 2017: Singapore $93,905 vs Cambodia $4,010. Digital security: Singapore 2nd globally; Bangkok 52nd, Yangon 57th. Authoritarian governance in most ASEAN states structurally undermines participatory smart city outcomes. Recommends community-outreach-centred approach over top-down.",
      themes: ["capacity", "measurement"] },
    { n: "R3", type: "journal", author: "Kong, L. &amp; Woods, O.", year: 2021,
      title: "Scaling smartness, (de)provincialising the city? The ASEAN Smart Cities Network and the translational politics of technocratic regionalism",
      venue: "Cities, 117, 103326 · doi:10.1016/j.cities.2021.103326",
      summary: "Argues Singapore's structural position produces technocratic regionalism — its urban model circulates as neutral regional knowledge. Empirical base: news articles and CLC marketing materials; four M&E cycles of project data not engaged. Both authors at Singapore Management University. Correct diagnosis of the structural dynamic; prescription ('slow, small, collaborative') lacks operational precision.",
      themes: ["singapore", "learning"] },
    { n: "R4", type: "journal", author: "Prayogo, A.N. &amp; Juned, M.", year: 2025,
      title: "Indonesia's Smart City Diplomacy Through ASEAN Smart Cities Network Shepherdship (2023–2025)",
      venue: "Journal of Social and Political Sciences, 8(3), 39–47",
      summary: "Documents Indonesia's strategic pivot from framework to bankable projects. Introduces 'smart city diplomacy' as a middle-power foreign policy concept. Key deliverable: ASEAN Smart City Investment Toolkit. Four pilot cities: Jakarta (metro governance), Makassar (public security), Banyuwangi (circular economy), Sumedang (data-driven social services — stunting rate 32.2% → 7.89%). Projects: 77 (2022) → 108 (Sept 2024).",
      themes: ["implementation", "diplomacy"] },
    { n: "R5", type: "journal", author: "Kanaev, E.A. &amp; Fedorenko, D.O.", year: 2023,
      title: "Whither ASEAN Smart Cities Network? Evidence from Singapore and Its Energy Policy",
      venue: "Yugo-Vostochnaya Aziya: aktual'nyye problemy razvitiya, 4(3), 191–201",
      summary: "Analyses ASCN through Singapore's energy policy dimension. Singapore's smart city work is trivially achievable given its resources; for others it is a genuine developmental challenge. Intra-ASEAN digital gaps are severe: Singapore/Brunei/Malaysia above average; Cambodia/Myanmar/Laos far below. Only Myanmar and Thailand have energy-related ASCN projects. Predicts slow, uneven progress.",
      themes: ["capacity", "singapore"] },
    { n: "R6", type: "official", author: "Lim, C.C. (ASEAN Secretariat)", year: 2024,
      title: "Smart Cities and Sustainable Urbanisation in ASEAN",
      venue: "Plenary, 6th ASEAN–Japan Smart Cities Network High-Level Meeting · Tokyo, 29 October 2024",
      summary: "ASEAN Secretariat director's overview at year six. 108 projects (Sept 2024): Civic &amp; Social 27%, Built Infrastructure 26%, Quality Environment 21%, Safety &amp; Security 12%, Industry &amp; Innovation 11%, Health 6%. Sumedang and Sihanoukville joined in 2024 (31 cities). ASEAN Smart City Financing Toolkit launched. ASUS Phase II commenced.",
      themes: ["implementation", "measurement"] },
    { n: "R7", type: "official", author: "Singapore Ministry of Foreign Affairs", year: 2018,
      title: "ASEAN Smart Cities Network (ASCN) — Founding Presentation",
      venue: "Internal briefing document · Singapore, 2018",
      summary: "Singapore MFA's internal framing at founding. Core objective: 'improving peoples' lives, using technology as an enabler.' Defines 26 original pilot cities, the NR/CSCO governance structure, and the Twinning Programme with 15 external partners. Articulates ASCN's 'broad and inclusive' definition of smart = digital adoption + sustainability. Primary document for understanding Singapore's founding vision and the logic behind the Shepherd model.",
      themes: ["singapore", "diplomacy"] },
    { n: "R8", type: "official", author: "ASEAN Secretariat", year: 2018,
      title: "ASCN Smart City Action Plans (Consolidated)",
      venue: "As of 8 July 2018 · ASEAN Singapore 2018",
      summary: "Consolidated SCAPs for all 26 original pilot cities. Each plan: Vision, Focus Areas, Strategic Targets, Priority Projects. Documents the full range of founding ambitions: from Bandar Seri Begawan's Kampong Ayer heritage revitalisation to Battambang's sewage infrastructure and informal settlement formalisation. Primary evidence that 'smart city' meant different things to different cities from day one.",
      themes: ["implementation", "capacity"] },
    { n: "R9", type: "journal", author: "Putra, B.A.", year: 2026,
      title: "Human Rights and the ASEAN Smart Cities Network: Covering Unaddressed Civic and Social Concerns",
      venue: "F1000Research, 14:733 · doi:10.12688/f1000research.167098.3",
      summary: "Open peer review (4 reviewers: Tampere, Danang, Sydney, Kerala). Argues ASCN 'lacks proper consideration towards human rights and elements of sustainability in its civic and social dimensions.' Two structural risks: (1) surveillance infrastructure in states where authoritarian governance constrains democratic accountability (Cambodia rank 121, Vietnam 136, Laos 159, Myanmar 166 in Democracy Index 2023); (2) external-funder development models (JICA, China BRI/Huawei) that may override local needs. Recommends acknowledging vulnerability of underprivileged communities and strengthening bottom-up grassroots digital initiatives.",
      themes: ["rights", "capacity", "measurement"] },
    { n: "R10", type: "journal", author: "Martinus, M.", year: 2020,
      title: "ASEAN Smart Cities Network: A Catalyst for Partnerships",
      venue: "ISEAS–Yusof Ishak Institute Perspective, 2020(32)",
      summary: "Written at the network's two-year mark by the lead researcher at ISEAS's ASEAN Studies Centre. Identifies ASCN's structural innovation: city-level (not state-level) cooperation that 'defies the so-called ASEAN top-down approach by embracing regionalism while allowing local government autonomy and participation.' Documents 20 partnerships 2018–2019. Industry &amp; innovation (7) and safety &amp; security (6) attract most external partner interest. Huawei appears in partnerships involving Phuket, Davao, and Singapore.",
      themes: ["diplomacy", "implementation", "singapore"] },
    { n: "R11", type: "journal", author: "Costoya, M.M.", year: 2022,
      title: "South–South Cooperation and the Promise of Experimentalist Governance: The ASEAN Smart Cities Network",
      venue: "Politics and Governance, 10(2), 116–127 · doi:10.17645/pag.v10i2.4917",
      summary: "Applies experimentalist governance theory to ASCN. Identifies four features of ideal experimentalist governance; ASCN has three but lacks the fourth: diagnostic monitoring of a portfolio of projects — 'continuous learning about what works and what doesn't, peer review, revision of rules.' This missing feedback loop is the structural gap between a coordinating network and an effective learning network. Source of the essay's 'experimentalist governance without diagnostic monitoring' formulation.",
      themes: ["measurement", "learning"] },
    { n: "R12", type: "journal", author: "de Jonge, A.", year: 2023,
      title: "Governance and Human Rights Implications of ASEAN's Smart Cities Network: A Knowledge Commons Analysis",
      venue: "International Journal of Law in Context, 19(S1), 13–31",
      summary: "First legal analysis of ASCN using the Knowledge Commons Framework. Analyses smart mobility and smart energy projects through human rights criteria. Finds top-down governance and weak civil society characterise most ASEAN polities; 'economic efficiency' considerations 'restrict rights' rather than complement them. Identifies Phnom Penh forced privatisation as a case where smart city development disadvantaged low-income residents. AI-driven public participation is absent from all current ASCN projects.",
      themes: ["rights", "implementation"] },
    { n: "R13", type: "journal", author: "Nafy, D.R.A., Azzam, A. &amp; Adamma, A.Y.", year: 2024,
      title: "ASCN Cooperation for Digital Inclusion: Indonesia and Malaysia",
      venue: "Proceedings of IROFONIC 2024",
      summary: "Comparative analysis using Hill &amp; Hupe's multi-level governance framework. Indonesia focuses on MSMEs (JakPreneur: 405,000+ registered entrepreneurs); Malaysia emphasises urban data management (IMAC, KLUO). Governance differs at constitutional, organisational, and operational levels. Identifies structural gap: digital inclusion benefits remain concentrated among wealthier urban segments in both countries. One of few studies applying multi-level governance theory to ASCN city-level implementation.",
      themes: ["capacity", "measurement"] },
    { n: "R14", type: "journal", author: "Vadiati, N.", year: 2022,
      title: "Alternatives to Smart Cities: A Call for Consideration of Grassroots Digital Urbanism",
      venue: "Digital Geography and Society, 3, 100030",
      summary: "68+ citations. Argues the smart city literature systematically ignores grassroots digital urbanism — informal, citizen-led technology adoption that often outperforms top-down deployments in reach, uptake, and sustainability. Nakhon Si Thammarat's LINE-based engagement platform (40,000+ users, ~44% of municipal population, 10M baht operational savings) is an instance of exactly this model: meeting the city where it already is, rather than where a procurement specification says it should be.",
      themes: ["capacity", "measurement", "rights"] },
  ];

  const typeLabel = { journal: "PEER REVIEWED", official: "OFFICIAL DOC" };

  el.innerHTML = `
<div class="section-head">
  <p class="label">Research</p>
  <h2>What the scholarship says — and what it misses</h2>
  <p class="lede">A synthesis of fourteen peer-reviewed papers and official documents on ASCN. Eight structural themes, an insider FAQ, and a full bibliography — written by a participant who has attended every annual meeting since 2018.</p>
</div>

<div class="research-section">
  <p class="research-section-label label">SEVEN THEMES FROM THE LITERATURE</p>
  <div class="research-theme-grid">
    ${THEMES.map(t => `<article class="research-theme">
      <div class="research-theme-top">
        <span class="research-theme-n">${t.n}</span>
        <span class="research-theme-label">${t.label}</span>
      </div>
      <h3 class="research-theme-h">${t.heading}</h3>
      <p class="research-theme-body">${t.body}</p>
      <div class="research-theme-tags">${t.tags.map(tag => `<span class="research-tag">${tag}</span>`).join("")}</div>
    </article>`).join("")}
  </div>
</div>

<div class="research-section">
  <p class="research-section-label label">FREQUENTLY ASKED</p>
  <div class="faq-list">
    ${FAQ.map(item => `<details class="faq-item">
      <summary class="faq-q">${item.q}</summary>
      <p class="faq-a">${item.a}</p>
    </details>`).join("")}
  </div>
</div>

<div class="research-section">
  <p class="research-section-label label">BIBLIOGRAPHY — 14 DOCUMENTS</p>
  <div class="paper-grid">
    ${PAPERS.map(p => `<article class="paper-card">
      <div class="paper-meta-row">
        <span class="paper-n">${p.n}</span>
        <span class="paper-type ${p.type === "journal" ? "paper-type--j" : "paper-type--o"}">${typeLabel[p.type]}</span>
        <span class="paper-year">${p.year}</span>
      </div>
      <p class="paper-author">${p.author}</p>
      <h4 class="paper-title">${p.title}</h4>
      <p class="paper-venue">${p.venue}</p>
      <p class="paper-summary">${p.summary}</p>
      <div class="paper-themes">${p.themes.map(th => `<span class="paper-theme-tag">${th}</span>`).join("")}</div>
    </article>`).join("")}
  </div>
</div>

<div class="research-section">
  <p class="research-section-label label">ACADEMIC GEOGRAPHY</p>
  <div class="geo-grid">
    <div class="geo-col">
      <p class="geo-h">Languages of scholarship</p>
      <p class="geo-body">Of 229+ works catalogued, 218 (95%) are in English. Indonesian/Malay contributes 4, Thai 3, Chinese 2, Korean 1, Vietnamese 1, Japanese-linked English 3. Local-language scholarship is growing — especially in Indonesia and Thailand — but the critical canon is still written largely in English from Singapore, UK, and Australian institutions.</p>
    </div>
    <div class="geo-col">
      <p class="geo-h">Country narratives</p>
      <ul class="geo-list">
        <li><b>Indonesia</b> — Shepherd as smart-city diplomacy; pivot to bankable projects.</li>
        <li><b>Singapore</b> — Architect, knowledge broker, and object of technocratic-regionalism critique.</li>
        <li><b>Thailand</b> — National smart-city programme as regional showcase.</li>
        <li><b>Vietnam</b> — State-led, quiet in ASCN deliberations; strong domestic tech vendors.</li>
        <li><b>Cambodia / Lao PDR</b> — External-partner dependent; capacity and rights concerns.</li>
        <li><b>Myanmar</b> — Participation persists through crisis; civil-society opposition.</li>
      </ul>
    </div>
  </div>
</div>

<div class="research-section">
  <p class="research-section-label label">INSIDER PERSPECTIVE</p>
  <div class="insider-block">
    <p class="insider-lede">The scholarship on ASCN has grown since the network launched. Eight papers and documents now constitute a body of evidence. Most is written by people who study the network from outside. Four things the literature gets right, and one thing it consistently misses:</p>
    <div class="insider-grid">
      <div class="insider-item insider-item--yes">
        <span class="insider-mark">✓</span>
        <div><strong>The knowledge transfer problem is real.</strong> Tan et al. (2021) are correct that the network's information sharing is shallow. The annual meeting is where this is most visible: officials leave knowing what Phnom Penh is doing. They do not leave with a system to use it.</div>
      </div>
      <div class="insider-item insider-item--yes">
        <span class="insider-mark">✓</span>
        <div><strong>The capacity gap is structural.</strong> A framework that treats Singapore and Cambodia as starting from the same place has miscalibrated its baseline. Crumpton et al. (2021) are right to flag it. The framework's flexibility is not a flaw — it is how differentiation survives the non-interference principle.</div>
      </div>
      <div class="insider-item insider-item--yes">
        <span class="insider-mark">✓</span>
        <div><strong>The measurement gap matters.</strong> 134 projects documented. We do not know what percentage improved daily life for a resident. Hollands (2008) described this problem before ASCN existed. It persists.</div>
      </div>
      <div class="insider-item insider-item--yes">
        <span class="insider-mark">✓</span>
        <div><strong>Indonesia's pivot was deliberate.</strong> The shift from framework to bankable projects under Indonesia's shepherdship was a strategic decision, not natural evolution. Prayogo &amp; Juned (2025) document it correctly.</div>
      </div>
      <div class="insider-item insider-item--no">
        <span class="insider-mark">✗</span>
        <div><strong>What the literature misses: it does not use the project data.</strong> Kong &amp; Woods (2021), the most cited critical paper on ASCN, does not engage the four M&E cycles of city-level project documentation. A critique of what the network builds that does not look at what the network builds is incomplete. That is what this platform exists to correct.</div>
      </div>
    </div>
  </div>
</div>
`;
}

/* ---------------- Essay ---------------- */
function renderEssay() {
  const p = (text) => `<p class="essay-p">${text}</p>`;
  const h = (n, text) => `<h${n} class="essay-h${n}">${text}</h${n}>`;
  const pull = (text, attr) => `<blockquote class="essay-pull">${text}${attr ? `<cite>${attr}</cite>` : ""}</blockquote>`;

  /* ---- Governance diagram ---- */
  const govDiagram = `<figure class="essay-diagram" aria-label="ASCN governance structure">
  <svg viewBox="0 0 680 256" xmlns="http://www.w3.org/2000/svg">
    <rect x="240" y="10" width="200" height="44" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>
    <text x="340" y="28" text-anchor="middle" font-size="11" font-family="'Source Sans 3',sans-serif" font-weight="700" fill="#1a1a1a">ASEAN SECRETARIAT</text>
    <text x="340" y="43" text-anchor="middle" font-size="9.5" font-family="'Source Sans 3',sans-serif" fill="#666">Jakarta · Network coordinator</text>
    <line x1="340" y1="54" x2="340" y2="80" stroke="#1a1a1a" stroke-width="1"/>
    <line x1="340" y1="80" x2="170" y2="80" stroke="#1a1a1a" stroke-width="1"/>
    <line x1="340" y1="80" x2="510" y2="80" stroke="#1a1a1a" stroke-width="1"/>
    <line x1="170" y1="80" x2="170" y2="96" stroke="#1a1a1a" stroke-width="1"/>
    <line x1="510" y1="80" x2="510" y2="96" stroke="#1a1a1a" stroke-width="1"/>
    <rect x="80" y="96" width="180" height="52" fill="#fef9ed" stroke="#f59e0b" stroke-width="1.5"/>
    <text x="170" y="114" text-anchor="middle" font-size="9" font-family="'Source Sans 3',sans-serif" font-weight="700" letter-spacing="0.07em" fill="#92400e">SHEPHERD 2023–2027</text>
    <text x="170" y="129" text-anchor="middle" font-size="11" font-family="'Source Sans 3',sans-serif" font-weight="700" fill="#1a1a1a">Indonesia</text>
    <text x="170" y="142" text-anchor="middle" font-size="9.5" font-family="'Source Sans 3',sans-serif" fill="#666">Institutional continuity</text>
    <rect x="420" y="96" width="180" height="52" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>
    <text x="510" y="114" text-anchor="middle" font-size="9" font-family="'Source Sans 3',sans-serif" font-weight="700" letter-spacing="0.07em" fill="#666">ANNUAL CHAIR</text>
    <text x="510" y="129" text-anchor="middle" font-size="11" font-family="'Source Sans 3',sans-serif" font-weight="700" fill="#1a1a1a">Malaysia 2025</text>
    <text x="510" y="142" text-anchor="middle" font-size="9.5" font-family="'Source Sans 3',sans-serif" fill="#666">Rotates annually</text>
    <line x1="340" y1="148" x2="340" y2="172" stroke="#ccc" stroke-width="1" stroke-dasharray="4 3"/>
    <text x="340" y="188" text-anchor="middle" font-size="9.5" font-family="'Source Sans 3',sans-serif" font-weight="700" letter-spacing="0.06em" fill="#1a1a1a">10 MEMBER STATES · 38 CITIES · 134 PROJECTS</text>
    <line x1="30" y1="200" x2="650" y2="200" stroke="#e5e5e5" stroke-width="1"/>
    <text x="50" y="216" font-size="8.5" font-family="'Source Sans 3',sans-serif" fill="#666">Brunei</text>
    <text x="104" y="216" font-size="8.5" font-family="'Source Sans 3',sans-serif" fill="#666">Cambodia</text>
    <text x="175" y="216" font-size="8.5" font-family="'Source Sans 3',sans-serif" fill="#666">Indonesia</text>
    <text x="248" y="216" font-size="8.5" font-family="'Source Sans 3',sans-serif" fill="#666">Lao PDR</text>
    <text x="305" y="216" font-size="8.5" font-family="'Source Sans 3',sans-serif" fill="#666">Malaysia</text>
    <text x="365" y="216" font-size="8.5" font-family="'Source Sans 3',sans-serif" fill="#666">Myanmar</text>
    <text x="418" y="216" font-size="8.5" font-family="'Source Sans 3',sans-serif" fill="#666">Philippines</text>
    <text x="492" y="216" font-size="8.5" font-family="'Source Sans 3',sans-serif" fill="#666">Singapore</text>
    <text x="554" y="216" font-size="8.5" font-family="'Source Sans 3',sans-serif" fill="#666">Thailand</text>
    <text x="610" y="216" font-size="8.5" font-family="'Source Sans 3',sans-serif" fill="#666">Viet Nam</text>
    <text x="340" y="244" text-anchor="middle" font-size="8.5" font-family="'Source Sans 3',sans-serif" fill="#999">Plus Timor-Leste (newest member, city: Dili). Source: ASCN M&amp;E Reports 2022–2025.</text>
  </svg>
  <figcaption>ASCN governance: the Secretariat coordinates, the Shepherd holds institutional memory, the Chair rotates annually.</figcaption>
</figure>`;

  /* ---- Focus area bar chart ---- */
  const focusDiagram = `<figure class="essay-diagram" aria-label="ASCN project distribution by focus area">
  <svg viewBox="0 0 580 218" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="16" font-size="9.5" font-family="'Source Sans 3',sans-serif" font-weight="700" letter-spacing="0.07em" fill="#1a1a1a">FOCUS AREA DISTRIBUTION — 134 PROJECTS · M&amp;E CYCLE 4 (2025)</text>
    <text x="0" y="32" font-size="9" font-family="'Source Sans 3',sans-serif" fill="#888">Approximate shares derived from ASCN M&amp;E reporting.</text>
    ${[["Smart Mobility",28,0],["Smart Living",26,28],["Smart Environment",22,56],["Smart Governance",18,84],["Smart Economy",12,112],["Smart People",8,140]].map(([label,pct,y])=>{
      const barW = Math.round(pct*4.0);
      const hi = pct>=26;
      return `<text x="0" y="${52+y+11}" font-size="9.5" font-family="'Source Sans 3',sans-serif" fill="#444">${label}</text>
      <rect x="142" y="${52+y}" width="${barW}" height="17" fill="${hi?"#f59e0b":"#1a1a1a"}" opacity="${hi?1:0.75}"/>
      <text x="${142+barW+6}" y="${52+y+12}" font-size="9" font-family="'Source Sans 3',sans-serif" fill="#888">${pct}%</text>`;
    }).join("")}
    <text x="0" y="204" font-size="8.5" font-family="'Source Sans 3',sans-serif" fill="#999">Smart Mobility + Smart Living account for more than half of documented projects. Smart Governance and Smart People remain underrepresented relative to the framework's stated priorities.</text>
  </svg>
  <figcaption>Project distribution reflects city demand, not network design. Mobility and living services are visible and fundable; governance-strengthening work — which underpins everything else — is harder to count and harder to fund.</figcaption>
</figure>`;

  /* ---- Timeline diagram ---- */
  const timelineDiagram = `<figure class="essay-diagram" aria-label="ASCN milestones 2018–2025">
  <svg viewBox="0 0 660 136" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="16" font-size="9.5" font-family="'Source Sans 3',sans-serif" font-weight="700" letter-spacing="0.07em" fill="#1a1a1a">ASCN MILESTONES 2018–2025</text>
    <line x1="20" y1="64" x2="640" y2="64" stroke="#1a1a1a" stroke-width="1.5"/>
    ${[
      [20,"2018","Founded\n26 cities"],
      [112,"2019","Thailand\nchairs"],
      [204,"2020","M&E\ncycle 1"],
      [296,"2021","34 cities"],
      [388,"2022","M&E\ncycle 2"],
      [480,"2023","Indonesia\nShepherd"],
      [572,"2024","38 cities\nLao chairs"],
    ].map(([x,yr,note])=>{
      const hi = yr==="2018"||yr==="2023";
      return `<circle cx="${x}" cy="64" r="${hi?6:4}" fill="${hi?"#f59e0b":"#1a1a1a"}"/>
      <text x="${x}" y="80" text-anchor="middle" font-size="8.5" font-family="'Source Sans 3',sans-serif" font-weight="700" fill="#1a1a1a">${yr}</text>
      ${note.split("\n").map((l,i)=>`<text x="${x}" y="${92+i*12}" text-anchor="middle" font-size="7.5" font-family="'Source Sans 3',sans-serif" fill="#666">${l}</text>`).join("")}`;
    }).join("")}
    <text x="640" y="52" text-anchor="end" font-size="8" font-family="'Source Sans 3',sans-serif" fill="#f59e0b" font-weight="700">2025 →</text>
    <text x="640" y="80" text-anchor="end" font-size="8.5" font-family="'Source Sans 3',sans-serif" font-weight="700" fill="#1a1a1a">Malaysia</text>
    <text x="640" y="92" text-anchor="end" font-size="7.5" font-family="'Source Sans 3',sans-serif" fill="#666">chairs</text>
    <text x="0" y="124" font-size="8.5" font-family="'Source Sans 3',sans-serif" fill="#999">Four M&amp;E cycles. Eight annual meetings. Two Shepherds. The measurement framework has not kept pace with the network's growth.</text>
  </svg>
  <figcaption>Seven years of meetings, partnerships, and reports. The network has grown steadily; the accountability architecture has not.</figcaption>
</figure>`;

  /* ---- Illustrations removed 2026-06-21 ---- */
  const illus1_REMOVED = `<figure class="essay-illus-UNUSED">
  <svg viewBox="0 0 400 190" xmlns="http://www.w3.org/2000/svg">
    <!-- Buildings -->
    <rect x="0" y="80" width="58" height="110" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>
    <rect x="8" y="92" width="12" height="12" fill="none" stroke="#1a1a1a" stroke-width="1"/>
    <rect x="26" y="92" width="12" height="12" fill="none" stroke="#1a1a1a" stroke-width="1"/>
    <rect x="8" y="112" width="12" height="12" fill="none" stroke="#1a1a1a" stroke-width="1"/>
    <rect x="26" y="112" width="12" height="12" fill="none" stroke="#1a1a1a" stroke-width="1"/>
    <rect x="66" y="100" width="48" height="90" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>
    <rect x="122" y="55" width="68" height="135" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>
    <rect x="132" y="68" width="14" height="14" fill="none" stroke="#1a1a1a" stroke-width="1"/>
    <rect x="152" y="68" width="14" height="14" fill="none" stroke="#1a1a1a" stroke-width="1"/>
    <rect x="132" y="90" width="14" height="14" fill="none" stroke="#1a1a1a" stroke-width="1"/>
    <rect x="152" y="90" width="14" height="14" fill="none" stroke="#1a1a1a" stroke-width="1"/>
    <rect x="132" y="112" width="14" height="14" fill="none" stroke="#1a1a1a" stroke-width="1"/>
    <rect x="152" y="112" width="14" height="14" fill="none" stroke="#1a1a1a" stroke-width="1"/>
    <rect x="330" y="65" width="60" height="125" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>
    <rect x="340" y="78" width="12" height="12" fill="none" stroke="#1a1a1a" stroke-width="1"/>
    <rect x="358" y="78" width="12" height="12" fill="none" stroke="#1a1a1a" stroke-width="1"/>
    <rect x="340" y="98" width="12" height="12" fill="none" stroke="#1a1a1a" stroke-width="1"/>
    <rect x="358" y="98" width="12" height="12" fill="none" stroke="#1a1a1a" stroke-width="1"/>
    <line x1="0" y1="190" x2="400" y2="190" stroke="#1a1a1a" stroke-width="1.5"/>
    <!-- Figure -->
    <circle cx="250" cy="112" r="13" fill="white" stroke="#1a1a1a" stroke-width="2"/>
    <circle cx="246" cy="111" r="1.5" fill="#1a1a1a"/>
    <circle cx="254" cy="111" r="1.5" fill="#1a1a1a"/>
    <path d="M246 116 Q250 119 254 116" fill="none" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="250" y1="125" x2="250" y2="158" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="250" y1="134" x2="270" y2="144" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
    <rect x="270" y="139" width="17" height="22" rx="2" fill="white" stroke="#1a1a1a" stroke-width="1.5"/>
    <rect x="273" y="143" width="11" height="13" fill="#f59e0b" opacity="0.85"/>
    <line x1="250" y1="134" x2="232" y2="147" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
    <line x1="250" y1="158" x2="242" y2="186" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
    <line x1="250" y1="158" x2="258" y2="186" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
    <!-- Data lines -->
    <line x1="195" y1="82" x2="272" y2="146" stroke="#f59e0b" stroke-width="1" stroke-dasharray="4 3" opacity="0.7"/>
    <circle cx="195" cy="82" r="3" fill="#f59e0b" opacity="0.7"/>
    <line x1="159" y1="96" x2="272" y2="148" stroke="#1a1a1a" stroke-width="0.8" stroke-dasharray="4 3" opacity="0.35"/>
    <circle cx="159" cy="96" r="2.5" fill="#1a1a1a" opacity="0.35"/>
    <line x1="334" y1="90" x2="288" y2="148" stroke="#1a1a1a" stroke-width="0.8" stroke-dasharray="4 3" opacity="0.35"/>
    <circle cx="334" cy="90" r="2.5" fill="#1a1a1a" opacity="0.35"/>
  </svg>
  <figcaption>The city is already producing data. The question is whether the people inside it can read that data — and act on it.</figcaption>
</figure>`;

  const illus2_REMOVED = `<figure class="essay-illus-UNUSED">
  <svg viewBox="0 0 500 190" xmlns="http://www.w3.org/2000/svg">
    <!-- Connection lines -->
    <line x1="75" y1="72" x2="178" y2="62" stroke="#e5e5e5" stroke-width="1"/>
    <line x1="75" y1="72" x2="248" y2="84" stroke="#e5e5e5" stroke-width="1"/>
    <line x1="178" y1="62" x2="248" y2="84" stroke="#e5e5e5" stroke-width="1"/>
    <line x1="248" y1="84" x2="318" y2="62" stroke="#e5e5e5" stroke-width="1"/>
    <line x1="248" y1="84" x2="418" y2="72" stroke="#e5e5e5" stroke-width="1"/>
    <line x1="318" y1="62" x2="418" y2="72" stroke="#e5e5e5" stroke-width="1"/>
    <line x1="128" y1="128" x2="248" y2="84" stroke="#e5e5e5" stroke-width="1"/>
    <line x1="368" y1="128" x2="248" y2="84" stroke="#e5e5e5" stroke-width="1"/>
    <line x1="128" y1="128" x2="75" y2="72" stroke="#e5e5e5" stroke-width="1"/>
    <line x1="368" y1="128" x2="418" y2="72" stroke="#e5e5e5" stroke-width="1"/>
    <line x1="248" y1="84" x2="75" y2="72" stroke="#f59e0b" stroke-width="1.5" opacity="0.5"/>
    <line x1="248" y1="84" x2="418" y2="72" stroke="#f59e0b" stroke-width="1.5" opacity="0.5"/>
    <!-- Helper macro: figure(cx,cy,label) — defined inline per figure -->
    <!-- BN -->
    <circle cx="75" cy="60" r="10" fill="white" stroke="#1a1a1a" stroke-width="1.5"/>
    <line x1="75" y1="70" x2="75" y2="94" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
    <line x1="75" y1="78" x2="65" y2="88" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="75" y1="78" x2="85" y2="88" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="75" y1="94" x2="69" y2="110" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="75" y1="94" x2="81" y2="110" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <text x="75" y="126" text-anchor="middle" font-size="7.5" font-family="'Source Sans 3',sans-serif" fill="#888">Brunei</text>
    <!-- KH -->
    <circle cx="178" cy="50" r="10" fill="white" stroke="#1a1a1a" stroke-width="1.5"/>
    <line x1="178" y1="60" x2="178" y2="84" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
    <line x1="178" y1="68" x2="168" y2="78" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="178" y1="68" x2="188" y2="78" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="178" y1="84" x2="172" y2="100" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="178" y1="84" x2="184" y2="100" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <text x="178" y="116" text-anchor="middle" font-size="7.5" font-family="'Source Sans 3',sans-serif" fill="#888">Cambodia</text>
    <!-- ID lower left -->
    <circle cx="128" cy="116" r="10" fill="white" stroke="#1a1a1a" stroke-width="1.5"/>
    <line x1="128" y1="126" x2="128" y2="150" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
    <line x1="128" y1="134" x2="118" y2="144" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="128" y1="134" x2="138" y2="144" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="128" y1="150" x2="122" y2="166" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="128" y1="150" x2="134" y2="166" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <text x="128" y="182" text-anchor="middle" font-size="7.5" font-family="'Source Sans 3',sans-serif" fill="#888">Indonesia</text>
    <!-- Center: ASEAN Secretariat -->
    <circle cx="248" cy="68" r="13" fill="#fef9ed" stroke="#f59e0b" stroke-width="2"/>
    <line x1="248" y1="81" x2="248" y2="108" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="248" y1="90" x2="236" y2="100" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
    <line x1="248" y1="90" x2="260" y2="100" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
    <line x1="248" y1="108" x2="241" y2="124" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
    <line x1="248" y1="108" x2="255" y2="124" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
    <text x="248" y="142" text-anchor="middle" font-size="7.5" font-family="'Source Sans 3',sans-serif" fill="#b45309" font-weight="700">Secretariat</text>
    <!-- MY -->
    <circle cx="318" cy="50" r="10" fill="white" stroke="#1a1a1a" stroke-width="1.5"/>
    <line x1="318" y1="60" x2="318" y2="84" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
    <line x1="318" y1="68" x2="308" y2="78" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="318" y1="68" x2="328" y2="78" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="318" y1="84" x2="312" y2="100" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="318" y1="84" x2="324" y2="100" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <text x="318" y="116" text-anchor="middle" font-size="7.5" font-family="'Source Sans 3',sans-serif" fill="#888">Malaysia</text>
    <!-- PH lower right -->
    <circle cx="368" cy="116" r="10" fill="white" stroke="#1a1a1a" stroke-width="1.5"/>
    <line x1="368" y1="126" x2="368" y2="150" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
    <line x1="368" y1="134" x2="358" y2="144" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="368" y1="134" x2="378" y2="144" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="368" y1="150" x2="362" y2="166" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="368" y1="150" x2="374" y2="166" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <text x="368" y="182" text-anchor="middle" font-size="7.5" font-family="'Source Sans 3',sans-serif" fill="#888">Philippines</text>
    <!-- TH+SG -->
    <circle cx="418" cy="60" r="10" fill="white" stroke="#1a1a1a" stroke-width="1.5"/>
    <line x1="418" y1="70" x2="418" y2="94" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
    <line x1="418" y1="78" x2="408" y2="88" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="418" y1="78" x2="428" y2="88" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="418" y1="94" x2="412" y2="110" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="418" y1="94" x2="424" y2="110" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
    <text x="418" y="126" text-anchor="middle" font-size="7.5" font-family="'Source Sans 3',sans-serif" fill="#888">Thailand · SG</text>
  </svg>
  <figcaption>ASCN connects ten member states through the ASEAN Secretariat. The network's value depends on what flows through those connections — not the connections themselves.</figcaption>
</figure>`;

  const essay = `
<div class="essay-header">
  <div class="essay-series-bar">
    <span class="essay-series-label">ASCN Essays</span>
    <span class="essay-series-sep">·</span>
    <span class="essay-series-num">No. 1</span>
    <span class="essay-series-date">June 2026</span>
    <span class="essay-series-time">20 min read</span>
  </div>

  <h2 class="essay-title">The Network at Seven</h2>
  <p class="essay-subtitle">What four M&amp;E cycles and thirty-eight cities reveal about Southeast Asia's most ambitious governance experiment</p>

  <details class="essay-bio">
    <summary class="essay-bio-summary">
      <img src="Photos/author-bio.jpg" alt="Non Arkaraprasertkul" class="bio-thumb" />
      <div class="bio-summary-text">
        <strong>Non Arkaraprasertkul, PhD</strong>
        <span>Senior Expert in Smart City Promotion · DEPA Thailand · ASEAN Smart Cities Network since 2019</span>
      </div>
      <span class="bio-expand-hint">About the author</span>
    </summary>
    <div class="essay-bio-body">
      <figure class="bio-photo-wrap">
        <img src="Photos/author-bio.jpg" alt="Non Arkaraprasertkul speaking at GITEX Ai Asia Singapore 2026" class="bio-photo" />
        <figcaption>GITEX Ai Asia — Main Stage, Singapore, 2026</figcaption>
      </figure>
      <div class="bio-text">
        <p>Non Arkaraprasertkul holds a doctorate in anthropology from Harvard University. His doctoral research examined urban informality and neighbourhood transformation in Bangkok and Shanghai. From 2013 to 2014 he conducted doctoral fieldwork in Shanghai — supported by the Harvard-Yenching Institute, the Fairbank Center for Chinese Studies, and the Cora Du Bois Anthropology Fellowship — where his work produced the concept of <em>gentrification from within</em> — the process by which original residents leverage rising property markets from inside a neighbourhood rather than being displaced by them — subsequently applied by researchers in twelve countries.</p>
        <p>He has worked within the ASEAN Smart Cities Network as Senior Expert in Smart City Promotion at Thailand's Digital Economy Promotion Agency (DEPA), under the Ministry of Digital Economy and Society, since 2019 — across seven annual meetings and four M&amp;E cycles. He has spoken on smart city governance at Tomorrow.City Shanghai, GITEX Ai Asia Singapore, and the Smart City Summit Taipei. This essay draws on seven years of direct participation in the network's meetings, data, and debates.</p>
        <ul class="bio-credentials">
          <li>PhD, Anthropology, Harvard University</li>
          <li>Shanghai fieldwork fellowships — Harvard-Yenching Institute · Fairbank Center for Chinese Studies · Cora Du Bois Anthropology Fellowship</li>
          <li>Senior Expert in Smart City Promotion, Digital Economy Promotion Agency (DEPA), Thailand</li>
          <li>ASEAN Smart Cities Network — DEPA Senior Expert / Thailand staff contact since 2019</li>
          <li>Seven ASCN Annual Meetings · Four M&amp;E cycles</li>
        </ul>
      </div>
    </div>
  </details>

  <p class="essay-pilot-note">Essay No. 1 on the ASCN Open Platform. Future perspectives from officials, researchers, and city practitioners across the region will follow. If you represent an ASCN member city or institution and would like to contribute, write to the platform team.</p>
</div>

<div class="essay-body">

  <div class="essay-section essay-exec-summary">
    ${h(3, "Executive Summary")}
    ${p("ASEAN is the most dynamic urban laboratory on earth. Seven hundred million people. A combined economy larger than India. Cities growing faster than their infrastructure, their governments, and sometimes their own understanding of what is happening to them. The ASEAN Smart Cities Network was supposed to help. It has not failed. It has underperformed. There is a difference.")}
    ${p("Four monitoring cycles. One hundred and thirty-four projects. Thirty-eight cities. The numbers look active. They are. But the network still counts projects, not outcomes. It still meets more than it builds. It still treats Singapore's city-state model as the regional default, even though Singapore is not a region. And it still sends officials on trips to look at things they cannot replicate at home.")}
    ${p("This essay argues three things. First, ASCN's structure is not the problem; its inertia is. The non-binding framework, the rotating chair, the Shepherd model — these are reasonable answers to a hard question. The problem is what the network does with them. Second, Singapore's role as architect and shepherd is defensible institutionally and criticizable practically. The Centre for Liveable Cities produces competent reports. Competent is not enough. Third, the future of ASCN is not more meetings. It is building things. AI agents. City operating systems. Training that produces systems, not souvenirs.")}
    ${p("Bangkok was the most visited city in the world last year. Kuching runs a flood telemetry network that actually works. Johor Bahru is moving faster than most capitals. Ipoh is proving that heritage and electronics can share the same street. We do not need to keep looking at Singapore. We need to look at each other.")}
  </div>

  <div class="essay-section">
    ${h(3, "I. The promise and the performance gap")}
    ${p("Between now and 2050, Southeast Asia will add approximately 250 million people to its cities. That is roughly the entire population of Indonesia moving into Bangkok, Kuala Lumpur, Ho Chi Minh City, and dozens of second-tier cities that are already working beyond their designed capacity. The World Bank documented this in 2019. The numbers are not new. What is new is that a regional network now exists to respond to them.")}
    ${p("The ASEAN Smart Cities Network was established in April 2018 at the 32nd ASEAN Summit in Singapore. Twenty-six cities. Ten countries. One shared framework. Seven years later the network has thirty-eight cities, has completed four monitoring and evaluation cycles, and holds an annual meeting that rotates among member states. The Shepherd role, proposed at founding and held by Singapore from 2018 to 2022 and by Indonesia since 2023, provides continuity across the rotating chair. That a coordinated smart-city framework exists across ten nations with wildly divergent political systems, four working languages, and the ASEAN principle of non-interference is not a small achievement.")}
    ${govDiagram}
    ${p("But achievement is not impact. The network produces reports. It counts projects. It records bilateral partnerships and investment figures where cities volunteer them. What it does not yet do is measure whether the people in those cities live differently because of it. That gap is not a minor administrative omission. It is the difference between a network that knows what it is doing and one that produces evidence of activity.")}
    ${p("The academic literature agrees. Costoya (2022) called it experimentalist governance without diagnostic monitoring: a structure that sets goals, runs pilots, and records outputs, but does not systematically measure whether residents of Bangkok, Phnom Penh, Mandalay, or Da Nang are better off.<sup>[7]</sup> Taeihagh, Tan, and Sivarajah (2021), conducting nineteen key-informant interviews across seven countries, found that knowledge transfer within the network remained shallow.<sup>[6]</sup> Kong and Woods (2021) named the structural mechanism: technocratic regionalism, the process by which one member's institutional assumptions get packaged as neutral methodology and distributed across the region.<sup>[8]</sup>")}
    ${p("These are serious critiques. They are also incomplete. The literature diagnoses the disease but rarely prescribes a treatment the network can actually take. It is easy to say ASCN should measure outcomes. It is harder to build the data infrastructure, the political agreement, and the capacity to do it. This essay tries to do both: name what is wrong, and point to what would make it right.")}
  </div>

  <div class="essay-section">
    ${h(3, "II. What the record actually shows")}
    ${focusDiagram}
    ${p("The four M&amp;E cycles reveal a structural pattern. Smart Mobility and Smart Living together account for more than half of all documented projects. Smart Governance, the focus area that would underpin everything else, is one of the two smallest categories. This distribution is not irrational. Mobility and living services are visible, fundable, and legible to both constituents and bilateral partners. A new transit system has a ribbon to cut. A new open-data platform for citizen feedback does not.")}
    ${p("The result is a portfolio that looks active but is structurally exposed. Technological infrastructure is being built on governance foundations that have not received proportional investment. Hollands (2008), in the paper that defined the critical smart-city literature, called this the gap between the rhetoric of technological salvation and the reality of who controls the infrastructure and who benefits from it.<sup>[12]</sup> Kitchin (2014), reviewing a decade of smart-city programmes globally, found that outcome measurement was almost universally absent from the project record.<sup>[13]</sup>")}
    ${timelineDiagram}
    ${p("The four cycles also reveal a political economy. The network grew from 77 projects in 2022 to 134 in 2025. That is a 74% expansion. But the growth was not even. Malaysia and Thailand drove the 2024–2025 surge. Vietnam's documented portfolio stayed flat at six projects every cycle. Myanmar's grew steadily from eleven to fourteen projects despite the 2021 crisis. Health &amp; Well-Being remained at 6% of the portfolio for four consecutive years, including the pandemic years.<sup>[25]</sup>")}
    ${p("These patterns do not prove the network is failing. They prove it is not neutral. Who chairs matters. Who shepherds matters. Who can report on time matters. The M&amp;E framework pretends to be a technical instrument. It is also a political one.")}
  </div>

  <div class="essay-section">
    ${h(3, "III. The Singapore question")}
    <figure class="essay-photo">
      <img src="Photos/ASCN-1st-2018-Singapore.jpg" alt="Minister Vivian Balakrishnan at the Inaugural ASCN Meeting, Singapore, 8 July 2018" loading="lazy" />
      <figcaption>Minister Vivian Balakrishnan, Singapore's Minister-in-charge of the Smart Nation Initiative, at the Inaugural ASEAN Smart Cities Network Meeting, Singapore, 8 July 2018. Singapore designed the network's architecture before handing the chair forward.</figcaption>
    </figure>
    ${p("Let me say the obvious thing first. Singapore founded ASCN. Singapore provided the first chair, the first shepherd, and the primary knowledge institution. Without Singapore, there is no ASCN. That is a fact. It is also a problem.")}
    ${p("The problem is not that Singapore helped. The problem is that Singapore cannot stop being Singapore. It is a city-state. The government owns the land. The Housing Development Board houses 80% of the population under a unified planning authority with no federal system, no competing local governments, and no electorate that votes against development plans. This model produced remarkable results. It produced them under conditions that do not exist in Bangkok, Manila, Phnom Penh, or any other ASEAN city except Singapore.")}
    ${p("And yet the Centre for Liveable Cities — Singapore's urban knowledge institution — distributes Singapore's experience as transferable knowledge. The reports are clean. The layout is professional. They make officials feel that something serious has been accomplished. The academic literature on ASCN barely cites them. Taeihagh et al. do not. Kong and Woods do not. Costoya does not. This is not because researchers missed the work. It is because CLC produces grey literature: reports that circulate within the institutional system that funds them, not through the peer-review process where findings are tested against competing evidence.")}
    ${pull("What CLC distributes is Singapore's urban development experience packaged as transferable knowledge, presented to officials in cities where the conditions that made those practices work do not exist. This is not bad faith. It is institutional logic. But institutional logic can still be wrong.")}
    ${p("Now let me address the counter-argument before it arrives. Singapore is not a villain. It is a small state with outsized competence and a rational interest in regional leadership. The Shepherd model was a genuinely clever solution to ASEAN's annual amnesia. The question is whether the network can grow beyond its founder. So far, the answer is: not enough.")}
    ${p("Consider the Taylor Swift episode. In 2024, Singapore paid grants to a concert promoter with a condition that the Eras Tour perform nowhere else in Southeast Asia. Six shows in Singapore. None in Thailand, the Philippines, Indonesia, or Malaysia. The estimated tourism return: SGD $500 million. Formal protests followed from three ASEAN partners. Singapore's Permanent Secretary for Foreign Affairs called the criticism sour grapes.<sup>[9]</sup>")}
    ${p("This is not a direct analogy to ASCN. The structural logic is identical. Resource deployment to position Singapore as the indispensable regional hub, with the outcome framed as regional benefit. You can admire the competence. You can also notice the pattern. A city-state that pays to monopolize a pop star for its own tourism revenue is not necessarily the best shepherd for a network of cities that need to solve flooding, traffic, and informal settlements.")}
    ${p("But here is the balance. Singapore is not the enemy. The enemy is our willingness to keep treating Singapore as the model because it is easier than building our own. Bangkok was the most visited city in the world last year. It did not get there by copying Singapore. Kuching runs a flood telemetry network that works in a tropical climate with limited resources. Johor Bahru is developing faster than many capitals because it sits at the crossroads of two economies. Ipoh is showing that heritage preservation and electronics manufacturing can share the same street. These are not Singapore stories. They are ASEAN stories. ASCN should tell more of them.")}
  </div>

  <div class="essay-section">
    ${h(3, "IV. A different theory of change")}
    ${p("There is another way to think about how cities improve. It does not come from Singapore. It comes from watching what residents actually do when the market changes around them.")}
    ${p("In 2013 and 2014, while embedded in a working-class neighbourhood in Shanghai on doctoral fieldwork, I documented something the displacement literature had not named: original residents who were not being pushed out by rising markets but were leveraging those markets from the inside. I called it gentrification from within.<sup>[1][2]</sup> The concept has since been applied by researchers in twelve countries. The underlying principle matters for ASCN: cities improve when the people already in them gain the capacity to read what is happening and act on that reading.")}
    ${p("The version of smart-city policy I encounter most frequently in ASEAN is backward on this principle. Technology arrives first. Sensors. Platforms. Vendor partnerships with people who are very enthusiastic about the regional opportunity. The prior questions — who has access to the data, who is authorized to act on it, what governance structure will outlast the vendor contract — are treated as implementation details.")}
    ${p("In Nakhon Si Thammarat, my team built a citizen engagement system on LINE. Not a purpose-built government platform. LINE. Forty-four million Thais use it every day. The result: forty-four thousand users within the first year, roughly 40% of the municipality's population, and approximately 10 million baht in operational cost savings. The design decision was not technical. It was the decision to meet the city where it was rather than where a procurement specification said it should be.")}
    ${pull("The prior question — who has access to the data? who is authorized to act on it? what governance structure will outlast the vendor contract? — is treated as an implementation detail. It is not a detail. It is the whole argument.")}
    ${p("Phnom Penh's population has roughly doubled in fifteen years. Da Nang went from a provincial town to a regional economic hub in a decade. These are not incremental transitions that can be managed with tools designed for incremental change. What makes a city legible to itself is the institutional infrastructure to see what is actually happening and to act on that seeing. That is what ASCN's framework is, in principle, designed to build. The M&amp;E data suggests it is not yet building it consistently.")}
  </div>

  <div class="essay-section">
    ${h(3, "V. Less meetings. More building.")}
    <figure class="essay-photo">
      <img src="Photos/ASCN-8th-2025-KL-expert-talk.jpg" alt="Expert session at the 8th ASCN Annual Meeting, Kuala Lumpur, 2025" loading="lazy" />
      <figcaption>Expert session, 8th ASCN Annual Meeting, Kuala Lumpur, September 2025. Ceremonies are easy. Building systems is hard.</figcaption>
    </figure>
    ${p("I have been part of ASCN since 2019. Seven annual meetings. Four M&amp;E cycles. Two changes of chair. One change of shepherd. I leave every annual meeting with the same thought: the people in the room understand the problems. The chief smart city officers from Nakhon Si Thammarat and Phnom Penh and Bandar Seri Begawan and Ha Noi have spent years navigating flood drainage and informal settlement formalisation under conditions that no Singapore planning document has had to account for. They know things no knowledge institution could have produced without being there.")}
    ${p("The problem is that the network does not yet have a systematic way to make that knowledge visible, portable, and actionable across the thirty-eight cities. We meet. We exchange business cards. We take photos in batik shirts. Then we go home and the knowledge stays in the room.")}
    ${p("There is a model for this, and I have built it. In Nakhon Si Thammarat, we did not write a master plan and hope someone would implement it. We built a flood-resilience operating system with the municipality during an actual flood season. We trained their staff. We left the system running. That is the model ASCN needs: not more reports, but transferable systems built by the people who will operate them.")}
    ${p("Artificial intelligence makes this more possible than ever. Not chatbots that answer tourist questions. AI agents that can read a city's permit backlog, route flood complaints to the right department, predict which drainage pumps will fail, and explain their reasoning in a language a mid-level official can act on. These are not science fiction. They are buildable now. They are cheaper than the consultants we currently fly in to tell us what we already know.")}
    ${p("Imagine an ASCN that ran AI agent workshops instead of study tours. City teams would arrive with their actual data. They would leave with working prototypes: a permit classifier for Phnom Penh, a flood-response router for Nakhon Si Thammarat, a public-transport complaint triage for Manila. The prototypes would be open-source. Other cities could adapt them. Knowledge would move as code, not as PowerPoint.")}
    ${pull("We do not need more officials traveling to developed countries to look at their smartphones all day and go shopping at outlets. That is a developing-country mindset, and it is time to leave it behind. We need officials who can build systems. For their cities.")}
    ${p("Indonesia's shepherdship has moved the network in this direction. Prayogo and Juned (2025) document the pivot from framework to bankable projects: the ASEAN Smart City Investment Toolkit, projects growing from 77 to 108, Sumedang reducing stunting from 32.2% to 7.89% through data-driven social services.<sup>[17]</sup> These are real results. They are still too rare.")}
    ${p("The ASEAN Smart City Action Plan 2026–2035, adopted in September 2025, is the network's first decade-length strategic plan. It includes rural-village collaboration as a scope category for the first time. Dili, Timor-Leste, joined in January 2026. These are structural steps. Whether they produce different project distributions than the previous seven years is the question the framework has committed to answering.")}
  </div>

  <div class="essay-section">
    ${h(3, "VI. How ASCN is read across the region")}
    ${p("There is no single regional opinion of ASCN. There are national readings, shaped by capacity, political system, and proximity to the network's centre of gravity.")}
    ${p("Indonesia, holding the Shepherd role through 2027, reads the network as a platform for regional leadership. The phrase 'from architecture to engine' appears in Indonesian scholarship and policy commentary. The ASEAN Smart City Investment Toolkit is treated as a diplomatic legacy.")}
    ${p("Singapore is read — including by its own scholars — as the architect whose institutional assumptions became the regional default. Thailand reads ASCN through its own national smart-city programme, which is larger than its ASCN portfolio and more outcome-oriented. Vietnam participates quietly: its three ASCN cities report consistently, but Vietnamese scholarship and media produce little public commentary on the network itself.")}
    ${p("Cambodia and Lao PDR emphasize external-partner support and capacity gaps. Their ASCN participation is inseparable from JICA, ADB, and bilateral assistance. Myanmar's participation continues technically, but civil-society voices oppose engagement with the junta, and the country's smart-city plans have been overtaken by crisis. Brunei has the smallest footprint. Timor-Leste's Dili joined in January 2026 — a symbolic expansion that forces the question of what 'smart city' means in a country where internet costs are sixteen times higher than Cambodia's and poverty remains above 40%.")}
    ${pull("ASCN is not one network with one reputation. It is one framework read through eleven different political economies. The project data, the scholarship, and the country statements agree on this much: the network's value depends on what each member can make of it.")}
  </div>

  <div class="essay-section">
    ${h(3, "VII. What happens next")}
    ${p("I want to end with three concrete proposals. They are not radical. They are doable.")}
    ${p("First, measure outcomes. Pick five indicators that matter to residents: commute time, flood response time, complaint resolution rate, small-business registration time, and air-quality alerts. Ask every ASCN city to report them annually. Make the data public. The network already counts projects. It should start counting whether those projects changed anything.")}
    ${p("Second, stop treating Singapore as the default model. Create city-to-city learning tracks led by cities that have solved problems other cities face. Bangkok on tourism and mobility. Kuching on flood telemetry. Johor Bahru on cross-border development. Ipoh on heritage-led regeneration. Singapore can participate. It should not lead every conversation.")}
    ${p("Third, replace one study tour with one build workshop. Pick a shared problem — flood response, permit backlogs, public-transport complaints — and have city teams build working AI-agent prototypes over five days. Open-source the results. Let the network learn by building, not by watching.")}
    ${p("The platform assembled here — four M&amp;E reports, thirty-eight cities, one hundred and thirty-four projects, made searchable and public for the first time — is the smallest possible version of what accountability looks like. It is not a demonstration of what the network has done. It is an argument, made in data, for what the network could know about itself if it decided to look.")}
    ${p("ASEAN deserves a smart-city network that matches its ambition. We have the talent. We have the problems. We have the data. What we need now is the will to build something that outlasts the next annual meeting.")}
  </div>

  <div class="essay-section essay-footnotes">
    <p class="essay-fn-label">Note on Shanghai</p>
    <p class="essay-fn">The Shanghai fieldwork (2013–2015) — supported by the Harvard-Yenching Institute, the Fairbank Center for Chinese Studies at Harvard University, the Cora Du Bois Anthropology Fellowship, a New York University Postdoctoral Global Fellowship, a Fudan Fellowship, and the China Scholarship Council (CSC) Research Fund — was a study of neighbourhood change in the lilong alleyway-house districts of central Shanghai. The concept of gentrification from within emerged from that study and provides the analytical frame for sections I–IV above. The Shanghai case itself is not the subject of this essay; it is a set of methods applied to a different set of cities. Readers interested in the original fieldwork should start with Arkaraprasertkul (2016) in Asian Anthropology or the 2018 Urban Studies paper listed below.</p>
    <p class="essay-fn-label">Note on interviews</p>
    <p class="essay-fn">The characterisations of officials, delegations, and institutions in this essay draw on the author's own conversations and interviews with leaders both inside and outside the ASEAN Smart Cities Network, gathered across seven years of direct participation. Specific quotes and observations are kept anonymous by design — to protect candour and working relationships — but each reflects real statements made by real people in real meetings and interviews. None are composite or invented.</p>
  </div>

</div>

<div class="essay-refs">
  <p class="label">Sources &amp; further reading</p>
  <div class="essay-ref-grid">
    <div class="essay-ref-item">
      <span class="essay-ref-n">[1]</span>
      <div><b>Arkaraprasertkul, N.</b> (2016). "Gentrification from within." <i>Asian Anthropology</i>, 15(1), 1–20. Original formulation of the concept; later adopted by researchers across twelve countries and cited in the SAGE Handbook of Cultural Anthropology (2021).</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[2]</span>
      <div><b>Arkaraprasertkul, N.</b> (2018). "Gentrification and its contentment." <i>Urban Studies</i>, 55(7), 1561–1578. Q1 journal (SJR 1.98). Foundational paper on gentrification from within; cited by Fulong Wu (UCL), endorsed by Alan Smart (Calgary).</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[3]</span>
      <div><b>Arkaraprasertkul, N.</b> (2019). "Gentrifying heritage." <i>International Journal of Heritage Studies</i>, 25(9), 882–896. On heritage as economic leverage for working-class residents; cited in <i>Heritage, Gentrification and Resistance in the Neoliberal City</i> (Berghahn Books, 2022).</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[4]</span>
      <div><b>Arkaraprasertkul, N.</b> (2021). "Read the market. Respect the behaviour. Choose for yourselves." <i>The ASEAN Magazine</i>, Issue 14. ASEAN Secretariat. The market-first governance argument applied to smart city adoption across ASEAN member states.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[5]</span>
      <div><b>DEPA Thailand</b> (2023). <i>Smart City Primer</i> (Article No. 33). Digital Economy Promotion Agency. Governance-first framework for smart city implementation; the policy foundation for Thailand's ASCN engagement.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[6]</span>
      <div><b>Taeihagh, A., Tan, J.S. &amp; Sivarajah, U.</b> (2021). "Smart City Policies and the Policy Transfer Process." <i>Sustainability</i>, 13(11), 6502. Nineteen key-informant interviews with ASCN participants; most rigorous empirical study of the network to date. Finds knowledge transfer remains shallow.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[7]</span>
      <div><b>Costoya, X.</b> (2022). "South-South Cooperation and the Promise of Experimentalist Governance in ASCN." <i>Politics and Governance</i>, 10(3). Source of 'experimentalist governance without diagnostic monitoring.' Identifies the output/outcome measurement gap as the network's structural blind spot.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[8]</span>
      <div><b>Kong, L. &amp; Woods, O.</b> (2021). "Scaling smartness, (de)provincialising the city? The ASEAN Smart Cities Network and the translational politics of technocratic regionalism." <i>Cities</i>, 117, 103326. Correct diagnosis of Singapore's structural position in ASCN. Empirical base is news articles and CLC brochures; M&E project data not engaged. Both authors at Singapore Management University. Conclusion ("slow, small, collaborative") does not follow from analysis with operational precision. Read alongside Taeihagh et al. (2021) for primary interview evidence.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[9]</span>
      <div><b>Singapore Tourism Board / AEG grant, 2024.</b> Thai PM Srettha Thavisin stated USD $3M/show with ASEAN exclusivity. Singapore Minister Edwin Tong confirmed grants; denied the figure. PM Lee confirmed "certain incentives." Estimated SGD $500M tourist return. Formal protests from Thailand, Philippines, Indonesia. Reuters, Bangkok Post, Bloomberg.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[10]</span>
      <div><b>ASCN M&amp;E Reports 2022–2025.</b> ASEAN Secretariat. Primary data source for all project counts, city rosters, and focus-area analysis on this platform. Full reports downloadable in the Library tab.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[11]</span>
      <div><b>World Bank</b> (2019). <i>East Asia's Changing Urban Landscape: Measuring a Decade of Spatial Growth.</i> World Bank Publications. Documents the pace and scale of Southeast Asian urbanisation; the quantitative baseline for the regional context in section I.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[12]</span>
      <div><b>Hollands, R.G.</b> (2008). "Will the real smart city please stand up?" <i>City</i>, 12(3), 303–320. Foundational critical paper on the gap between smart city rhetoric and outcome accountability. Over 3,000 citations.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[13]</span>
      <div><b>Kitchin, R.</b> (2014). "The real-time city? Big data and smart urbanism." <i>GeoJournal</i>, 79, 1–14. Shows that smart city deployment records consistently measure infrastructure deployment, not whether city residents' lives improve. Over 2,500 citations.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[14]</span>
      <div><b>Söderström, O., Paasche, T. &amp; Klauser, F.</b> (2014). "Smart cities as corporate storytelling." <i>City</i>, 18(3), 307–320. Shows that dominant smart city models are built on northern European and East Asian governance structures most receiving cities cannot replicate; distributing them without adaptation produces technology infrastructure that outlasts its institutional context.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[15]</span>
      <div><b>Acharya, A.</b> (2014). <i>Constructing a Security Community in Southeast Asia: ASEAN and the Problem of Regional Order.</i> 3rd ed. Routledge. Definitive scholarly account of ASEAN's non-interference norm: the foundational constraint that makes ASEAN function as a regional body and simultaneously limits what the region can demand of its members.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[16]</span>
      <div><b>Crumpton, C.D., Wongthanavasu, S., Kamnuansilpa, P., Draper, J. &amp; Bialobrzeski, E.</b> (2021). "Assessing the ASEAN Smart Cities Network (ASCN) via the Quintuple Helix Innovation Framework." <i>International Journal of Urban Sustainable Development</i>, 13(1), 97–116. Applies the Quintuple Helix framework (academia–government–industry–civil society–environment) to ASCN. Finds authoritarian governance tendencies among member states structurally undermine participatory smart city outcomes. Arrives at similar conclusions to Kong &amp; Woods by a different theoretical route — which confirms the diagnosis without advancing the prescription.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[17]</span>
      <div><b>Prayogo, A.N. &amp; Juned, M.</b> (2025). "Indonesia's Smart City Diplomacy Through ASEAN Smart Cities Network Shepherdship (2023–2025)." <i>Journal of Social and Political Sciences</i>, 8(3), 39–47. Introduces smart city diplomacy as a middle-power foreign policy concept. Documents Indonesia's pivot from framework to implementation: ASEAN Smart City Investment Toolkit delivered, four pilot cities deployed (Jakarta, Makassar, Banyuwangi, Sumedang), projects grew 77→108. Sumedang's stunting-rate reduction (32.2%→7.89%) via data-driven social services is the network's clearest human-development proof-of-concept.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[18]</span>
      <div><b>Kanaev, E.A. &amp; Fedorenko, D.O.</b> (2023). "Whither ASEAN Smart Cities Network? Evidence from Singapore and Its Energy Policy." <i>Yugo-Vostochnaya Aziya: aktual'nyye problemy razvitiya</i>, 4(3), 191–201. Analyses ASCN through Singapore's energy policy dimension (Grid Digital Twin, IoT, renewable transition). Key finding: smart city development is trivially achievable for Singapore; it represents a genuine developmental challenge for Cambodia, Laos, and Myanmar. Intra-ASEAN digital gaps are severe; only Myanmar and Thailand have energy-related ASCN projects. Recommends Singapore maintain a 'low profile' to avoid amplifying structural inequality.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[19]</span>
      <div><b>Lim, C.C.</b> (2024). "Smart Cities and Sustainable Urbanisation in ASEAN." Plenary presentation, 6th ASEAN–Japan Smart Cities Network High-Level Meeting, Tokyo, 29 October 2024. ASEAN Secretariat director's official overview at year six. 108 projects as of September 2024 across 31 cities, with Civic &amp; Social (27%) and Built Infrastructure (26%) accounting for over half the portfolio while Health &amp; Well-being accounts for just 6%. ASEAN Smart City Financing Toolkit launched 2024. ASUS Phase II commenced. Primary official source for post-2022 network data.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[20]</span>
      <div><b>ASEAN Secretariat</b> (2018). <i>ASCN Smart City Action Plans (Consolidated)</i>. Singapore: ASEAN Singapore 2018 (as of 8 July 2018). Consolidated SCAPs for all 26 original pilot cities: Vision, Focus Areas, Strategic Targets, Priority Projects for each. Primary evidence that 'smart city' meant different things to different cities from day one — from Bandar Seri Begawan's heritage revitalisation to Battambang's sewage infrastructure and informal settlement formalisation. The gap between what the SCAP framework asked for and what member cities could realistically deliver is visible in every page.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[21]</span>
      <div><b>Singapore Ministry of Foreign Affairs</b> (2018). "ASEAN Smart Cities Network (ASCN)." Internal briefing presentation. Singapore. Defines the founding vision: core objective 'improving peoples' lives, using technology as an enabler'; NR and CSCO governance structure; the Twinning Programme with 15 external partners. Documents ASCN's 'broad and inclusive' definition of smart = digital adoption + sustainability and liveability. Key source for understanding Singapore's institutional design choices at founding and the diplomatic logic of the Shepherd model.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[22]</span>
      <div><b>Putra, B.A.</b> (2026). "Human Rights and the ASEAN Smart Cities Network: Covering Unaddressed Civic and Social Concerns." <i>F1000Research</i>, 14:733. doi:10.12688/f1000research.167098.3. Open peer review; reviewers from Tampere, Danang, Sydney, and Kerala. Most comprehensive human rights analysis of ASCN. Identifies surveillance risk in authoritarian/semi-authoritarian member states (Cambodia rank 121, Vietnam 136, Laos 159, Myanmar 166 — Democracy Index 2023) and external-funder dependency as two structural concerns. Recommends ASCN acknowledge vulnerability of underprivileged populations and strengthen bottom-up grassroots digital initiatives.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[23]</span>
      <div><b>Martinus, M.</b> (2020). "ASEAN Smart Cities Network: A Catalyst for Partnerships." <i>ISEAS–Yusof Ishak Institute Perspective</i>, 2020(32). Lead researcher at the ASEAN Studies Centre, ISEAS. First systematic mapping of ASCN partnerships (20 documented, 2018–2019). Identifies the network's structural innovation: city-level operation that 'defies the so-called ASEAN top-down approach by embracing regionalism while allowing local government autonomy and participation.' Industry &amp; innovation and safety &amp; security attracted most external partner interest. Huawei appears in Phuket, Davao, and Singapore partnerships.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[24]</span>
      <div><b>ASEAN Secretariat</b> (2025). <i>ASEAN Smart City Action Plan (ASCAP) 2026–2035</i>. Adopted September 2025, 8th Annual ASCN Meeting, Malaysia. First decade-length strategic plan. Eight pillars: Digital Transformation &amp; Smart Infrastructure; Sustainable &amp; Green Urban Development; Smart Housing &amp; Health; Smart Mobility; Resilience &amp; Disaster Preparedness; Digital Governance; Innovation &amp; Economic Growth; Rural–Village Collaboration (new scope). Aligned with ASEAN Community Vision 2045 and ASEAN Connectivity Strategic Plan 2026–2035. Dili (Timor-Leste) joined as 38th city and 11th member state, January 2026.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[25]</span>
      <div><b>ASCN M&amp;E Reports 2022–2025</b> (appendix analysis). Network grew from 77 to 134 projects (+74%). Malaysia and Thailand accounted for most 2024–2025 growth. Vietnam remained flat at six projects per cycle. Myanmar grew from 11 to 14 projects despite the February 2021 coup. Health &amp; Well-Being stayed at 6% of the portfolio across all four cycles. See the Insights tab for interactive country and focus-area trajectories.</div>
    </div>
    <div class="essay-ref-item">
      <span class="essay-ref-n">[26]</span>
      <div><b>Mastercard Global Destination Cities Index / Euromonitor</b> (2024). Bangkok ranked as the most visited city in the world by international arrivals in 2024, ahead of Paris, London, and Singapore. The point is not that Bangkok is smarter than Singapore. The point is that Bangkok has solved problems at scale that ASCN should study on equal terms.</div>
    </div>
</div>
</div>

<details class="author-block">
  <summary class="author-summary">
    <span class="author-summary-label">About the author</span>
    <span class="author-summary-name">Non Arkaraprasertkul, PhD</span>
    <span class="author-summary-role">Architect · Urban Anthropologist · Senior Expert, DEPA Thailand · National Representative, ASCN</span>
    <span class="author-toggle-icon" aria-hidden="true"></span>
  </summary>

  <div class="author-body">
    <p class="author-intro">Unlike most smart city practitioners who lead with technology procurement, Dr. Non approaches urban development through governance frameworks, human-centric urbanism, and regional standardization — grounded in two years of immersive ethnographic fieldwork in Shanghai and a decade of policy practice in Thailand and ASEAN.</p>

    <div class="author-section">
      <p class="author-section-label">ASCN — Regional Work</p>
      <ul class="author-list">
        <li><b>Architect of the ASEAN CSCO Handbook</b> — Strategic Advisor and Handbook Architect for <i>The Citizen-First City</i>, the standardized manual for Chief Smart City Officers across all ASEAN member states.</li>
        <li><b>Thailand's National Representative</b> — Primary liaison between Thailand's domestic smart city programme and the ASEAN Secretariat, named in official ASCN contact lists from 2024 through 2026.</li>
        <li><b>Regional Capacity Building</b> — Delivers country presentations at the UNCRD (United Nations Centre for Regional Development) International Training Workshop on Smart Cities; helps standardize training across Asia.</li>
        <li><b>Soft Power Research</b> — Authored papers framing ASCN as a tool for effective soft power, arguing that the network allows ASEAN cities to export models of sustainable urbanism beyond the region.</li>
      </ul>
    </div>

    <div class="author-section">
      <p class="author-section-label">DEPA Thailand — Domestic Work</p>
      <ul class="author-list">
        <li><b>Provincial Frameworks</b> — Lead consultant for smart city master plans in Nonthaburi ("Next Nont"), Nakhon Si Thammarat (disaster-resilience interaction framework), and Rayong (Ban Chang municipality).</li>
        <li><b>Chief Smart City Officer Program</b> — Designed and leads DEPA's CSCO training course, building the dedicated "CTOs" of Thai cities from mid- and senior-level officials.</li>
        <li><b>Smart City Leadership Curriculum</b> — Primary instructor for DEPA's leadership programme using Design Thinking for urban environments; trained 5,000+ officials across Thailand.</li>
        <li><b>Four-Pillar Framework</b> — Author of DEPA's foundational evaluation rubric for assessing and supporting smart city projects nationwide.</li>
      </ul>
    </div>

    <div class="author-section">
      <p class="author-section-label">Publications</p>
      <ul class="author-list">
        <li><b>The Smart City Primer (2022)</b> — Co-authored with Reilly Paul Rabitaille; released with C-ASEAN and the U.S. Embassy Bangkok; educational baseline from the YSEALI programme for young leaders across Southeast Asia.</li>
        <li><b>Guide to Building Smart Cities for People in a Hurry (2023)</b> — Practical guide for rapid, citizen-centric smart city implementation.</li>
        <li><b>Academic portfolio</b> — 469 Google Scholar citations. h-index 12 (above architecture full-professor mean of 9). 48.8% of lifetime citations accrued since 2021 — citation velocity doubled after the practitioner pivot, not despite it. 'Gentrification from within' adopted in 12+ countries across 4 continents, cited in the SAGE Handbook of Cultural Anthropology and Routledge Handbook of Planning Theory. The practitioner work — 5,000+ officials trained, 27→100+ cities scaled — generates zero Google Scholar citations and 100% of the policy impact.</li>
      </ul>
    </div>

    <div class="author-section">
      <p class="author-section-label">Axiom SLIC</p>
      <p class="author-note">Co-founder of Axiom SLIC, a private-sector initiative building what governments plan but cannot execute. Frameworks developed there — including flood-resilience work in Nakhon Si Thammarat — are grounded in actual climate crises rather than theoretical models.</p>
    </div>
  </div>
</details>

<div class="essay-next-section">
  <p class="label">Contributing Essays</p>
  <h3 class="essay-next-h">More perspectives from across the network</h3>
  <p class="essay-next-lede">This platform invites essays from city officials, researchers, planners, and practitioners working within or alongside the ASEAN Smart Cities Network. The goal is a record of what people actually think about how cities in this region are changing — not a curated institutional narrative, but a collection of real perspectives from people doing the work.</p>
  <div class="essay-next-grid">
    <div class="essay-next-card essay-next-placeholder">
      <p class="essay-next-tag">Perspective · Forthcoming</p>
      <p class="essay-next-title">The view from a CSCO</p>
      <p class="essay-next-body">What does it actually feel like to be a Chief Smart City Officer in a mid-sized ASEAN city? What do the M&amp;E reports miss that you see every day?</p>
    </div>
    <div class="essay-next-card essay-next-placeholder">
      <p class="essay-next-tag">Analysis · Forthcoming</p>
      <p class="essay-next-title">Smart Mobility in Southeast Asia</p>
      <p class="essay-next-body">Mobility accounts for more than a quarter of all ASCN projects. What is actually being built, and for whom?</p>
    </div>
    <div class="essay-next-card essay-next-placeholder">
      <p class="essay-next-tag">Research · Forthcoming</p>
      <p class="essay-next-title">Measuring what matters</p>
      <p class="essay-next-body">The gap between output reporting and outcome measurement is the central challenge of the M&amp;E framework. How do other regional networks handle it?</p>
    </div>
  </div>
  <p class="essay-next-cta">To propose an essay, contact <a href="mailto:nonsmartcity@gmail.com">the platform team</a>.</p>
</div>`;

  $("#essay-content").innerHTML = essay;
}

/* ---------------- REMOVED: Integrity tab (2026-06-21) ---------------- */
function renderIntegrity_UNUSED() {
  const CLAIMS = [
    {
      org: "Smart Cities Network Ltd",
      person: "KC Tay (Kok Chin Tay)",
      type: "name",
      typeLabel: "Name confusion",
      claim: "Organization named “Smart Cities Network” — presents KC Tay as authority on ASEAN smart city matters; website smartcitiesnetwork.net uses the core ASCN name",
      record: "Private Singapore company (UEN 201827719R), incorporated 108 days after ASCN was established at the 32nd ASEAN Summit. No ASEAN affiliation. No disclaimer on website. A 2022 peer-reviewed paper in Politics & Governance used SCN’s name as a keyword when discussing the official ASCN.",
      verdict: "false",
      verdictLabel: "Name-jacking",
    },
    {
      org: "Smart Cities Network / Philippine DOST & PNA",
      person: "KC Tay (Kok Chin Tay)",
      type: "title",
      typeLabel: "Title fraud",
      claim: "“Dr. Kok Chin Tay” — used in official Philippine Dept of Science and Technology (DOST) publications and Philippine News Agency (government wire service)",
      record: "No PhD found in any database. Highest verified degree: MSc Computer Science, self-stated, City University London. KC Tay’s own biographies list only an MSc. Uncorrected in official Philippine government publications for years.",
      verdict: "false",
      verdictLabel: "False",
    },
    {
      org: "National University of Management (NUM), Cambodia",
      person: "KC Tay (Kok Chin Tay)",
      type: "title",
      typeLabel: "Title inflation",
      claim: "“Professor Kok Chin (KC) Tay” — listed as faculty on NUM Digital Economy page and MSc in Digital Economy prospectus; teaching Smart City System and Management",
      record: "An MSc degree does not qualify for professorship in any academic system worldwide. Two conference/journal papers over seven years is insufficient for professorial appointment. Title uncorrected in official university listings.",
      verdict: "misleading",
      verdictLabel: "Inflated",
    },
    {
      org: "JICA (Japan International Cooperation Agency), 2025 report",
      person: "KC Tay (Kok Chin Tay)",
      type: "title",
      typeLabel: "Title inflation",
      claim: "“Adjunct Professor at National University of Singapore (NUS)” — published in official JICA development report",
      record: "KC Tay’s own biographies consistently list “Adjunct Lecturer” at NUS SCALE (not Professor). NUS faculty directories, SCALE unit-heads page, and BCA Academy trainer directory show no listing. Two-rank upgrade in an official Japanese government agency report; uncorrected.",
      verdict: "misleading",
      verdictLabel: "Inflated",
    },
    {
      org: "Smart Cities Council Inc (SCC)",
      person: "Corey Gray",
      type: "org",
      typeLabel: "Org identity",
      claim: "“Social Impact Organisation” headquartered in Washington, DC — “world’s largest and longest-running” smart cities membership organization",
      record: "For-profit Virginia corporation, EIN 38-3981098. No 501(c)(3) or any tax-exempt status anywhere. Registered address: 1900 Campus Commons Drive, Suite 100, Reston, VA 20191 — 20 miles from DC. Founded 2012; predated by ICLEI (1990), C40 (2005). No board of directors. No audited financials.",
      verdict: "false",
      verdictLabel: "Misleading",
    },
    {
      org: "Smart Cities Council Inc (SCC)",
      person: "Corey Gray",
      type: "credential",
      typeLabel: "Credential",
      claim: "“Took LVX Global public in 2020” and “exiting in 2023” — presented as a successful founder who listed and exited a public company",
      record: "LVX Global never listed on any exchange. June 2020 was a private pre-IPO raise at 1.1c/share to wholesale investors. LVX entered voluntary administration 27 March 2024. Bombora Investment Management bought it back for $7M — a 62% writedown from ~$13M exposure. Bombora’s own investor report stated the business is “free from previous management / equity holders.” That is not an exit; it is an expulsion.",
      verdict: "false",
      verdictLabel: "False",
    },
    {
      org: "Smart Cities Council Inc (SCC)",
      person: "Corey Gray",
      type: "credential",
      typeLabel: "Credential",
      claim: "“14 international film awards” won at “Berlina Film Festival 2024” (Teddie award)",
      record: "~8 wins independently verified (IMDb: 8 wins & 8 nominations). The festival is the Berlinale, not “Berlina.” The award is the Teddy, not “Teddie.” The wins were in 2023, not 2024. Four factual errors in one sentence. The film (Marungka tjalatjunu) did win the Silver Bear and Teddy at Berlinale 2023 — an achievement genuine enough not to need embellishment.",
      verdict: "misleading",
      verdictLabel: "Inflated",
    },
  ];

  let query = "", typeFilter = "all";

  function filteredRows() {
    return CLAIMS.filter((c) => {
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return [c.org, c.person, c.claim, c.record, c.verdictLabel, c.typeLabel].some((v) => v.toLowerCase().includes(q));
    });
  }

  function renderRows() {
    const tbody = $("#integrity-tbody");
    if (!tbody) return;
    const rows = filteredRows();
    tbody.innerHTML = rows.length
      ? rows.map((c) => `
          <tr>
            <td><span class="int-org">${esc(c.org)}</span></td>
            <td class="int-person">${esc(c.person)}</td>
            <td><span class="int-type-badge int-type-${esc(c.type)}">${esc(c.typeLabel)}</span></td>
            <td class="int-claim">${esc(c.claim)}</td>
            <td class="int-record">${esc(c.record)}</td>
            <td><span class="int-verdict int-verdict-${esc(c.verdict)}">${esc(c.verdictLabel)}</span></td>
          </tr>`).join("")
      : `<tr><td colspan="6" class="int-empty">No entries match.</td></tr>`;
    const countEl = $("#integrity-count");
    if (countEl) countEl.textContent = `${rows.length} of ${CLAIMS.length} entries`;
  }

  const typeOptions = [
    { v: "all", l: "All" },
    { v: "name", l: "Name confusion" },
    { v: "title", l: "Title fraud" },
    { v: "org", l: "Org identity" },
    { v: "credential", l: "Credential" },
  ];

  const el = $("#integrity-content");
  if (!el) return;
  el.innerHTML = `
    <div class="section-head">
      <p class="label">Integrity log</p>
      <h2>Organizations and individuals making unverified ASCN affiliation claims</h2>
      <p class="lede">An evidence-based record of verified misrepresentations by organizations using ASCN-adjacent names or claiming affiliation with this network. Sourced from corporate filings, government records, securities disclosures, and primary-source journalism. Last updated June 2026.</p>
    </div>
    <div class="int-controls">
      <input class="int-search" id="int-search" type="search" placeholder="Search organizations, people, claims…" aria-label="Search integrity log" />
      <div class="int-chips" role="group" aria-label="Filter by type">
        ${typeOptions.map((o) => `<button class="int-chip${o.v === "all" ? " active" : ""}" data-type="${esc(o.v)}" type="button">${esc(o.l)}</button>`).join("")}
      </div>
      <span class="int-count muted" id="integrity-count">${CLAIMS.length} of ${CLAIMS.length} entries</span>
    </div>
    <div class="table-wrap int-table-wrap">
      <table class="int-table">
        <thead>
          <tr>
            <th>Organization</th>
            <th>Person</th>
            <th>Type</th>
            <th>Claim made</th>
            <th>Documented record</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody id="integrity-tbody"></tbody>
      </table>
    </div>
    <div class="int-source-note">
      <p class="label">Sources &amp; methodology</p>
      <p>Smart Cities Council investigation: 250+ searches across IRS filings (EIN 38-3981098), ASX disclosures, ASIC records, ABN Lookup, corporate directories, and investigative journalism (OCCRP). Smart Cities Network investigation: Singapore ACRA records (UEN 201827719R), Philippine DOST and PNA official publications, JICA reports, NUM Cambodia faculty pages, Google Scholar, IEEE Xplore, and event archives. Multi-agent parallel investigation across 12 dimensions, June 2026.</p>
      <p class="int-disclaimer">This record is based on publicly available information as of June 2026. Entities listed are invited to provide corrections with supporting documentation to the ASCN Open Platform maintainers. The presence of an entry reflects documented misrepresentation, not a finding of criminal conduct.</p>
    </div>`;

  renderRows();

  const searchEl = $("#int-search");
  if (searchEl) {
    searchEl.addEventListener("input", (e) => { query = e.target.value.trim(); renderRows(); });
  }
  $$(".int-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      typeFilter = btn.dataset.type;
      $$(".int-chip").forEach((b) => b.classList.toggle("active", b === btn));
      renderRows();
    });
  });
}

async function init() {
  try {
    const [data, K, cities, library, libraryFull, cityStats] = await Promise.all([
      loadJson("data/ascn-v2-data.json"),
      loadJson("data/ascn-knowledge.json"),
      loadJson("data/ascn-cities.json"),
      loadJson("data/ascn-library.json"),
      loadJson("data/ascn-library-full.json").catch(() => null),
      loadJson("data/city-stats-merged.json").catch(() => []),
    ]);
    state.data = data; state.K = K; state.C = cities.cities; state.L = library; state.LF = libraryFull; state.CS = Array.isArray(cityStats) ? cityStats : [];
    wireNav();
    setTab((location.hash || "#overview").slice(1), false);
  } catch (err) {
    console.error(err);
    const el = $("#evidence-status");
    if (el) el.textContent = err.message;
  }
}

init();
