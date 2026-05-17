// --- Printing Performance Dashboard v2.1 ---

const CONFIG = {
  // USER: Paste your deployed Google Apps Script URL here
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxzLCzKnLHOkjP-1t3hLgqS5_p8Lgr-7hncE0X2QDtwNN4NDfnnhd_1YcsJfBfGl_QJ/exec', 
  REFRESH_INTERVAL: 30000,
  DEFAULT_LANGUAGE: 'en'
};

const State = {
  data: null,
  isPaused: false,
  currentSlide: 0,
  totalSlides: 3,
  slideTimer: null,
  focusMachineIdx: 0,
  focusRotationTimer: null,
  focusRotationSpeed: 3,
  enabledSlides: [0, 1, 2]
};

function init() {
  updateClock();
  setInterval(updateClock, 1000);
  
  startDataUpdates();
  setupEventListeners();
}

function startDataUpdates() {
  loadData(); 
  setInterval(loadData, CONFIG.REFRESH_INTERVAL);
}

async function loadData() {
  if (!CONFIG.SCRIPT_URL) {
    console.warn('SCRIPT_URL is not set. Please deploy your Google Apps Script and paste the URL in app.js');
    renderMockData();
    return;
  }

  try {
    const response = await fetch(CONFIG.SCRIPT_URL);
    if (!response.ok) throw new Error('Network response was not ok');
    const result = await response.json();
    console.log('Data Received:', result);
    
    State.data = processRawData(result);
    renderDashboard();
  } catch (err) {
    console.error('Error loading data:', err);
    renderMockData();
  }
}

function processRawData(response) {
  if (!response || !response.rawData) return null;
  
  const processed = {
    totalTarget: 0,
    totalProd: 0,
    lastUpdated: new Date().toLocaleTimeString(),
    machines: [],
    stats: { run: 0, idle: 0, bd: 0 }
  };

  response.rawData.forEach(row => {
    const target = parseFloat(row["Target"]) || 0;
    const prod = parseFloat(row["Production Quantity"]) || 0;
    const status = String(row["Machine Status"] || 'idle').toLowerCase();
    
    processed.totalTarget += target;
    processed.totalProd += prod;

    if (status.includes('run')) processed.stats.run++;
    else if (status.includes('idle')) processed.stats.idle++;
    else if (status.includes('breakdown') || status.includes('bd')) processed.stats.bd++;

    processed.machines.push({
      id: row["Machine No"],
      target: target,
      prod: prod,
      status: status,
      reason: row["Reason of Idle"] || row["Breakdown Type"] || '',
      lastUpdate: row["Last Update Time"] || ''
    });
  });

  return processed;
}

function renderDashboard() {
  const data = State.data;
  if (!data) return;

  const lastUpdateEl = document.getElementById('lastUpdated');
  if (lastUpdateEl) lastUpdateEl.innerText = data.lastUpdated;

  const tPct = data.totalTarget > 0 ? Math.round((data.totalProd / data.totalTarget) * 100) : 0;
  const tRem = data.totalTarget - data.totalProd;

  safeSetText('sum-total-target', data.totalTarget.toLocaleString());
  safeSetText('sum-total-prod', data.totalProd.toLocaleString());
  safeSetText('sum-total-pct', tPct + '%');
  safeSetText('sum-total-rem', tRem.toLocaleString());

  safeSetText('stat-total', data.machines.length);
  safeSetText('stat-run', data.stats.run);
  safeSetText('stat-idle', data.stats.idle);
  safeSetText('stat-bd', data.stats.bd);
  safeSetText('stat-eff', tPct + '%');

  // Breakdown Analysis
  const bdCount = data.stats.bd;
  safeSetText('stat-bd-units', bdCount + (bdCount > 1 ? ' Units' : ' Unit'));
  
  const circleRed = document.getElementById('bd-circle-red');
  const circleBlue = document.getElementById('bd-circle-blue');
  if (bdCount > 0) {
    circleRed.setAttribute('stroke-dasharray', `70, 100`);
    circleBlue.setAttribute('stroke-dasharray', `30, 100`);
    circleBlue.setAttribute('stroke-dashoffset', `-70`);
  }

  renderLiveTicker();
  renderHourlyChart();
  renderComparisonChart();
  renderMachineGrid();
  renderFocusView();
}

