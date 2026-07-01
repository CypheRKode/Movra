const STORAGE_KEY = "gogetBusinessTracker.v2";

const defaultState = {
  settings: {
    targetMin: 3000,
    targetComfort: 4000,
    monthlyCommitment: 2000,
    workDays: 26,
    fuelPrice: 2.05,
    kmPerLiter: 40,
    maintenancePerKm: 0.08,
    mealBudget: 12
  },
  shifts: {}
};

const $ = (id) => document.getElementById(id);
const money = (n) => `RM${Number(n || 0).toFixed(2)}`;
const todayKey = () => new Date().toISOString().slice(0,10);
const nowTime = () => new Date().toTimeString().slice(0,5);
let deferredPrompt;

function clone(obj){ return JSON.parse(JSON.stringify(obj)); }
function loadState(){
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(parsed) return { ...clone(defaultState), ...parsed, settings:{...defaultState.settings, ...(parsed.settings || {})}};
  } catch {}
  return clone(defaultState);
}
let state = loadState();
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function getTodayShift(){
  const key = todayKey();
  if(!state.shifts[key]){
    state.shifts[key] = {
      date:key,
      startedAt:null,
      endedAt:null,
      odoStart:"",
      odoEnd:"",
      jobs:[],
      expenses:[]
    };
    saveState();
  }
  return state.shifts[key];
}
function num(id){ return Number($(id).value || 0); }

function clamp(n,min=0,max=100){ return Math.max(min, Math.min(max, Number(n || 0))); }

function scoreLabel(score){
  if(score >= 85) return {label:"Padu", advice:"Job/shift ni cantik. Banyak macam ni, income bulanan boleh jadi sedap."};
  if(score >= 70) return {label:"Okay", advice:"Masih berbaloi. Boleh teruskan tapi tengok masa & kilometer."};
  if(score >= 50) return {label:"Biasa", advice:"Boleh ambil kalau route ngam, tapi jangan penuhkan hari dengan job macam ni."};
  if(score >= 30) return {label:"Lemah", advice:"Fare nampak kurang berbaloi berbanding masa atau kilometer."};
  return {label:"Bocor", advice:"Ini jenis job makan minyak/masa. Kena tapis kalau banyak sangat."};
}

function getColor(score){
  if(score >= 70) return "#16a34a";
  if(score >= 50) return "#f59e0b";
  return "#ef4444";
}

function calcJobScore(job){
  const gross = Number(job.fare || 0) + Number(job.tip || 0);
  const km = Number(job.km || 0);
  const min = Number(job.minutes || 0);
  const rmKm = km > 0 ? gross / km : 0;
  const rmHour = min > 0 ? gross / (min / 60) : 0;

  // Practical dispatch scoring:
  // RM/km target: RM1.50+ is strong.
  // RM/hour target: RM25+ is strong.
  const scoreKm = km ? clamp((rmKm / 1.5) * 100) : 45;
  const scoreHour = min ? clamp((rmHour / 25) * 100) : 45;
  const scoreFare = clamp((gross / 15) * 100);

  const score = Math.round((scoreKm * 0.42) + (scoreHour * 0.42) + (scoreFare * 0.16));
  return {score, gross, km, min, rmKm, rmHour, ...scoreLabel(score)};
}

function calcShift(shift){
  const gross = shift.jobs.reduce((sum,j) => sum + Number(j.fare || 0) + Number(j.tip || 0), 0);
  const jobKm = shift.jobs.reduce((sum,j) => sum + Number(j.km || 0), 0);
  const odometerKm = Number(shift.odoEnd || 0) > Number(shift.odoStart || 0)
    ? Number(shift.odoEnd) - Number(shift.odoStart)
    : 0;
  const km = odometerKm || jobKm;

  const directExpenses = shift.expenses.reduce((sum,e) => sum + Number(e.amount || 0), 0);
  const estimatedFuel = km && state.settings.kmPerLiter
    ? (km / state.settings.kmPerLiter) * state.settings.fuelPrice
    : 0;
  const estimatedMaintenance = km * state.settings.maintenancePerKm;
  const totalCost = directExpenses + estimatedFuel + estimatedMaintenance;
  const net = gross - totalCost;
  const totalMinutes = shift.jobs.reduce((sum,j) => sum + Number(j.minutes || 0), 0);

  let shiftHours = totalMinutes / 60;
  if(shift.startedAt && shift.endedAt){
    const start = new Date(`${shift.date}T${shift.startedAt}:00`);
    const end = new Date(`${shift.date}T${shift.endedAt}:00`);
    if(end > start) shiftHours = (end - start) / 36e5;
  }

  const dailyMin = state.settings.workDays ? state.settings.targetMin / state.settings.workDays : 0;
  const dailyComfort = state.settings.workDays ? state.settings.targetComfort / state.settings.workDays : 0;
  const targetBase = dailyComfort || dailyMin || 1;

  const rmPerHour = shiftHours ? net / shiftHours : 0;
  const costPerKm = km ? totalCost / km : 0;
  const avgJobScore = shift.jobs.length
    ? shift.jobs.reduce((sum,j) => sum + calcJobScore(j).score, 0) / shift.jobs.length
    : 0;

  // Daily score = net target achievement + hourly quality + job quality + cost control.
  const targetScore = clamp((net / targetBase) * 100);
  const hourScore = rmPerHour ? clamp((rmPerHour / 25) * 100) : 0;
  const costScore = km ? clamp(100 - (costPerKm / 0.65) * 100) : 55;
  const dailyScore = shift.jobs.length
    ? Math.round(targetScore * 0.48 + hourScore * 0.22 + avgJobScore * 0.20 + costScore * 0.10)
    : 0;

  return {
    gross, jobKm, odometerKm, km, directExpenses, estimatedFuel,
    estimatedMaintenance, totalCost, net, totalMinutes, shiftHours,
    jobsCount: shift.jobs.length,
    rmPerHour,
    rmPerJob: shift.jobs.length ? net / shift.jobs.length : 0,
    costPerKm,
    dailyMin,
    dailyComfort,
    dailyCommit: state.settings.workDays ? state.settings.monthlyCommitment / state.settings.workDays : 0,
    dailyScore: clamp(dailyScore)
  };
}

function loadSettingsToForm(){
  Object.entries(state.settings).forEach(([k,v]) => { if($(k)) $(k).value = v; });
}
function saveSettingsFromForm(){
  Object.keys(state.settings).forEach(k => { if($(k)) state.settings[k] = Number($(k).value || 0); });
  saveState();
  render();
}

function render(){
  const shift = getTodayShift();
  const calc = calcShift(shift);
  const d = new Date();

  $("todayLabel").textContent = d.toLocaleDateString("ms-MY", {weekday:"long", day:"numeric", month:"long", year:"numeric"});
  $("odoStart").value = shift.odoStart || "";
  $("odoEnd").value = shift.odoEnd || "";
  $("shiftStatus").textContent = shift.startedAt
    ? (shift.endedAt ? `Shift tamat ${shift.endedAt}` : `Shift aktif ${shift.startedAt}`)
    : "Shift belum mula";

  $("liveSummary").innerHTML = `
    <div><span>Gross</span><strong>${money(calc.gross)}</strong></div>
    <div><span>Cost</span><strong>${money(calc.totalCost)}</strong></div>
    <div><span>Net</span><strong>${money(calc.net)}</strong></div>
  `;

  renderDailyMeter(calc);
  renderStats(calc);
  renderTargets(calc);
  renderJobs(shift);
  renderExpenses(shift);
  updateJobPreview();
}

function renderDailyMeter(calc){
  const info = calc.jobsCount ? scoreLabel(calc.dailyScore) : {label:"Belum cukup data", advice:"Start shift dan masukkan job pertama."};
  $("dailyScore").textContent = Math.round(calc.dailyScore);
  $("dailyLabel").textContent = calc.jobsCount ? `Hari ini: ${info.label}` : info.label;
  $("dailyAdvice").textContent = calc.jobsCount ? info.advice : "Start shift dan masukkan job pertama.";
  $("dailyMeterBar").style.width = `${calc.dailyScore}%`;
  const deg = Math.round(calc.dailyScore * 3.6);
  $(".meter-score");
  document.querySelector(".meter-score").style.background =
    `radial-gradient(circle at center,#fff 0 52%,transparent 53%), conic-gradient(${getColor(calc.dailyScore)} ${deg}deg,#e2e8f0 ${deg}deg)`;
}

function renderStats(calc){
  const stats = [
    ["Gross Fare", money(calc.gross)],
    ["Total Cost", money(calc.totalCost)],
    ["Untung Bersih", money(calc.net)],
    ["Jumlah Job", calc.jobsCount],
    ["Total KM", `${calc.km.toFixed(1)} km`],
    ["RM / Hour", money(calc.rmPerHour)],
    ["RM / Job", money(calc.rmPerJob)],
    ["Cost / KM", money(calc.costPerKm)],
    ["Fuel Auto", money(calc.estimatedFuel)],
    ["Maintenance", money(calc.estimatedMaintenance)],
    ["Expenses Manual", money(calc.directExpenses)],
    ["Masa Job", `${Math.round(calc.totalMinutes)} min`]
  ];
  $("statsGrid").innerHTML = stats.map(([label,value]) => `
    <div class="stat"><span>${label}</span><strong>${value}</strong></div>
  `).join("");
}