function renderMockData() {
  const mockRows = [
    { "Machine No": "Printer-01-2C", "Target": 30000, "Production Quantity": 0, "Machine Status": "Idle", "Reason of Idle": "No Job" },
    { "Machine No": "Printer-03-2C", "Target": 30000, "Production Quantity": 0, "Machine Status": "Breakdown", "Breakdown Type": "Mechanical" },
    { "Machine No": "Printer-04-2C", "Target": 30000, "Production Quantity": 5000, "Machine Status": "Run" }
  ];
  State.data = processRawData({ rawData: mockRows });
  renderDashboard();
}

function updateClock() {
  const now = new Date();
  safeSetText('liveTime', now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  
  // Only update headerDate if not manually overridden by date picker
  if (!State.manualDate) {
    safeSetText('headerDate', now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
  }
}

function renderLiveTicker() {
  const ticker = document.getElementById('live-ticker');
  if (!ticker || !State.data) return;
  
  let html = '';
  State.data.machines.forEach(m => {
    const ach = m.target > 0 ? Math.round((m.prod / m.target) * 100) : 0;
    html += `
      <div class="ticker-item">
        <span class="t-m-name">${m.id}</span>
        <span class="t-tgt">TGT: ${m.target.toLocaleString()}</span>
        <span class="t-prd">PRD: ${m.prod.toLocaleString()}</span>
        <span class="t-ach">${ach}%</span>
      </div>
    `;
  });
  ticker.innerHTML = html + html;
}

function renderHourlyChart() {
  const svg = document.getElementById('hourly-chart-svg');
  if (!svg || !State.data) return;

  const liveTgt = State.data.totalTarget > 0 ? State.data.totalTarget : 210000;
  const liveProd = State.data.totalProd > 0 ? State.data.totalProd : 0;
  
  // Create a trend that ends at current live values
  const hourlyData = [
    { h: '06:00', p: liveProd * 0.2, t: liveTgt * 0.3 },
    { h: '08:00', p: liveProd * 0.5, t: liveTgt * 0.5 },
    { h: '10:00', p: liveProd * 0.8, t: liveTgt * 0.8 },
    { h: '12:00', p: liveProd, t: liveTgt }, // Current point matches live totals
    { h: '14:00', p: liveProd * 0.9, t: liveTgt * 1.1 },
    { h: '16:00', p: liveProd * 0.7, t: liveTgt * 0.9 },
    { h: '18:00', p: liveProd * 0.8, t: liveTgt * 1.2 }
  ];

  const pPath = document.getElementById('hourly-prod-path');
  const pArea = document.getElementById('hourly-prod-area');
  const tPath = document.getElementById('hourly-target-path');
  
  if (!pPath || !tPath) return;

  const width = 400;
  const height = 120;
  
  const allVals = hourlyData.flatMap(d => [d.p, d.t]);
  const maxVal = Math.max(...allVals, 1000) * 1.2; 

  const getX = (i) => (i / (hourlyData.length - 1)) * width;
  const getY = (v) => height - (v / maxVal) * height;

  let pD = `M ${getX(0)},${getY(hourlyData[0].p)}`;
  let tD = `M ${getX(0)},${getY(hourlyData[0].t)}`;

  for (let i = 1; i < hourlyData.length; i++) {
    pD += ` L ${getX(i)},${getY(hourlyData[i].p)}`;
    tD += ` L ${getX(i)},${getY(hourlyData[i].t)}`;
  }

  pPath.setAttribute('d', pD);
  tPath.setAttribute('d', tD);
  if (pArea) pArea.setAttribute('d', pD + ` L ${width},${height} L 0,${height} Z`);

  // Active Focus Point
  const focusIdx = 3;
  const fx = getX(focusIdx);
  const fy = getY(hourlyData[focusIdx].p);
  
  const fLine = document.getElementById('hourly-focus-line');
  const fDot = document.getElementById('hourly-focus-dot');
  if (fLine) { fLine.setAttribute('x1', fx); fLine.setAttribute('x2', fx); }
  if (fDot) { fDot.setAttribute('cx', fx); fDot.setAttribute('cy', fy); }
}

function renderComparisonChart() {
  const container = document.getElementById('comparison-bars');
  if (!container || !State.data) return;
  
  const target = State.data.totalTarget;
  const prod = State.data.totalProd;
  const max = Math.max(target, prod, 1000) * 1.2;
  
  const tH = (target / max) * 100;
  const pH = (prod / max) * 100;

  container.innerHTML = `
    <div style="display:flex; align-items:flex-end; gap:10px; height:100%; width:40%;">
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end;">
        <div style="font-size:10px; font-weight:800; color:var(--accent-blue); margin-bottom:4px;">${target.toLocaleString()}</div>
        <div style="width:100%; height:${tH}%; background:var(--accent-blue); border-radius:4px 4px 0 0; box-shadow:0 0 10px var(--glow-blue);"></div>
      </div>
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end;">
        <div style="font-size:10px; font-weight:800; color:var(--accent-green); margin-bottom:4px;">${prod.toLocaleString()}</div>
        <div style="width:100%; height:${pH}%; background:var(--accent-green); border-radius:4px 4px 0 0; box-shadow:0 0 10px var(--glow-green);"></div>
      </div>
    </div>
  `;
}

function safeSetText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.innerText = txt;
}

// =============================================
// MACHINE GRID - Page 2
// =============================================
function renderMachineGrid() {
  const grid = document.getElementById('machine-grid');
  if (!grid || !State.data) return;

  grid.innerHTML = State.data.machines.map(m => {
    const pct = m.target > 0 ? Math.round((m.prod / m.target) * 100) : 0;
    const status = m.status ? m.status.toLowerCase() : 'idle';

    let cardType = 'orange'; // default idle
    let statusLabel = 'IDLE';
    let statusIcon = '⏳';

    if (status.includes('run')) {
      cardType = 'green'; statusLabel = 'RUNNING'; statusIcon = '⚡';
    } else if (status.includes('break') || status.includes('bd')) {
      cardType = 'red'; statusLabel = 'BREAKDOWN'; statusIcon = '🛑';
    }

    const reasonLine = (m.reason && m.reason.trim())
      ? `<div class="m-reason-tag">${m.reason}</div>`
      : '';

    return `
      <div class="kpi-card ${cardType} m-card-full">
        <div class="kpi-header">
          <div class="m-id-text">${m.id}</div>
          <div class="m-status-wrap">
            <span class="m-status-dot"></span>
            <span class="m-status-lbl">${statusLabel}</span>
          </div>
        </div>
        
        <div class="m-content-row">
          <div class="m-val-group">
            <div class="m-prod-val">${m.prod.toLocaleString()} <span class="m-unit-s">KGS</span></div>
            <div class="m-target-val">TARGET: ${m.target.toLocaleString()} KGS</div>
          </div>
          <div class="m-pct-box">
             <svg viewBox="0 0 36 36" class="m-pct-svg">
               <path class="m-pct-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
               <path class="m-pct-fill" stroke-dasharray="${pct}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
             </svg>
             <span class="m-pct-txt">${pct}%</span>
          </div>
        </div>

        <div class="m-footer-row">
          <div class="m-time">⏱ ${m.lastUpdate || '--:--'}</div>
          ${reasonLine}
        </div>
      </div>
    `;
  }).join('');
}

// =============================================
// FOCUS VIEW - Page 3 (Machine Rotation)
// =============================================
function renderFocusView() {
  const container = document.getElementById('focus-container');
  if (!container || !State.data || !State.data.machines.length) return;

  const m = State.data.machines[State.focusMachineIdx];
  const pct = m.target > 0 ? Math.round((m.prod / m.target) * 100) : 0;
  const status = m.status ? m.status.toLowerCase() : 'idle';

  let cardType = 'orange';
  let statusLabel = 'IDLE';
  let prdColor = 'var(--accent-orange)';

  if (status.includes('run')) {
    cardType = 'green'; statusLabel = 'RUNNING'; prdColor = 'var(--accent-green)';
  } else if (status.includes('break') || status.includes('bd')) {
    cardType = 'red'; statusLabel = 'BREAKDOWN'; prdColor = 'var(--accent-red)';
  }

  container.innerHTML = `
    <div class="focus-card-premium ${cardType}">
      <div class="focus-header-p">
        <div class="focus-id-large">${m.id}</div>
        <div class="focus-status-badge">
          <span class="focus-pulse-dot"></span>
          <span>${statusLabel}</span>
        </div>
        <div class="focus-update-time">⏱ UPDATED: ${m.lastUpdate || '--:--:--'}</div>
      </div>

      <div class="focus-body-p">
        <div class="focus-gauge-area">
          <div class="focus-gauge-wrap">
            <svg viewBox="0 0 100 100" class="focus-gauge-svg">
              <circle class="focus-gauge-bg" cx="50" cy="50" r="45" />
              <circle class="focus-gauge-fill" cx="50" cy="50" r="45" 
                style="stroke-dasharray: ${pct * 2.82}, 282.7; filter: drop-shadow(0 0 10px ${prdColor});" />
            </svg>
            <div class="focus-gauge-info">
              <div class="focus-gauge-pct">${pct}%</div>
              <div class="focus-gauge-lbl">ACHIEVEMENT</div>
            </div>
          </div>
        </div>

        <div class="focus-stats-area">
          <div class="focus-stat-block">
            <div class="focus-stat-label">PRODUCTION UNITS</div>
            <div class="focus-stat-number" id="focus-count-prod" style="color:${prdColor}">0</div>
          </div>
          <div class="focus-stat-block">
            <div class="focus-stat-label">DAILY TARGET</div>
            <div class="focus-stat-number dim">${m.target.toLocaleString()} <span style="font-size:32px;">KGS</span></div>
          </div>
          ${m.reason ? `<div class="focus-reason-tag">REASON: ${m.reason}</div>` : ''}
        </div>
      </div>

      <div class="focus-footer-p">
        <div class="focus-prog-text">MACHINE MONITORING ${State.focusMachineIdx + 1} OF ${State.data.machines.length}</div>
      </div>
    </div>
  `;

  // Animate the production count
  animateValue("focus-count-prod", 0, m.prod, 1000);
}

function animateValue(id, start, end, duration) {
  const obj = document.getElementById(id);
  if (!obj) return;
  const range = end - start;
  let current = start;
  const increment = end > start ? Math.ceil(range / (duration / 16)) : 0;
  const timer = setInterval(() => {
    current += increment;
    if ((increment > 0 && current >= end) || (increment === 0)) {
      obj.textContent = end.toLocaleString() + " KGS";
      clearInterval(timer);
    } else {
      obj.textContent = current.toLocaleString() + " KGS";
    }
  }, 16);
}

function startFocusRotation() {
  if (State.focusRotationTimer) clearInterval(State.focusRotationTimer);
  State.focusRotationTimer = setInterval(() => {
    if (State.currentSlide === 2 && !State.isPaused) {
      if (State.focusMachineIdx >= State.data.machines.length - 1) {
        // Completed all machines, return to home
        goToSlide(0);
      } else {
        State.focusMachineIdx++;
        renderFocusView();
      }
    }
  }, State.focusRotationSpeed * 1000);
}

// =============================================
// SLIDE NAVIGATION
// =============================================
function goToSlide(n) {
  const slides = document.querySelectorAll('.slide');
  slides.forEach(s => s.classList.remove('active'));
  
  // Find next enabled slide
  let targetSlide = (n + State.totalSlides) % State.totalSlides;
  while (!State.enabledSlides.includes(targetSlide)) {
    targetSlide = (targetSlide + 1) % State.totalSlides;
  }

  State.currentSlide = targetSlide;
  const target = document.getElementById('slide-' + State.currentSlide);
  if (target) target.classList.add('active');
  
  if (State.currentSlide === 2) {
    document.body.classList.add('focus-mode-active');
    State.focusMachineIdx = 0;
    renderFocusView();
    startFocusRotation();
  } else {
    document.body.classList.remove('focus-mode-active');
    if (State.focusRotationTimer) clearInterval(State.focusRotationTimer);
  }
}

function startAutoSlide(seconds) {
  if (State.slideTimer) clearInterval(State.slideTimer);
  State.slideTimer = setInterval(() => {
    if (!State.isPaused) goToSlide(State.currentSlide + 1);
  }, seconds * 1000);
}

function setupEventListeners() {
  // Open/close panel
  const settingsBtn = document.getElementById('settingsBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  if (settingsBtn)   settingsBtn.onclick   = () => document.body.classList.add('settings-open');
  if (closeModalBtn) closeModalBtn.onclick = () => document.body.classList.remove('settings-open');

  // Slide navigation buttons (header)
  const prevBtn = document.getElementById('prevSlideHeader');
  const nextBtn = document.getElementById('nextSlideHeader');
  const playBtn = document.getElementById('playPauseBtn');
  const refreshBtn = document.getElementById('refreshBtn');

  if (prevBtn) prevBtn.onclick = () => goToSlide(State.currentSlide - 1);
  if (nextBtn) nextBtn.onclick = () => goToSlide(State.currentSlide + 1);

  if (playBtn) {
    playBtn.onclick = () => {
      State.isPaused = !State.isPaused;
      playBtn.innerText = State.isPaused ? '▶️' : '⏸️';
    };
  }

  if (refreshBtn) {
    refreshBtn.onclick = () => {
      refreshBtn.innerText = '⌛';
      loadData().finally(() => { refreshBtn.innerText = '🔄'; });
    };
  }

  // ── Fullscreen Toggle (Presentation Mode) ──
  const presModeBtn = document.getElementById('presModeBtn');
  if (presModeBtn) {
    presModeBtn.onclick = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn(`Error attempting to enable fullscreen: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    };
  }

  // ── Date Picker ──
  const dateInput = document.getElementById('datePickerInput');
  if (dateInput) {
    dateInput.onchange = (e) => {
      if (e.target.value) {
        const d = new Date(e.target.value);
        State.manualDate = true;
        safeSetText('headerDate', d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
      }
    };
  }

  // ── Shift Buttons ──
  const shiftBtns = [
    document.getElementById('shiftDay'),
    document.getElementById('shiftNight'),
    document.getElementById('shift24h')
  ];
  shiftBtns.forEach(btn => {
    if (btn) {
      btn.onclick = () => {
        shiftBtns.forEach(b => b && b.classList.remove('active'));
        btn.classList.add('active');
      };
    }
  });

  // ── Slide Toggles (checkboxes) ──
  const t0 = document.getElementById('toggle-slide-0');
  const t1 = document.getElementById('toggle-slide-1');
  const t2 = document.getElementById('toggle-slide-2');
  function updateEnabledSlides() {
    const enabled = [];
    if (t0 && t0.checked) enabled.push(0);
    if (t1 && t1.checked) enabled.push(1);
    if (t2 && t2.checked) enabled.push(2);
    State.enabledSlides = enabled.length > 0 ? enabled : [0];
    goToSlide(State.enabledSlides[0]);
  }
  if (t0) t0.onchange = updateEnabledSlides;
  if (t1) t1.onchange = updateEnabledSlides;
  if (t2) t2.onchange = updateEnabledSlides;

  // ── Zoom Level ──
  const zoomRange = document.getElementById('zoomRange');
  const zoomVal   = document.getElementById('zoomVal');
  if (zoomRange) {
    zoomRange.oninput = () => {
      const v = zoomRange.value;
      zoomVal.innerText = v + '%';
      document.body.style.zoom = (v / 100);
    };
  }

  // ── Slide Speed ──
  const slideSpeedRange = document.getElementById('slideSpeedRange');
  const slideSpeedVal   = document.getElementById('slideSpeedVal');
  const slideSpeedDec   = document.getElementById('slideSpeedDec');
  const slideSpeedInc   = document.getElementById('slideSpeedInc');
  
  const updateSlideSpeed = (val) => {
    slideSpeedRange.value = val;
    slideSpeedVal.innerText = val + 's';
    startAutoSlide(val);
  };
  
  if (slideSpeedRange) {
    slideSpeedRange.oninput = () => updateSlideSpeed(parseInt(slideSpeedRange.value));
    if (slideSpeedDec) slideSpeedDec.onclick = () => updateSlideSpeed(Math.max(parseInt(slideSpeedRange.min), parseInt(slideSpeedRange.value) - 1));
    if (slideSpeedInc) slideSpeedInc.onclick = () => updateSlideSpeed(Math.min(parseInt(slideSpeedRange.max), parseInt(slideSpeedRange.value) + 1));
  }

  // ── Scroll Speed (ticker) ──
  const scrollSpeedRange = document.getElementById('scrollSpeedRange');
  const scrollSpeedVal   = document.getElementById('scrollSpeedVal');
  const scrollSpeedDec   = document.getElementById('scrollSpeedDec');
  const scrollSpeedInc   = document.getElementById('scrollSpeedInc');

  const updateScrollSpeed = (val) => {
    scrollSpeedRange.value = val;
    scrollSpeedVal.innerText = val + 's';
    const ticker = document.querySelector('.ticker');
    if (ticker) ticker.style.animationDuration = val + 's';
  };

  if (scrollSpeedRange) {
    scrollSpeedRange.oninput = () => updateScrollSpeed(parseInt(scrollSpeedRange.value));
    if (scrollSpeedDec) scrollSpeedDec.onclick = () => updateScrollSpeed(Math.max(parseInt(scrollSpeedRange.min), parseInt(scrollSpeedRange.value) - 1));
    if (scrollSpeedInc) scrollSpeedInc.onclick = () => updateScrollSpeed(Math.min(parseInt(scrollSpeedRange.max), parseInt(scrollSpeedRange.value) + 1));
  }

  // ── Auto-Slide Toggle ──
  const autoSlideCheck = document.getElementById('autoSlideCheck');
  if (autoSlideCheck) {
    autoSlideCheck.onchange = () => {
      State.isPaused = !autoSlideCheck.checked;
      if (playBtn) playBtn.innerText = State.isPaused ? '▶️' : '⏸️';
    };
  }

  // ── Export Config ──
  const exportBtn = document.getElementById('exportConfigBtn');
  if (exportBtn) {
    exportBtn.onclick = () => {
      const config = {
        scriptUrl: CONFIG.SCRIPT_URL,
        refreshInterval: CONFIG.REFRESH_INTERVAL,
        slideSpeed: parseInt(slideSpeedRange ? slideSpeedRange.value : 15),
        scrollSpeed: parseInt(scrollSpeedRange ? scrollSpeedRange.value : 60),
        zoom: parseInt(zoomRange ? zoomRange.value : 100),
        autoSlide: autoSlideCheck ? autoSlideCheck.checked : true,
        slides: {
          performanceOverview: t0 ? t0.checked : true,
          printingMachines: t1 ? t1.checked : true,
        },
        exportedAt: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'printing-dashboard-config.json';
      a.click();
    };
  }
  // ── Focus Rotation Speed ──
  const focusSpeedRange = document.getElementById('focusSpeedRange');
  const focusSpeedVal   = document.getElementById('focusSpeedVal');
  const focusSpeedDec   = document.getElementById('focusSpeedDec');
  const focusSpeedInc   = document.getElementById('focusSpeedInc');

  const updateFocusSpeed = (val) => {
    focusSpeedRange.value = val;
    focusSpeedVal.innerText = val + 's';
    State.focusRotationSpeed = val;
    if (State.currentSlide === 2) startFocusRotation();
  };

  if (focusSpeedRange) {
    focusSpeedRange.oninput = () => updateFocusSpeed(parseInt(focusSpeedRange.value));
    if (focusSpeedDec) focusSpeedDec.onclick = () => updateFocusSpeed(Math.max(parseInt(focusSpeedRange.min), parseInt(focusSpeedRange.value) - 1));
    if (focusSpeedInc) focusSpeedInc.onclick = () => updateFocusSpeed(Math.min(parseInt(focusSpeedRange.max), parseInt(focusSpeedRange.value) + 1));
  }

  // ── Resolution Preset ──
  const resPreset = document.getElementById('resPreset');
  if (resPreset && zoomRange && zoomVal) {
    resPreset.onchange = () => {
      const v = resPreset.value;
      zoomRange.value = v;
      zoomVal.innerText = v + '%';
      document.body.style.zoom = (v / 100);
    };
  }

  // ── Theme Customizer ──
  const themePrimary = document.getElementById('themePrimary');
  const themeSuccess = document.getElementById('themeSuccess');
  const themeWarning = document.getElementById('themeWarning');
  const themeDanger  = document.getElementById('themeDanger');
  const resetTheme   = document.getElementById('resetThemeBtn');

  const updateCSSVar = (name, val) => document.documentElement.style.setProperty(name, val);

  if (themePrimary) themePrimary.oninput = () => updateCSSVar('--accent-blue', themePrimary.value);
  if (themeSuccess) themeSuccess.oninput = () => updateCSSVar('--accent-green', themeSuccess.value);
  if (themeWarning) themeWarning.oninput = () => updateCSSVar('--accent-orange', themeWarning.value);
  if (themeDanger)  themeDanger.oninput  = () => updateCSSVar('--accent-red', themeDanger.value);

  if (resetTheme) {
    resetTheme.onclick = () => {
      updateCSSVar('--accent-blue', '#3b82f6');
      updateCSSVar('--accent-green', '#10b981');
      updateCSSVar('--accent-orange', '#f59e0b');
      updateCSSVar('--accent-red', '#ef4444');
      if (themePrimary) themePrimary.value = '#3b82f6';
      if (themeSuccess) themeSuccess.value = '#10b981';
      if (themeWarning) themeWarning.value = '#f59e0b';
      if (themeDanger)  themeDanger.value  = '#ef4444';
    };
  }

  // ── Test Live Data ──
  const testBtn  = document.getElementById('testLiveBtn');
  const connDot  = document.getElementById('connDot');
  const connMsg  = document.getElementById('connMsg');
  if (testBtn) {
    testBtn.onclick = async () => {
      testBtn.disabled = true;
      testBtn.style.opacity = '0.5';
      connDot.style.background = '#f59e0b';
      connMsg.style.color = '#f59e0b';
      connMsg.innerText = 'Testing connection…';

      try {
        const res = await fetch(CONFIG.SCRIPT_URL);
        const json = await res.json();
        if (json && (json.rawData !== undefined || json.error)) {
          if (json.error) throw new Error(json.error);
          connDot.style.background = 'var(--accent-green)';
          connDot.style.boxShadow = '0 0 8px var(--accent-green)';
          connMsg.style.color = 'var(--accent-green)';
          connMsg.innerText = `✅ Sync Successful! (${json.rawData.length} rows)`;
        }
      } catch (err) {
        connDot.style.background = 'var(--accent-red)';
        connDot.style.boxShadow = '0 0 8px var(--accent-red)';
        connMsg.style.color = 'var(--accent-red)';
        connMsg.innerText = '❌ Failed: ' + err.message;
      } finally {
        testBtn.disabled = false;
        testBtn.style.opacity = '1';
      }
    };
  }

  // Start auto-slide
  startAutoSlide(20);

  // Set initial ticker duration
  const ticker = document.querySelector('.ticker');
  if (ticker) ticker.style.animationDuration = '300s';
}

document.addEventListener('DOMContentLoaded', init);