function renderTargets(calc){
  const rows = [
    ["Target Minimum", calc.dailyMin, calc.net, "Untuk capai RM3k/bulan"],
    ["Target Selesa", calc.dailyComfort, calc.net, "Untuk capai RM4k/bulan"],
    ["Komitmen Wajib", calc.dailyCommit, calc.net, "Untuk cover komitmen RM2k/bulan"]
  ];

  $("targetProgress").innerHTML = rows.map(([label,target,actual,note]) => {
    const pct = target ? clamp((actual / target) * 100) : 0;
    const gap = actual - target;
    return `
      <div class="target-row">
        <strong>${label}: ${money(target)} / hari</strong>
        <small>${note} · Hari ini ${money(actual)} · ${gap >= 0 ? "Lebih" : "Short"} ${money(Math.abs(gap))}</small>
        <div class="meter"><div style="width:${pct}%"></div></div>
      </div>
    `;
  }).join("");
}

function renderJobs(shift){
  if(!shift.jobs.length){
    $("jobList").innerHTML = `<div class="item empty">Belum ada job hari ini. Satu job pun kena track, baru nampak perangai duit.</div>`;
    return;
  }
  $("jobList").innerHTML = shift.jobs.map((j,idx) => {
    const q = calcJobScore(j);
    return `
      <div class="item">
        <div class="item-main">
          <div>
            <div class="item-title">${escapeHtml(j.time || "-")} · ${escapeHtml(j.pickup || "Pickup")} → ${escapeHtml(j.dropoff || "Drop")}</div>
            <span class="item-sub">${q.km.toFixed(1)} km · ${q.min || 0} min · ${money(q.rmKm)}/km · ${money(q.rmHour)}/hour</span>
            ${j.notes ? `<span class="item-sub">${escapeHtml(j.notes)}</span>` : ""}
          </div>
          <div class="item-money">${money(q.gross)}</div>
        </div>
        <div class="item-meter">
          <div class="meter-line"><span>Job Meter: ${q.label}</span><span>${q.score}/100</span></div>
          <div class="meter"><div style="width:${q.score}%"></div></div>
        </div>
        <div class="item-actions"><button class="delete-btn" onclick="deleteJob(${idx})">Delete</button></div>
      </div>
    `;
  }).join("");
}

function renderExpenses(shift){
  if(!shift.expenses.length){
    $("expenseList").innerHTML = `<div class="item empty">Belum ada expenses manual. Auto estimate minyak & maintenance tetap dikira ikut KM.</div>`;
    return;
  }
  $("expenseList").innerHTML = shift.expenses.map((e,idx) => `
    <div class="item">
      <div class="item-main">
        <div>
          <div class="item-title">${escapeHtml(e.category)}</div>
          ${e.notes ? `<span class="item-sub">${escapeHtml(e.notes)}</span>` : ""}
        </div>
        <div class="item-money">${money(e.amount)}</div>
      </div>
      <div class="item-actions"><button class="delete-btn" onclick="deleteExpense(${idx})">Delete</button></div>
    </div>
  `).join("");
}

function updateJobPreview(){
  const job = {
    fare: num("fare"),
    tip: num("tip"),
    km: num("jobKm"),
    minutes: num("jobMinutes")
  };
  const q = calcJobScore(job);
  const hasData = job.fare || job.tip || job.km || job.minutes;
  $("jobPreview").innerHTML = `
    <div class="meter-head">
      <strong>${hasData ? `Preview: ${q.label}` : "Preview Job Meter"}</strong>
      <span>${hasData ? `${q.score}/100` : "Isi fare, KM & minit"}</span>
    </div>
    <div class="meter"><div style="width:${hasData ? q.score : 0}%"></div></div>
    <p>${hasData ? `${money(q.rmKm)}/km · ${money(q.rmHour)}/hour. ${q.advice}` : "Meter ni bantu tengok job tu padu, biasa atau makan minyak/masa."}</p>
  `;
}

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

window.deleteJob = (idx) => {
  const shift = getTodayShift();
  shift.jobs.splice(idx,1);
  saveState();
  render();
};
window.deleteExpense = (idx) => {
  const shift = getTodayShift();
  shift.expenses.splice(idx,1);
  saveState();
  render();
};

$("startShiftBtn").addEventListener("click", () => {
  const shift = getTodayShift();
  shift.startedAt = shift.startedAt || nowTime();
  shift.endedAt = null;
  shift.odoStart = $("odoStart").value || shift.odoStart || "";
  saveState();
  render();
});

$("endShiftBtn").addEventListener("click", () => {
  const shift = getTodayShift();
  shift.endedAt = nowTime();
  shift.odoStart = $("odoStart").value || shift.odoStart || "";
  shift.odoEnd = $("odoEnd").value || shift.odoEnd || "";
  saveState();
  render();

  const c = calcShift(shift);
  const info = scoreLabel(c.dailyScore);
  $("summaryDate").textContent = new Date().toLocaleDateString("ms-MY", {weekday:"long", day:"numeric", month:"long"});
  $("endSummary").innerHTML = `
    <div class="end-meter">
      <strong>Meter Hari Ini: ${Math.round(c.dailyScore)}/100 · ${info.label}</strong>
      <div class="meter big" style="margin-top:10px"><div style="width:${c.dailyScore}%"></div></div>
      <p>${info.advice}</p>
    </div>
    <div class="stats-grid" style="margin-bottom:12px">
      <div class="stat"><span>Gross</span><strong>${money(c.gross)}</strong></div>
      <div class="stat"><span>Total Cost</span><strong>${money(c.totalCost)}</strong></div>
      <div class="stat"><span>Net</span><strong>${money(c.net)}</strong></div>
      <div class="stat"><span>Job / KM</span><strong>${c.jobsCount} · ${c.km.toFixed(1)}</strong></div>
    </div>
  `;
  $("summaryDialog").showModal();
});

$("closeSummaryBtn").addEventListener("click", () => $("summaryDialog").close());

$("jobForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const shift = getTodayShift();
  shift.jobs.push({
    time: $("jobTime").value || nowTime(),
    id: $("jobId").value.trim(),
    pickup: $("pickup").value.trim(),
    dropoff: $("dropoff").value.trim(),
    fare: num("fare"),
    tip: num("tip"),
    km: num("jobKm"),
    minutes: num("jobMinutes"),
    notes: $("jobNotes").value.trim()
  });
  e.target.reset();
  $("jobTime").value = nowTime();
  saveState();
  render();
  $("jobSection").scrollIntoView({behavior:"smooth", block:"start"});
});

$("expenseForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const shift = getTodayShift();
  shift.expenses.push({
    category: $("expenseCategory").value,
    amount: num("expenseAmount"),
    notes: $("expenseNotes").value.trim()
  });
  e.target.reset();
  saveState();
  render();
});

["fare","tip","jobKm","jobMinutes"].forEach(id => $(id).addEventListener("input", updateJobPreview));
$("saveSettingsBtn").addEventListener("click", saveSettingsFromForm);

$("clearTodayBtn").addEventListener("click", () => {
  if(!confirm("Clear semua data hari ini?")) return;
  delete state.shifts[todayKey()];
  saveState();
  render();
});

$("exportCsvBtn").addEventListener("click", () => {
  const shift = getTodayShift();
  const c = calcShift(shift);
  const rows = [];
  rows.push(["TYPE","DATE","TIME","CATEGORY","DESCRIPTION","FARE","TIP","KM","MINUTES","SCORE","AMOUNT"]);
  shift.jobs.forEach(j => {
    const q = calcJobScore(j);
    rows.push([
      "JOB", shift.date, j.time, "", `${j.pickup} -> ${j.dropoff} ${j.notes || ""}`.trim(),
      j.fare, j.tip, j.km, j.minutes, q.score, ""
    ]);
  });
  shift.expenses.forEach(e => rows.push([
    "EXPENSE", shift.date, "", e.category, e.notes || "", "", "", "", "", "", e.amount
  ]));
  rows.push([]);
  rows.push(["SUMMARY", shift.date, "", "Gross", "", c.gross, "", c.km, c.totalMinutes, c.dailyScore, ""]);
  rows.push(["SUMMARY", shift.date, "", "Total Cost", "", "", "", "", "", "", c.totalCost]);
  rows.push(["SUMMARY", shift.date, "", "Net", "", c.net, "", "", "", "", ""]);

  const csv = rows.map(r => r.map(cell => `"${String(cell ?? "").replaceAll('"','""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `goget-tracker-${shift.date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("installBtn").hidden = false;
});
$("installBtn").addEventListener("click", async () => {
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt = null;
  $("installBtn").hidden = true;
});

if("serviceWorker" in navigator){
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
}

$("jobTime").value = nowTime();
loadSettingsToForm();
render();
