/* ═══════════════════════════════════════════════════════════

   상수 & 유틸

═══════════════════════════════════════════════════════════ */

const STORAGE_KEY      = 'portfolio_history';

const CATEGORY_MAP_KEY = 'portfolio_category_map';

const CATEGORY_LIST_KEY= 'portfolio_category_list';

const TARGET_KEY       = 'portfolio_target';

const JOURNAL_KEY      = 'portfolio_journal';

const DIVIDEND_KEY     = 'portfolio_dividend';

const BACKUP_KEY       = 'portfolio_last_backup'; // ← 변경: 마지막 백업 날짜 키

 

const DEFAULT_CATEGORIES = ['국내주식', '해외주식', 'ETF', '현금'];

const LEGEND_MAX = 8; // ← 변경: 파이차트 범례 최대 표시 종목 수

 

const COLORS = [

  '#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444',

  '#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16',

  '#3b82f6','#a855f7','#d946ef','#0ea5e9','#22c55e',

];

 

const fmt = {

  number: v => Number(v).toLocaleString('ko-KR'),

  money : v => Number(v).toLocaleString('ko-KR') + '원',

  pct   : v => {

    const n = parseFloat(v);

    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

  },

};

 

function pctClass(v) {

  const n = parseFloat(v);

  if (n > 0) return 'positive';

  if (n < 0) return 'negative';

  return 'zero';

}

 

/* ═══════════════════════════════════════════════════════════

   로컬스토리지 헬퍼

═══════════════════════════════════════════════════════════ */

const store = {

  history     : () => JSON.parse(localStorage.getItem(STORAGE_KEY))       || {},

  categoryMap : () => JSON.parse(localStorage.getItem(CATEGORY_MAP_KEY))  || {},

  categoryList: () => JSON.parse(localStorage.getItem(CATEGORY_LIST_KEY)) || [...DEFAULT_CATEGORIES],

  target      : () => JSON.parse(localStorage.getItem(TARGET_KEY))        || {},

  journal     : () => JSON.parse(localStorage.getItem(JOURNAL_KEY))       || [], // ← 변경: 일지 로드

 

  saveHistory     : v => localStorage.setItem(STORAGE_KEY,        JSON.stringify(v)),

  saveCategoryMap : v => localStorage.setItem(CATEGORY_MAP_KEY,   JSON.stringify(v)),

  saveCategoryList: v => localStorage.setItem(CATEGORY_LIST_KEY,  JSON.stringify(v)),

  saveTarget      : v => localStorage.setItem(TARGET_KEY,         JSON.stringify(v)),

  saveJournal     : v => localStorage.setItem(JOURNAL_KEY,        JSON.stringify(v)),

  dividend        : () => JSON.parse(localStorage.getItem(DIVIDEND_KEY)) || [], // ← 변경

  saveDividend    : v => localStorage.setItem(DIVIDEND_KEY, JSON.stringify(v)),

  lastBackup      : ()  => localStorage.getItem(BACKUP_KEY) || null,          // ← 변경

  saveLastBackup  : ()  => localStorage.setItem(BACKUP_KEY, new Date().toISOString().slice(0, 10)), // ← 변경

};

 

/* ═══════════════════════════════════════════════════════════

   자동 카테고리 분류

═══════════════════════════════════════════════════════════ */

const ETF_KEYWORDS   = ['KODEX','TIGER','ARIRANG','KBSTAR','HANARO','KOSEF','KINDEX'];

const FOREIGN_ETF_KW = ['QQQ','SPY','IVV','VTI','VOO','SCHD','GLD','TLT','ARKK'];

const FOREIGN_PATTERN= /^[A-Z]{1,5}$/;

 

function autoCategory(name) {

  const upper = name.toUpperCase();

  if (ETF_KEYWORDS.some(k => upper.includes(k)))  return 'ETF';

  if (FOREIGN_ETF_KW.some(k => upper === k))       return 'ETF';

  if (FOREIGN_PATTERN.test(name.trim()))            return '해외주식';

  return '국내주식';

}

 

function getCategory(name) {

  const map = store.categoryMap();

  return map[name] || autoCategory(name);

}

 

/* ═══════════════════════════════════════════════════════════

   CSV 파서

═══════════════════════════════════════════════════════════ */

function parseCSV(text) {

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  if (lines.length < 2) throw new Error('데이터가 부족합니다.');

 

  return lines.slice(1).map((line, idx) => {

    const cols  = line.match(/(".*?"|[^,]+)(?=,|$)/g) || line.split(',');

    const clean = cols.map(c => c.replace(/^"|"$/g, '').trim());

    if (clean.length < 5) throw new Error(`${idx + 2}행 형식 오류`);

 

    const name = clean[0];

    return {

      name,

      category: getCategory(name),

      qty     : parseFloat(clean[1].replace(/[^0-9.]/g, ''))   || 0,

      buyAmt  : parseFloat(clean[2].replace(/[^0-9.-]/g, ''))  || 0,

      evalAmt : parseFloat(clean[3].replace(/[^0-9.-]/g, ''))  || 0,

      profit  : parseFloat(clean[4].replace(/[^0-9.+-]/g, '')) || 0,

    };

  });

}

 

/* ═══════════════════════════════════════════════════════════

   상태

═══════════════════════════════════════════════════════════ */

let parsedData   = null;

let categoryList = store.categoryList();

// 현재 Step 2에서 표시 중인 신규 종목 이름 집합
let currentNewStocks = new Set();

 

/* ═══════════════════════════════════════════════════════════

   저장된 최신 데이터 로드 (카테고리 적용)

═══════════════════════════════════════════════════════════ */

function getLatestSavedData() {

  const history = store.history();

  const dates = Object.keys(history).sort();

  if (!dates.length) return null;

  const latestData = history[dates[dates.length - 1]];

  const map = store.categoryMap();

  return latestData.map(row => ({

    ...row,

    category: map[row.name] || autoCategory(row.name),

  }));

}

/* ═══════════════════════════════════════════════════════════

   날짜별 삭제 - 칩 렌더링

═══════════════════════════════════════════════════════════ */

function renderDateChips() {

  const history  = store.history();

  const dates    = Object.keys(history).sort();

  const section  = document.getElementById('dateDeleteSection');

  const chipList = document.getElementById('dateChipList');

 

  if (!dates.length) {

    section.style.display = 'none';

    return;

  }

 

  section.style.display = '';

  chipList.innerHTML = dates.map(date => `

    <div class="date-chip" data-date="${date}">

      <span>📅 ${date}</span>

      <span class="chip-del" data-date="${date}" title="${date} 삭제">✕</span>

    </div>

  `).join('');

 

  chipList.querySelectorAll('.chip-del').forEach(btn => {

    btn.addEventListener('click', () => {

      const date = btn.dataset.date;

      if (!confirm(`📅 ${date} 데이터를 삭제할까요?`)) return;

      const history = store.history();

      delete history[date];

      store.saveHistory(history);

      showStatus(`🗑 ${date} 데이터가 삭제되었습니다.`, 'error');

      const remaining = Object.keys(history);

      if (remaining.length) {

        renderAllHistory();

      } else {

        // ← 변경: 존재하지 않는 ID 참조 제거, 차트 destroy + 테이블/차트 영역 초기화

        destroyChart(pieChartInst);

        destroyChart(catPieChartInst);

        destroyChart(lineChartInst);

        destroyChart(historyPieInst);

        pieChartInst = catPieChartInst = lineChartInst = historyPieInst = null;

        // ← 변경: 대시보드 테이블/차트 영역 비우기

        document.getElementById('tableBody').innerHTML   = '';

        document.getElementById('tableFoot').innerHTML   = '';

        document.getElementById('legendList').innerHTML  = '';

        document.getElementById('categoryLegend').innerHTML = '';

        // ← 변경: 히스토리 슬라이더 초기화

        document.getElementById('historyTableBody').innerHTML = '';

        document.getElementById('historyTableFoot').innerHTML = '';

        document.getElementById('historyLegend').innerHTML    = '';

        document.getElementById('currentDateLabel').textContent = '';

        historyDates = [];

        historyIndex = 0;

        parsedData   = null;

      }

      renderDateChips();

    });

  });

}

 

/* ═══════════════════════════════════════════════════════════

   STEP 2: 카테고리 확인/수정 렌더링

═══════════════════════════════════════════════════════════ */

function renderCategorySection(data, newStockNames = new Set()) {

  categoryList = store.categoryList();

  renderCategoryTags();

  currentNewStocks = newStockNames;

  const newCount = newStockNames.size;

  const hint = document.querySelector('#categorySection .edit-hint');

  if (hint) {

    hint.textContent = newCount > 0

      ? `앱이 자동으로 분류했어요. 잘못된 항목을 수정하고 확인을 눌러주세요. (🟡 ${newCount}개 신규 종목 포함)`

      : '앱이 자동으로 분류했어요. 잘못된 항목을 수정하고 확인을 눌러주세요.';

  }

  const tbody = document.getElementById('categoryTableBody');

  tbody.innerHTML = data.map((row, i) => {

    const isNew = newStockNames.has(row.name);

    return `

    <tr class="${isNew ? 'row-new' : ''}">

      <td><strong>${row.name}</strong>${isNew ? '<span class="badge-new" style="margin-left:6px;font-size:0.72rem;padding:2px 6px;border-radius:4px;border:1px solid var(--warning);background:var(--warning-bg);color:var(--warning)">NEW</span>' : ''}</td>

      <td>${fmt.number(row.qty)}</td>

      <td>${fmt.money(row.evalAmt)}</td>

      <td>

        <select class="cat-select" data-idx="${i}">

          ${categoryList.map(c =>

            `<option value="${c}" ${c === row.category ? 'selected' : ''}>${c}</option>`

          ).join('')}

        </select>

      </td>

    </tr>

  `;

  }).join('');



}

 

function renderCategoryTags() {

  const list = document.getElementById('categoryTagList');

  list.innerHTML = categoryList.map(c => `

    <span class="tag">

      ${c}

      <span class="tag-del" data-cat="${c}">✕</span>

    </span>

  `).join('');

 

  list.querySelectorAll('.tag-del').forEach(btn => {

    btn.addEventListener('click', () => {

      const cat = btn.dataset.cat;

      if (DEFAULT_CATEGORIES.includes(cat)) {

        showStatus('기본 카테고리는 삭제할 수 없어요.', 'error'); return;

      }

      categoryList = categoryList.filter(c => c !== cat);

      store.saveCategoryList(categoryList);

      renderCategorySection(parsedData, currentNewStocks);

    });

  });

}

 

document.getElementById('addCategoryBtn').addEventListener('click', () => {

  const input = document.getElementById('newCategoryInput');

  const name  = input.value.trim();

  if (!name) return;

  if (categoryList.includes(name)) {

    showStatus('이미 있는 카테고리예요.', 'error'); return;

  }

  categoryList.push(name);

  store.saveCategoryList(categoryList);

  input.value = '';

  renderCategorySection(parsedData, currentNewStocks);

});

 

document.getElementById('confirmCategoryBtn').addEventListener('click', () => {

  document.querySelectorAll('#categoryTableBody .cat-select').forEach(sel => {

    parsedData[sel.dataset.idx].category = sel.value;

  });

  // 1. categoryMap 저장
  const map = store.categoryMap();

  parsedData.forEach(row => { map[row.name] = row.category; });

  store.saveCategoryMap(map);

  // 2. history의 최신 날짜 데이터도 업데이트 (카테고리 일치)
  const history = store.history();

  const dates = Object.keys(history).sort();

  if (dates.length) {

    history[dates[dates.length - 1]] = parsedData;

    store.saveHistory(history);

  }

  // 3. 현재 포트폴리오 + 파이차트 즉시 갱신
  renderTable(parsedData);

  renderPieCharts(parsedData);

  // 4. Step 3 렌더링
  renderTargetSection(parsedData);

  // 5. 카테고리 확인 완료 → NEW 뱃지 초기화
  currentNewStocks = new Set();

});

 

/* ═══════════════════════════════════════════════════════════

   STEP 3: 목표 비중 설정 렌더링

═══════════════════════════════════════════════════════════ */

function renderTargetSection(data) {

  const savedTarget = store.target();

  const groups = {};

  data.forEach(row => {

    if (!groups[row.category]) groups[row.category] = [];

    groups[row.category].push(row);

  });

  const container = document.getElementById('targetContent');

  container.innerHTML = Object.entries(groups).map(([cat, stocks]) => {

    const savedCat     = savedTarget[cat] || {};

    const catPct       = savedCat.pct     ?? '';

    const stockTargets = savedCat.stocks  || {};

    // ← 변경: 세부설정 ON/OFF 상태 로드 (기본값 false = OFF)

    const useDetail    = savedCat.useDetail ?? false;

    const stockRows = stocks.map(s => {

      const sp = stockTargets[s.name] ?? '';

      return `

        <div class="target-stock-row">

          <span class="stock-name">${s.name}</span>

          <input

            type="number" min="0" max="100" step="1"

            class="stock-pct-input"

            data-cat="${cat}" data-stock="${s.name}"

            value="${sp}" placeholder="0"

          />

          <span class="stock-pct-label">% (카테고리 내)</span>

        </div>

      `;

    }).join('');

    return `

      <div class="target-category-block">

        <div class="target-category-header">

          <span class="cat-name">${cat}</span>

          <span class="cat-label">목표 비중</span>

          <input

            type="number" min="0" max="100" step="1"

            class="cat-pct-input"

            data-cat="${cat}"

            value="${catPct}" placeholder="0"

          />

          <span class="cat-label">%</span>

          <!-- ← 변경: 세부설정 토글 -->

          <label class="detail-toggle" title="종목별 세부 비중 설정">

            <input type="checkbox" class="detail-toggle-input" data-cat="${cat}" ${useDetail ? 'checked' : ''} />

            <span class="detail-toggle-track">

              <span class="detail-toggle-thumb"></span>

            </span>

            <span class="detail-toggle-label">${useDetail ? '세부설정 ON' : '세부설정 OFF'}</span>

          </label>

        </div>

        <!-- ← 변경: 세부설정 OFF면 종목 행 숨김 -->

        <div class="target-stock-list" data-cat-detail="${cat}" style="${useDetail ? '' : 'display:none'}">${stockRows}</div>

        <div class="stock-sub-total" data-cat-detail="${cat}" style="${useDetail ? '' : 'display:none'}">

          <span>카테고리 내 종목 합계:</span>

          <span class="sub-total-val" data-cat="${cat}">0%</span>

        </div>

        <!-- ← 변경: 세부설정 OFF일 때 안내 문구 -->

        <div class="detail-off-hint" data-cat-hint="${cat}" style="${useDetail ? 'display:none' : ''}">

          <span>카테고리 전체로 리밸런싱 계산됩니다.</span>

        </div>

      </div>

    `;

  }).join('');

  // 카테고리 비중 합계 업데이트

  container.querySelectorAll('.cat-pct-input').forEach(input => {

    input.addEventListener('input', updateCategoryTotal);

  });

  // 종목별 소계 업데이트

  container.querySelectorAll('.stock-pct-input').forEach(input => {

    input.addEventListener('input', () => updateStockSubTotal(input.dataset.cat));

  });

  // ← 변경: 세부설정 토글 이벤트

  container.querySelectorAll('.detail-toggle-input').forEach(checkbox => {

    checkbox.addEventListener('change', () => {

      const cat      = checkbox.dataset.cat;

      const isOn     = checkbox.checked;

      const label    = checkbox.closest('.detail-toggle').querySelector('.detail-toggle-label');

      const stockList = container.querySelector(`.target-stock-list[data-cat-detail="${cat}"]`);

      const subTotal  = container.querySelector(`.stock-sub-total[data-cat-detail="${cat}"]`);

      const hint      = container.querySelector(`.detail-off-hint[data-cat-hint="${cat}"]`);

      label.textContent          = isOn ? '세부설정 ON' : '세부설정 OFF';

      stockList.style.display    = isOn ? '' : 'none';

      subTotal.style.display     = isOn ? '' : 'none';

      hint.style.display         = isOn ? 'none' : '';

    });

  });

  updateCategoryTotal();

  Object.keys(groups).forEach(cat => updateStockSubTotal(cat));

  navigateTo('targetSection');

}



 

function updateCategoryTotal() {

  const inputs  = document.querySelectorAll('.cat-pct-input');

  const total   = Array.from(inputs).reduce((s, i) => s + (parseFloat(i.value) || 0), 0);

  const display = document.getElementById('categoryTotalDisplay');

  const status  = document.getElementById('categoryTotalStatus');

  display.textContent = total.toFixed(1) + '%';

  if (Math.abs(total - 100) < 0.01) {

    status.textContent = '✅ 합계 100%';

    status.className   = 'total-ok';

  } else {

    status.textContent = total > 100 ? '❌ 100% 초과' : `⚠️ ${(100 - total).toFixed(1)}% 남음`;

    status.className   = 'total-err';

  }

}

 

function updateStockSubTotal(cat) {

  const inputs = document.querySelectorAll(`.stock-pct-input[data-cat="${cat}"]`);

  const total  = Array.from(inputs).reduce((s, i) => s + (parseFloat(i.value) || 0), 0);

  const el     = document.querySelector(`.sub-total-val[data-cat="${cat}"]`);

  if (el) {

    el.textContent = total.toFixed(1) + '%';

    el.style.color = Math.abs(total - 100) < 0.01 ? 'var(--success)' : 'var(--warning)';

  }

}

 

document.getElementById('saveTargetBtn').addEventListener('click', () => {

  const target = {};

  document.querySelectorAll('.cat-pct-input').forEach(input => {

    const cat = input.dataset.cat;

    target[cat] = { pct: parseFloat(input.value) || 0, stocks: {}, useDetail: false };

  });

  // ← 변경: 세부설정 토글 상태 저장

  document.querySelectorAll('.detail-toggle-input').forEach(checkbox => {

    const cat = checkbox.dataset.cat;

    if (target[cat]) target[cat].useDetail = checkbox.checked;

  });

  document.querySelectorAll('.stock-pct-input').forEach(input => {

    const { cat, stock } = input.dataset;

    if (target[cat]) target[cat].stocks[stock] = parseFloat(input.value) || 0;

  });

  const catTotal = Object.values(target).reduce((s, v) => s + v.pct, 0);

  if (Math.abs(catTotal - 100) > 1) {

    showStatus(`⚠️ 카테고리 합계가 ${catTotal.toFixed(1)}%예요. 100%로 맞춰주세요.`, 'error');

    return;

  }

  // ← 변경: 세부설정 ON 카테고리만 종목 합계 100% 검증

  for (const [cat, val] of Object.entries(target)) {

    if (val.useDetail) {

      const stockTotal = Object.values(val.stocks).reduce((s, v) => s + v, 0);

      if (Math.abs(stockTotal - 100) > 1) {

        showStatus(`⚠️ [${cat}] 종목 합계가 ${stockTotal.toFixed(1)}%예요. 100%로 맞춰주세요.`, 'error');

        return;

      }

    }

  }

  store.saveTarget(target);

  showStatus('✅ 목표 비중이 저장되었습니다!');

  navigateTo('rebalanceSection');

  calcRebalance(); // 저장 즉시 리밸런싱 자동 계산

});

 

/* ═══════════════════════════════════════════════════════════

   STEP 4: 리밸런싱 계산

═══════════════════════════════════════════════════════════ */

function calcRebalance() {

  if (!parsedData) { showStatus('먼저 CSV를 업로드해주세요.', 'error'); return; }

  const target     = store.target();

  const extraMoney = parseFloat(document.getElementById('extraMoney').value) || 0;

  const mode       = document.querySelector('input[name="rebalMode"]:checked').value;

  const totalEval  = parsedData.reduce((s, r) => s + r.evalAmt, 0);

  const totalAsset = totalEval + extraMoney;

  const catGroups  = {};

  parsedData.forEach(row => {

    if (!catGroups[row.category]) catGroups[row.category] = [];

    catGroups[row.category].push(row);

  });

  const groups = [];

  Object.entries(catGroups).forEach(([cat, rows]) => {

    const catTarget  = target[cat];

    const useDetail  = catTarget?.useDetail ?? false;

    const catPct     = (catTarget?.pct || 0) / 100;

    const catEval    = rows.reduce((s, r) => s + r.evalAmt, 0);

    const catBuy     = rows.reduce((s, r) => s + r.buyAmt,  0);

    const targetAmt  = totalAsset * catPct;

    const diff       = targetAmt - catEval;

    const adjDiff    = mode === 'buyOnly' ? Math.max(0, diff) : diff;

    const group = {

      category    : cat,

      useDetail,

      evalAmt     : catEval,

      buyAmt      : catBuy,

      targetAmt,

      diff,

      adjustedDiff: adjDiff,

      catPct      : catPct * 100,

      stockCount  : rows.length,

      stocks      : [],

    };

    if (useDetail) {

      rows.forEach(row => {

        const stockPct  = (catTarget.stocks?.[row.name] || 0) / 100;

        const sTargetAmt = totalAsset * catPct * stockPct;

        const sDiff      = sTargetAmt - row.evalAmt;

        const sAdjDiff   = mode === 'buyOnly' ? Math.max(0, sDiff) : sDiff;

        group.stocks.push({ ...row, targetAmt: sTargetAmt, diff: sDiff, adjustedDiff: sAdjDiff, hasTarget: true });

      });

    } else {

      // 세부목표 미설정이어도 종목 목록은 저장 (현재금액·비중 표시용)
      rows.forEach(row => {

        group.stocks.push({ ...row, hasTarget: false });

      });

    }

    groups.push(group);

  });

  renderRebalanceResult(groups, totalEval, totalAsset, extraMoney);

}

document.getElementById('calcBtn').addEventListener('click', calcRebalance);

 

function renderRebalanceResult(groups, totalEval, totalAsset, extraMoney) {

  // 요약 카드용: 실제 액션 단위(통합=카테고리, 세부=종목)로 집계
  const actionItems = [];

  groups.forEach(g => {

    if (!g.useDetail) actionItems.push(g);

    else g.stocks.forEach(s => actionItems.push(s));

  });

  const totalBuy  = actionItems.filter(r => r.adjustedDiff > 0)

                               .reduce((s, r) => s + r.adjustedDiff, 0);

  const totalSell = actionItems.filter(r => r.adjustedDiff < 0)

                               .reduce((s, r) => s + Math.abs(r.adjustedDiff), 0);

  const holdCount = actionItems.filter(r => Math.abs(r.adjustedDiff) < 1000).length;

 

  document.getElementById('summaryCards').innerHTML = `

    <div class="summary-card">

      <div class="s-label">현재 총 평가금액</div>

      <div class="s-value">${fmt.money(totalEval)}</div>

    </div>

    <div class="summary-card">

      <div class="s-label">추가 투자금액</div>

      <div class="s-value">${fmt.money(extraMoney)}</div>

    </div>

    <div class="summary-card">

      <div class="s-label">리밸런싱 후 총 자산</div>

      <div class="s-value">${fmt.money(totalAsset)}</div>

    </div>

    <div class="summary-card">

      <div class="s-label">총 매수 필요</div>

      <div class="s-value buy">${fmt.money(Math.round(totalBuy))}</div>

    </div>

    <div class="summary-card">

      <div class="s-label">총 매도 필요</div>

      <div class="s-value sell">${fmt.money(Math.round(totalSell))}</div>

    </div>

    <div class="summary-card">

      <div class="s-label">유지 종목</div>

      <div class="s-value hold">${holdCount}개</div>

    </div>

  `;

 

  const target = store.target();

  function makeBadge(diff) {

    if (Math.abs(diff) < 1000) return '<span class="badge badge-hold">유지</span>';

    return diff > 0 ? '<span class="badge badge-buy">매수</span>' : '<span class="badge badge-sell">매도</span>';

  }

  function makeDiffText(diff) {

    if (Math.abs(diff) < 1000) return '-';

    return diff > 0

      ? `<span class="positive">+${fmt.money(Math.round(diff))}</span>`

      : `<span class="negative">${fmt.money(Math.round(diff))}</span>`;

  }

  // 정렬
  if (rebalSort.col) {
    const sign = rebalSort.dir === 'asc' ? 1 : -1;

    const catSortVal = (g) => {
      const pct = totalEval > 0 ? g.evalAmt / totalEval * 100 : 0;
      if (rebalSort.col === 'evalAmt')    return g.evalAmt;
      if (rebalSort.col === 'currentPct') return pct;
      if (rebalSort.col === 'catPct')     return g.catPct;
      if (rebalSort.col === 'diffPct')    return g.catPct - pct;
      if (rebalSort.col === 'adjDiff')    return g.adjustedDiff;
      return 0;
    };

    const stockSortVal = (s, group) => {
      const sPct      = totalEval > 0 ? s.evalAmt / totalEval * 100 : 0;
      const stockPct  = target[group.category]?.stocks?.[s.name] || 0;
      const sTargetPct = group.catPct * stockPct / 100;
      if (rebalSort.col === 'evalAmt')    return s.evalAmt;
      if (rebalSort.col === 'currentPct') return sPct;
      if (rebalSort.col === 'catPct')     return sTargetPct;
      if (rebalSort.col === 'diffPct')    return sTargetPct - sPct;
      if (rebalSort.col === 'adjDiff')    return s.adjustedDiff;
      return 0;
    };

    groups.sort((a, b) => (catSortVal(a) - catSortVal(b)) * sign);

    groups.forEach(group => {
      if (group.useDetail && group.stocks.length > 1) {
        group.stocks.sort((a, b) => (stockSortVal(a, group) - stockSortVal(b, group)) * sign);
      }
    });
  }

  let html = '';

  groups.forEach((group, gi) => {

    const diff       = group.adjustedDiff;

    const isHold     = Math.abs(diff) < 1000;

    const currentPct = totalEval > 0 ? (group.evalAmt / totalEval * 100) : 0;

    const diffPct    = group.catPct - currentPct;

    // 종목이 2개 이상이거나 세부목표가 있으면 토글 버튼 표시
    const toggleBtn = group.stocks.length > 0
      ? `<button class="rebal-cat-toggle" data-gi="${gi}" aria-expanded="false">❯</button>`
      : '';

    html += `

      <tr class="rebal-cat-row">

        <td>${toggleBtn}<strong>${group.category}</strong><br>

          <span style="font-size:.8rem;color:var(--text-muted);font-weight:400">${group.stockCount}종목</span>

        </td>

        <td>${fmt.money(Math.round(group.evalAmt))}</td>

        <td>${currentPct.toFixed(1)}%</td>

        <td>${group.catPct.toFixed(1)}%</td>

        <td class="${pctClass(diffPct)}">${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(1)}%</td>

        <td>${makeBadge(diff)}</td>

        <td>${makeDiffText(diff)}</td>

        <td>${!isHold && !group.useDetail ? `

          <input type="number" class="price-input" placeholder="참고가 입력"

            data-diff="${Math.round(diff)}" data-name="cat_${gi}" />

          <span class="qty-result" data-name="cat_${gi}"></span>

        ` : '-'}</td>

      </tr>

    `;

    group.stocks.forEach(stock => {

      const sCurrentPct = totalEval > 0 ? (stock.evalAmt / totalEval * 100) : 0;

      if (stock.hasTarget) {

        // 세부목표 설정된 종목 — 전체 컬럼 표시
        const sDiff      = stock.adjustedDiff;
        const sIsHold    = Math.abs(sDiff) < 1000;
        const catPctVal  = group.catPct;
        const stockPctVal = target[group.category]?.stocks?.[stock.name] || 0;
        const sTargetPct = catPctVal * stockPctVal / 100;
        const sDiffPct   = sTargetPct - sCurrentPct;

        html += `
          <tr class="rebal-detail-row" data-gi="${gi}" style="display:none">
            <td style="padding-left:1.8rem"><strong>${stock.name}</strong></td>
            <td>${fmt.money(stock.evalAmt)}</td>
            <td>${sCurrentPct.toFixed(1)}%</td>
            <td>${sTargetPct.toFixed(1)}%</td>
            <td class="${pctClass(sDiffPct)}">${sDiffPct >= 0 ? '+' : ''}${sDiffPct.toFixed(1)}%</td>
            <td>${makeBadge(sDiff)}</td>
            <td>${makeDiffText(sDiff)}</td>
            <td>${!sIsHold ? `
              <input type="number" class="price-input" placeholder="현재가 입력"
                data-diff="${Math.round(sDiff)}" data-name="${stock.name}" />
              <span class="qty-result" data-name="${stock.name}"></span>
            ` : '-'}</td>
          </tr>`;

      } else {

        // 세부목표 미설정 — 종목명·현재금액·현재비중만 표시
        html += `
          <tr class="rebal-detail-row rebal-detail-row--info" data-gi="${gi}" style="display:none">
            <td style="padding-left:1.8rem">${stock.name}</td>
            <td>${fmt.money(stock.evalAmt)}</td>
            <td>${sCurrentPct.toFixed(1)}%</td>
            <td>-</td><td>-</td><td>-</td><td>-</td><td>-</td>
          </tr>`;

      }

    });

  });

  document.getElementById('rebalanceTableBody').innerHTML = html;

  // 카테고리 접기/펼치기 토글
  document.querySelectorAll('.rebal-cat-toggle').forEach(btn => {

    btn.addEventListener('click', () => {

      const gi   = btn.dataset.gi;

      const open = btn.getAttribute('aria-expanded') === 'true';

      btn.setAttribute('aria-expanded', String(!open));

      const rows = document.querySelectorAll(`.rebal-detail-row[data-gi="${gi}"]`);

      _animateCatRows(rows, !open);

    });

  });

 

  document.querySelectorAll('.price-input').forEach(input => {

    input.addEventListener('input', () => {

      const price = parseFloat(input.value) || 0;

      const diff  = parseFloat(input.dataset.diff) || 0;

      const name  = input.dataset.name;

      const qtyEl = document.querySelector(`.qty-result[data-name="${name}"]`);

      if (!qtyEl) return;

      if (price > 0) {

        const qty = Math.abs(Math.round(diff / price));

        qtyEl.textContent = `약 ${fmt.number(qty)}주`;

        qtyEl.style.color = diff > 0 ? 'var(--danger)' : '#3b82f6';

      } else {

        qtyEl.textContent = '';

      }

    });

  });

 

  document.getElementById('rebalanceResult').classList.remove('hidden');

  document.getElementById('rebalanceResult').scrollIntoView({ behavior: 'smooth' });

}

 

/* ═══════════════════════════════════════════════════════════

   포트폴리오 테이블 렌더링

═══════════════════════════════════════════════════════════ */

// sort state: { col: string|null, dir: 'asc'|'desc' }
const portfolioSort = { col: null, dir: 'asc' };
const historySort   = { col: null, dir: 'asc' };
const rebalSort     = { col: null, dir: 'asc' };

function buildCatGroups(data, sortState) {

  const totalEval = data.reduce((s, r) => s + r.evalAmt, 0);

  const catMap = {};

  data.forEach(row => {

    const cat = row.category || '-';

    if (!catMap[cat]) catMap[cat] = { category: cat, rows: [], evalAmt: 0, buyAmt: 0 };

    catMap[cat].rows.push(row);

    catMap[cat].evalAmt += row.evalAmt;

    catMap[cat].buyAmt  += row.buyAmt;

  });

  const groups = Object.values(catMap);

  if (sortState && sortState.col) {

    const { col, dir } = sortState;

    const sign = dir === 'asc' ? 1 : -1;

    groups.sort((a, b) => {

      let va, vb;

      if (col === 'buyAmt')  { va = a.buyAmt;  vb = b.buyAmt; }

      else if (col === 'evalAmt') { va = a.evalAmt; vb = b.evalAmt; }

      else if (col === 'profit') {

        va = a.buyAmt > 0 ? (a.evalAmt - a.buyAmt) / a.buyAmt : 0;

        vb = b.buyAmt > 0 ? (b.evalAmt - b.buyAmt) / b.buyAmt : 0;

      }

      else if (col === 'weight') {

        va = totalEval > 0 ? a.evalAmt / totalEval : 0;

        vb = totalEval > 0 ? b.evalAmt / totalEval : 0;

      }

      return (va - vb) * sign;

    });

  } else {

    groups.sort((a, b) => b.evalAmt - a.evalAmt); // default: evalAmt desc

  }

  return groups;

}

function _animateCatRows(rows, opening) {

  if (opening) {

    rows.forEach(tr => {

      tr.style.display = '';

      tr.style.animation = 'catRowIn 0.2s cubic-bezier(0.4,0,0.2,1) forwards';

    });

  } else {

    rows.forEach(tr => {

      tr.style.animation = 'catRowOut 0.15s ease forwards';

      tr.addEventListener('animationend', () => {

        tr.style.display = 'none';

        tr.style.animation = '';

      }, { once: true });

    });

  }

}

function attachCatToggle(tableId) {

  const doToggle = btn => {

    const gi   = btn.dataset.gi;

    const open = btn.getAttribute('aria-expanded') === 'true';

    btn.setAttribute('aria-expanded', String(!open));

    const rows = document.querySelectorAll(`#${tableId} .cat-stock-row[data-gi="${gi}"]`);

    _animateCatRows(rows, !open);

  };

  document.querySelectorAll(`#${tableId} .cat-row-toggle`).forEach(btn => {

    btn.addEventListener('click', e => { e.stopPropagation(); doToggle(btn); });

  });

  document.querySelectorAll(`#${tableId} .cat-group-row`).forEach(row => {

    row.addEventListener('click', () => {

      const btn = row.querySelector('.cat-row-toggle');

      if (btn) doToggle(btn);

    });

  });

}

/* ═══════════════════════════════════════════════════════════
   정렬 버튼 이벤트 바인딩
═══════════════════════════════════════════════════════════ */
function bindSortButtons() {

  document.querySelectorAll('.sort-btn').forEach(btn => {

    btn.addEventListener('click', () => {

      const table = btn.dataset.table; // 'portfolio' | 'history' | 'rebal'
      const col   = btn.dataset.col;
      const state = table === 'portfolio' ? portfolioSort
                  : table === 'history'   ? historySort
                  :                         rebalSort;

      if (state.col === col) {
        state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.col = col;
        state.dir = 'asc';
      }

      // 헤더 active 상태 업데이트
      const tableEl = table === 'portfolio' ? '#portfolioTable'
                    : table === 'history'   ? '#historyTable'
                    :                         '#rebalanceTable';
      document.querySelectorAll(`${tableEl} .sort-btn`).forEach(b => {
        const isActive = b === btn;
        b.classList.toggle('sort-btn--active', isActive);
        b.setAttribute('data-dir', isActive ? state.dir : 'asc');
        b.querySelector('.sort-icon').textContent = '↑';
      });

      if (table === 'portfolio') {
        const latest = getLatestSavedData();
        if (latest) renderTable(latest);
      } else if (table === 'history') {
        const history = store.history();
        if (historyDates.length) showHistorySlide(history);
      } else {
        calcRebalance();
      }
    });

  });

}

function renderTable(data) {

  const totalEval   = data.reduce((s, r) => s + r.evalAmt, 0);

  const totalBuy    = data.reduce((s, r) => s + r.buyAmt,  0);

  const totalProfit = totalBuy > 0 ? ((totalEval - totalBuy) / totalBuy * 100) : 0;

  const prevQtyMap  = getPrevQtyMap();

  const groups = buildCatGroups(data, portfolioSort);

  let html = '';

  groups.forEach((group, gi) => {

    const catWeight = totalEval > 0 ? (group.evalAmt / totalEval * 100) : 0;

    const catProfit = group.buyAmt > 0 ? ((group.evalAmt - group.buyAmt) / group.buyAmt * 100) : 0;

    html += `

      <tr class="cat-group-row">

        <td>

          <button class="cat-row-toggle" data-gi="${gi}" aria-expanded="false">❯</button>

          <strong>${group.category}</strong>

          <span style="font-size:.8rem;color:var(--text-muted);font-weight:400;margin-left:.3rem">${group.rows.length}종목</span>

        </td>

        <td>-</td>

        <td>${fmt.money(group.buyAmt)}</td>

        <td>${fmt.money(group.evalAmt)}</td>

        <td class="${pctClass(catProfit)}">${fmt.pct(catProfit)}</td>

        <td>

          <div class="weight-cell">

            <div class="weight-bar-bg"><div class="weight-bar" style="width:${catWeight}%"></div></div>

            <span>${catWeight.toFixed(1)}%</span>

          </div>

        </td>

        <td>-</td>

      </tr>`;

    group.rows.forEach(row => {

      const weight     = totalEval > 0 ? (row.evalAmt / totalEval * 100) : 0;

      const prevQty    = prevQtyMap[row.name];

      const qtyChanged = prevQty !== undefined && prevQty !== row.qty;

      const btnClass   = qtyChanged ? 'btn-journal qty-changed' : 'btn-journal';

      const btnTitle   = qtyChanged

        ? `수량 변동 감지: ${fmt.number(prevQty)} → ${fmt.number(row.qty)}주`

        : '일지 기록';

      html += `

        <tr class="cat-stock-row" data-gi="${gi}" style="display:none">

          <td style="padding-left:1.8rem">${row.name}</td>

          <td>${fmt.number(row.qty)}</td>

          <td>${fmt.money(row.buyAmt)}</td>

          <td>${fmt.money(row.evalAmt)}</td>

          <td class="${pctClass(row.profit)}">${fmt.pct(row.profit)}</td>

          <td>

            <div class="weight-cell">

              <div class="weight-bar-bg"><div class="weight-bar" style="width:${weight}%"></div></div>

              <span>${weight.toFixed(1)}%</span>

            </div>

          </td>

          <td>

            <button class="${btnClass}" title="${btnTitle}"

              data-name="${row.name.replace(/"/g, '&quot;')}"

              data-qty="${row.qty}" data-prevqty="${prevQty ?? ''}"

            >${qtyChanged ? '📝 수량변동' : '📝 기록'}</button>

          </td>

        </tr>`;

    });

  });

  document.getElementById('tableBody').innerHTML = html;

  attachCatToggle('tableBody');

  document.querySelectorAll('#tableBody .btn-journal').forEach(btn => {

    btn.addEventListener('click', () => {

      const name    = btn.dataset.name;

      const qty     = parseFloat(btn.dataset.qty) || 0;

      const prevQty = btn.dataset.prevqty !== '' ? parseFloat(btn.dataset.prevqty) : null;

      openJournalModal(name, qty, prevQty);

    });

  });

  document.getElementById('tableFoot').innerHTML = `

    <tr>

      <td>합계</td><td>-</td>

      <td>${fmt.money(totalBuy)}</td>

      <td>${fmt.money(totalEval)}</td>

      <td class="${pctClass(totalProfit)}">${fmt.pct(totalProfit)}</td>

      <td>100%</td>

      <td></td>

    </tr>`;

 

  // nav로 대체

}


/* ═══════════════════════════════════════════════════════════
   ← 변경: 이전 날짜 수량 맵 계산
   현재 업로드 날짜 기준으로 그 이전 가장 최신 날짜와 비교
═══════════════════════════════════════════════════════════ */

function getPrevQtyMap() {

  const history = store.history();

  const dates   = Object.keys(history).sort();

  if (!dates.length) return {};

  // ← 변경: 업로드 날짜 input 값을 기준 날짜로 사용

  const uploadDate = document.getElementById('uploadDate').value;

  // 업로드 날짜보다 이전인 날짜 중 가장 최신 날짜를 찾음

  const prevDates = uploadDate

    ? dates.filter(d => d < uploadDate)

    : dates.slice(0, -1); // 날짜 미입력 시 최신 제외한 나머지

  if (!prevDates.length) return {};

  const prevDate = prevDates[prevDates.length - 1]; // 가장 최신 이전 날짜

  const prevData = history[prevDate] || [];

  const map = {};

  prevData.forEach(row => { map[row.name] = row.qty; });

  return map;

}

 

/* ═══════════════════════════════════════════════════════════

   차트 인스턴스

═══════════════════════════════════════════════════════════ */

let pieChartInst    = null;

let catPieChartInst = null;

let lineChartInst   = null;

let historyPieInst  = null;

 

function destroyChart(inst) { if (inst) inst.destroy(); }

 

/* ═══════════════════════════════════════════════════════════

   파이 차트 (종목별 + 카테고리별)

═══════════════════════════════════════════════════════════ */

function renderPieCharts(data) {

  const totalEval = data.reduce((s, r) => s + r.evalAmt, 0);

  const sorted    = [...data].sort((a, b) => b.evalAmt - a.evalAmt); // ← 변경: 비율 높은 순 정렬

  const colors    = sorted.map((_, i) => COLORS[i % COLORS.length]);

 

  destroyChart(pieChartInst);

  pieChartInst = new Chart(document.getElementById('pieChart'), {

    type: 'doughnut',

    data: {

      labels  : sorted.map(r => r.name),

      datasets: [{

        data           : sorted.map(r => r.evalAmt),

        backgroundColor: colors,

        borderColor    : '#fff',

        borderWidth    : 3,

        hoverOffset    : 10,

      }],

    },

    options: {

      responsive: true,

      plugins: {

        legend : { display: false },

        tooltip: { callbacks: { label: ctx => {

          const pct = (ctx.parsed / totalEval * 100).toFixed(1);

          return ` ${fmt.money(ctx.parsed)} (${pct}%)`;

        }}},

      },

      cutout: '60%',

    },

  });

 

  // ← 변경: 상위 8개만 표시, 나머지는 기타로 묶기

  const LEGEND_MAX  = 8;

  const topItems    = sorted.slice(0, LEGEND_MAX);

  const otherItems  = sorted.slice(LEGEND_MAX);

  const otherEval   = otherItems.reduce((s, r) => s + r.evalAmt, 0);

  const otherPct    = totalEval > 0 ? (otherEval / totalEval * 100).toFixed(1) : '0.0';

  document.getElementById('legendList').innerHTML =

    topItems.map((r, i) => {

      const pct = (r.evalAmt / totalEval * 100).toFixed(1);

      return `<div class="legend-item">

        <div class="legend-dot" style="background:${colors[i]}"></div>

        <span>${r.name} <strong>${pct}%</strong></span>

      </div>`;

    }).join('') +

    (otherItems.length ? `

      <div class="legend-item legend-item--others">

        <div class="legend-dot" style="background:#cbd5e1"></div>

        <span>기타 ${otherItems.length}종목 <strong>${otherPct}%</strong></span>

      </div>` : '');

 

  // 카테고리별도 비율 높은 순 정렬 ← 변경

  const catMap = {};

  data.forEach(r => { catMap[r.category] = (catMap[r.category] || 0) + r.evalAmt; });

  const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]); // ← 변경: 내림차순 정렬

  const catLabels  = catEntries.map(([k]) => k);

  const catValues  = catEntries.map(([, v]) => v);

  const catColors  = catLabels.map((_, i) => COLORS[(i + 5) % COLORS.length]);

 

  destroyChart(catPieChartInst);

  catPieChartInst = new Chart(document.getElementById('categoryPieChart'), {

    type: 'doughnut',

    data: {

      labels  : catLabels,

      datasets: [{

        data           : catValues,

        backgroundColor: catColors,

        borderColor    : '#fff',

        borderWidth    : 3,

        hoverOffset    : 10,

      }],

    },

    options: {

      responsive: true,

      plugins: {

        legend : { display: false },

        tooltip: { callbacks: { label: ctx => {

          const pct = (ctx.parsed / totalEval * 100).toFixed(1);

          return ` ${fmt.money(ctx.parsed)} (${pct}%)`;

        }}},

      },

      cutout: '60%',

    },

  });

 

  document.getElementById('categoryLegend').innerHTML = catLabels.map((cat, i) => {

    const pct = (catValues[i] / totalEval * 100).toFixed(1);

    return `<div class="legend-item">

      <div class="legend-dot" style="background:${catColors[i]}"></div>

      <span>${cat} <strong>${pct}%</strong></span>

    </div>`;

  }).join('');

 

  // nav로 대체

}

 

/* ═══════════════════════════════════════════════════════════

   라인 차트

═══════════════════════════════════════════════════════════ */

let lineChartRangeVal = 'ALL'; // 현재 선택된 기간

function filterDatesByRange(allDates, range) {
  if (range === 'ALL' || !allDates.length) return allDates;
  const latest = new Date(allDates[allDates.length - 1]);
  const months = { '3M': 3, '6M': 6, '1Y': 12, '3Y': 36 }[range] || 0;
  const cutoff = new Date(latest);
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutStr = cutoff.toISOString().slice(0, 10);
  const filtered = allDates.filter(d => d >= cutStr);
  return filtered.length ? filtered : allDates; // 해당 기간 데이터 없으면 전체 표시
}

function renderLineChart(history) {

  const allDates = Object.keys(history).sort();
  const dates    = filterDatesByRange(allDates, lineChartRangeVal);

  const totals  = dates.map(d => history[d].reduce((s, r) => s + r.evalAmt, 0)); // ← 변경: 평가금액

  const buyAmts = dates.map(d => history[d].reduce((s, r) => s + r.buyAmt,  0)); // ← 변경: 원금

 

  destroyChart(lineChartInst);

  lineChartInst = new Chart(document.getElementById('lineChart'), {

    type: 'line',

    data: {

      labels  : dates,

      datasets: [

        { // ← 변경: 평가금액 (위쪽 라인 — 원금 라인까지 채움)

          label          : '평가금액',

          data           : totals,

          borderColor    : '#4f46e5',

          backgroundColor: 'rgba(79,70,229,.15)',

          borderWidth    : 2.5,

          pointBackgroundColor: '#4f46e5',

          pointRadius    : 4,

          pointHoverRadius: 7,

          fill           : 1,          // ← 변경: dataset[1](원금)까지만 채움

          tension        : 0.35,

          order          : 1,

        },

        { // ← 변경: 원금 (아래쪽 라인 — 바닥까지 채움)

          label          : '원금',

          data           : buyAmts,

          borderColor    : '#94a3b8',

          backgroundColor: 'rgba(148,163,184,.18)',

          borderWidth    : 2,

          pointBackgroundColor: '#94a3b8',

          pointRadius    : 4,

          pointHoverRadius: 7,

          fill           : 'origin',   // ← 변경: 바닥(0)까지 채움

          tension        : 0.35,

          order          : 2,

        },

      ],

    },

    options: {

      responsive: true,

      maintainAspectRatio: false,

      interaction: { mode: 'index', intersect: false },

      plugins: {

        legend: { // ← 변경: 범례 표시 (평가금액 / 원금)

          display : true,

          position: 'top',

          labels  : { font: { size: 12 }, boxWidth: 12, padding: 16 },

        },

        tooltip: {

          callbacks: {

            label: ctx => {

              const val    = ctx.parsed.y;

              const label  = ctx.dataset.label;

              if (label === '평가금액') {

                const buyVal = ctx.chart.data.datasets[1].data[ctx.dataIndex] || 0;

                const profit = val - buyVal;

                const pct    = buyVal > 0 ? (profit / buyVal * 100).toFixed(1) : '0.0';

                const sign   = profit >= 0 ? '+' : '';

                return [

                  ` 평가금액: ${fmt.money(Math.round(val))}`,

                  ` 수익: ${sign}${fmt.money(Math.round(profit))} (${sign}${pct}%)`, // ← 변경: 툴팁에 수익금액/수익률 표시

                ];

              }

              return ` 원금: ${fmt.money(Math.round(val))}`;

            },

          },

        },

      },

      scales: {

        x: {
          grid: { color: '#f1f5f9' },
          ticks: {
            font: { size: 11 },
            maxTicksLimit: dates.length <= 12 ? dates.length
                         : dates.length <= 24  ? 12
                         : dates.length <= 60  ? 10
                         : 8,
            maxRotation: dates.length > 16 ? 35 : 0,
            minRotation: 0,
            callback: function(_, idx) {
              const d = dates[idx];
              if (!d) return '';
              // 날짜 많을 때는 연.월만 표시
              if (dates.length > 24) return d.slice(2, 7).replace('-', '.');   // 24.03
              if (dates.length > 12) return d.slice(5);                         // 03-15
              return d;                                                          // 2024-03-15
            },
          },
        },

        y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 },

          callback: v => (v / 10000).toFixed(0) + '만' }},

      },

    },

  });

 

  // nav로 대체

}

 

/* ═══════════════════════════════════════════════════════════

   히스토리 파이 슬라이더

═══════════════════════════════════════════════════════════ */

let historyDates = [];

let historyIndex = 0;

 

function renderHistoryPie(history) {

  historyDates = Object.keys(history).sort();

  if (!historyDates.length) return;

  historyIndex = historyDates.length - 1;

  // nav로 대체

  showHistorySlide(history);

}

 

function showHistorySlide(history) {

  const date      = historyDates[historyIndex];

  const rawData   = history[date];

  const data      = [...rawData].sort((a, b) => b.evalAmt - a.evalAmt); // ← 변경: 비율 높은 순 정렬

  const totalEval = data.reduce((s, r) => s + r.evalAmt, 0);

  const totalBuy  = data.reduce((s, r) => s + r.buyAmt,  0);

  const totalProfit = totalBuy > 0 ? ((totalEval - totalBuy) / totalBuy * 100) : 0;

  const colors    = data.map((_, i) => COLORS[i % COLORS.length]);

 

  document.getElementById('currentDateLabel').textContent = date;

  document.getElementById('prevDate').disabled = historyIndex === 0;

  document.getElementById('nextDate').disabled = historyIndex === historyDates.length - 1;

 

  destroyChart(historyPieInst);

  historyPieInst = new Chart(document.getElementById('historyPieChart'), {

    type: 'doughnut',

    data: {

      labels  : data.map(r => r.name),

      datasets: [{

        data           : data.map(r => r.evalAmt),

        backgroundColor: colors,

        borderColor    : '#fff',

        borderWidth    : 3,

        hoverOffset    : 8,

      }],

    },

    options: {

      responsive: true,

      plugins: {

        legend : { display: false },

        tooltip: { callbacks: { label: ctx => {

          const pct = (ctx.parsed / totalEval * 100).toFixed(1);

          return ` ${fmt.money(ctx.parsed)} (${pct}%)`;

        }}},

      },

      cutout: '58%',

    },

  });

 

  // ← 변경: 상위 8개만 표시, 나머지는 기타로 묶기

  const hTopItems   = data.slice(0, LEGEND_MAX);

  const hOtherItems = data.slice(LEGEND_MAX);

  const hOtherEval  = hOtherItems.reduce((s, r) => s + r.evalAmt, 0);

  const hOtherPct   = totalEval > 0 ? (hOtherEval / totalEval * 100).toFixed(1) : '0.0';

  document.getElementById('historyLegend').innerHTML =

    hTopItems.map((r, i) => {

      const pct = (r.evalAmt / totalEval * 100).toFixed(1);

      return `<div class="legend-item">

        <div class="legend-dot" style="background:${colors[i]}"></div>

        <span>${r.name} <strong>${pct}%</strong></span>

      </div>`;

    }).join('') +

    (hOtherItems.length ? `

      <div class="legend-item legend-item--others">

        <div class="legend-dot" style="background:#cbd5e1"></div>

        <span>기타 ${hOtherItems.length}종목 <strong>${hOtherPct}%</strong></span>

      </div>` : '');

 

  const hGroups = buildCatGroups(data, historySort);

  let hHtml = '';

  hGroups.forEach((group, gi) => {

    const catWeight = totalEval > 0 ? (group.evalAmt / totalEval * 100) : 0;

    const catProfit = group.buyAmt > 0 ? ((group.evalAmt - group.buyAmt) / group.buyAmt * 100) : 0;

    hHtml += `

      <tr class="cat-group-row">

        <td>

          <button class="cat-row-toggle" data-gi="${gi}" aria-expanded="false">❯</button>

          <strong>${group.category}</strong>

          <span style="font-size:.8rem;color:var(--text-muted);font-weight:400;margin-left:.3rem">${group.rows.length}종목</span>

        </td>

        <td>-</td>

        <td>${fmt.money(group.buyAmt)}</td>

        <td>${fmt.money(group.evalAmt)}</td>

        <td class="${pctClass(catProfit)}">${fmt.pct(catProfit)}</td>

        <td>

          <div class="weight-cell">

            <div class="weight-bar-bg"><div class="weight-bar" style="width:${catWeight}%"></div></div>

            <span>${catWeight.toFixed(1)}%</span>

          </div>

        </td>

      </tr>`;

    group.rows.forEach(row => {

      const weight = totalEval > 0 ? (row.evalAmt / totalEval * 100) : 0;

      hHtml += `

        <tr class="cat-stock-row" data-gi="${gi}" style="display:none">

          <td style="padding-left:1.8rem">${row.name}</td>

          <td>${fmt.number(row.qty)}</td>

          <td>${fmt.money(row.buyAmt)}</td>

          <td>${fmt.money(row.evalAmt)}</td>

          <td class="${pctClass(row.profit)}">${fmt.pct(row.profit)}</td>

          <td>

            <div class="weight-cell">

              <div class="weight-bar-bg"><div class="weight-bar" style="width:${weight}%"></div></div>

              <span>${weight.toFixed(1)}%</span>

            </div>

          </td>

        </tr>`;

    });

  });

  document.getElementById('historyTableBody').innerHTML = hHtml;

  attachCatToggle('historyTableBody');

 

  document.getElementById('historyTableFoot').innerHTML = `

    <tr>

      <td>합계</td><td>-</td>

      <td>${fmt.money(totalBuy)}</td>

      <td>${fmt.money(totalEval)}</td>

      <td class="${pctClass(totalProfit)}">${fmt.pct(totalProfit)}</td>

      <td>100%</td>

    </tr>`;

}

 

document.getElementById('prevDate').addEventListener('click', () => {
  if (historyIndex > 0) { historyIndex--; showHistorySlide(store.history()); }
});

document.getElementById('nextDate').addEventListener('click', () => {
  if (historyIndex < historyDates.length - 1) { historyIndex++; showHistorySlide(store.history()); }
});

/* ── 히스토리 날짜 캘린더 팝업 ── */
(function() {
  const btnEl      = document.getElementById('histDateBtn');
  const popEl      = document.getElementById('histCalPop');
  const dayView    = document.getElementById('histCalDayView');
  const monthView  = document.getElementById('histCalMonthView');
  const gridEl     = document.getElementById('histCalGrid');
  const monthLbl   = document.getElementById('histCalMonthLabel');  // 일 뷰 헤더 버튼
  const prevBtn    = document.getElementById('histCalPrev');
  const nextBtn    = document.getElementById('histCalNext');
  const yearLbl    = document.getElementById('histCalYearLabel');   // 월 뷰 헤더 연도
  const monthGrid  = document.getElementById('histCalMonthGrid');
  const yearPrev   = document.getElementById('histCalYearPrev');
  const yearNext   = document.getElementById('histCalYearNext');

  let calYear = 0, calMonth = 0;
  let calView = 'day'; // 'day' | 'month'

  // ── 데이터 있는 연·월 집합 계산
  function dataMonthSet() {
    const s = new Set();
    historyDates.forEach(d => s.add(d.slice(0, 7))); // "YYYY-MM"
    return s;
  }
  function dataYearSet() {
    const s = new Set();
    historyDates.forEach(d => s.add(d.slice(0, 4))); // "YYYY"
    return s;
  }

  // ── 열기 / 닫기
  function openCal() {
    if (!historyDates.length) return;
    const cur = historyDates[historyIndex] || historyDates[historyDates.length - 1];
    calYear  = parseInt(cur.slice(0, 4));
    calMonth = parseInt(cur.slice(5, 7)) - 1;
    calView  = 'day';
    render();
    popEl.classList.remove('hidden');
  }
  function closeCal() { popEl.classList.add('hidden'); }

  // ── 일 뷰 렌더
  function renderDayView() {
    dayView.classList.remove('hidden');
    monthView.classList.add('hidden');

    const dataSet  = new Set(historyDates);
    const selected = historyDates[historyIndex];
    const y = calYear, m = calMonth;

    monthLbl.textContent = `${y}년 ${m + 1}월 ▾`;

    const firstDay = new Date(y, m, 1).getDay();
    const lastDate = new Date(y, m + 1, 0).getDate();
    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<span></span>';
    for (let d = 1; d <= lastDate; d++) {
      const ds     = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const has    = dataSet.has(ds);
      const isSel  = ds === selected;
      html += `<button class="hist-cal-day${has ? ' has-data' : ''}${isSel ? ' selected' : ''}"
        ${has ? `data-date="${ds}"` : 'disabled'}>${d}</button>`;
    }
    gridEl.innerHTML = html;

    gridEl.querySelectorAll('.hist-cal-day.has-data').forEach(cell => {
      cell.addEventListener('click', () => {
        const idx = historyDates.indexOf(cell.dataset.date);
        if (idx !== -1) { historyIndex = idx; showHistorySlide(store.history()); }
        closeCal();
      });
    });

    const minYear = parseInt(historyDates[0].slice(0,4));
    const maxYear = parseInt(historyDates[historyDates.length-1].slice(0,4));
    prevBtn.disabled = (y === minYear && m === 0);
    nextBtn.disabled = (y === maxYear && m === 11);
  }

  // ── 월 선택 뷰 렌더
  function renderMonthView() {
    dayView.classList.add('hidden');
    monthView.classList.remove('hidden');

    yearLbl.textContent = `${calYear}년`;
    const mSet = dataMonthSet();
    const ySet = dataYearSet();
    const selMon = historyDates[historyIndex]?.slice(0, 7); // "YYYY-MM"

    const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    let html = '';
    MONTHS.forEach((name, i) => {
      const key    = `${calYear}-${String(i+1).padStart(2,'0')}`;
      const has    = mSet.has(key);
      const isSel  = key === selMon;
      html += `<button class="hist-cal-mon${has ? ' has-data' : ''}${isSel ? ' selected' : ''}"
        ${has ? `data-mi="${i}"` : 'disabled'}>${name}</button>`;
    });
    monthGrid.innerHTML = html;

    monthGrid.querySelectorAll('.hist-cal-mon.has-data').forEach(cell => {
      cell.addEventListener('click', () => {
        calMonth = parseInt(cell.dataset.mi);
        calView  = 'day';
        render();
      });
    });

    const minYear = parseInt(historyDates[0].slice(0,4));
    const maxYear = parseInt(historyDates[historyDates.length-1].slice(0,4));
    yearPrev.disabled = (calYear <= minYear && !ySet.has(String(calYear - 1)));
    yearNext.disabled = (calYear >= maxYear && !ySet.has(String(calYear + 1)));
  }

  // ── 뷰 분기
  function render() {
    calView === 'day' ? renderDayView() : renderMonthView();
  }

  // ── 이벤트
  btnEl.addEventListener('click', (e) => {
    e.stopPropagation();
    popEl.classList.contains('hidden') ? openCal() : closeCal();
  });

  // 일 뷰: 월 이동
  prevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
    render();
  });
  nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
    render();
  });

  // 일 뷰: 년월 라벨 → 월 뷰 전환
  monthLbl.addEventListener('click', (e) => {
    e.stopPropagation();
    calView = 'month';
    render();
  });

  // 월 뷰: 연도 이동
  yearPrev.addEventListener('click', (e) => { e.stopPropagation(); calYear--; renderMonthView(); });
  yearNext.addEventListener('click', (e) => { e.stopPropagation(); calYear++; renderMonthView(); });

  // 팝업 외부 클릭 닫기
  document.addEventListener('click', (e) => {
    if (!popEl.contains(e.target) && e.target !== btnEl) closeCal();
  });
})();

bindSortButtons();

// 기간 세그먼트 컨트롤
document.querySelectorAll('#lineChartRange .range-seg__btn').forEach(btn => {
  btn.addEventListener('click', () => {
    lineChartRangeVal = btn.dataset.range;
    document.querySelectorAll('#lineChartRange .range-seg__btn').forEach(b =>
      b.classList.toggle('range-seg__btn--active', b === btn)
    );
    renderLineChart(store.history());
  });
});

/* ═══════════════════════════════════════════════════════════

   전체 히스토리 렌더링

═══════════════════════════════════════════════════════════ */

function renderAllHistory() {

  const history = store.history();

  const dates   = Object.keys(history).sort();

  if (!dates.length) return;

 

  renderLineChart(history);

  renderHistoryPie(history);

 

  const latest = dates[dates.length - 1];

  // categoryMap을 적용해서 최신 카테고리로 표시
  const catMap = store.categoryMap();

  const latestWithCat = history[latest].map(row => ({

    ...row,

    category: catMap[row.name] || autoCategory(row.name),

  }));

  renderTable(latestWithCat);

  renderPieCharts(latestWithCat);

  renderContribDateSelects();  // ← 변경: 기여도 날짜 셀렉트 갱신

  renderCompareDateSelects();  // ← 변경: 비교 날짜 셀렉트 갱신

  renderReportMonthSelect();   // ← 변경: 리포트 월 셀렉트 갱신

}

 

/* ═══════════════════════════════════════════════════════════

   CSV 업로드

═══════════════════════════════════════════════════════════ */

document.getElementById('fileInput').addEventListener('change', e => {

  const file = e.target.files[0];

  if (file) readCSVFile(file);

});

 

const uploadArea = document.getElementById('uploadArea');

uploadArea.addEventListener('dragover', e => {

  e.preventDefault(); uploadArea.classList.add('drag-over');

});

uploadArea.addEventListener('dragleave', () => {

  uploadArea.classList.remove('drag-over');

});

uploadArea.addEventListener('drop', e => {

  e.preventDefault(); uploadArea.classList.remove('drag-over');

  const file = e.dataTransfer.files[0];

  if (file) readCSVFile(file);

});

 

function readCSVFile(file) {

  if (!file.name.endsWith('.csv')) {

    showStatus('CSV 파일만 업로드 가능합니다.', 'error'); return;

  }

  const reader = new FileReader();

  reader.onload = ev => {

    try {

      parsedData = parseCSV(ev.target.result);

      showStatus(`✅ ${parsedData.length}개 종목을 불러왔습니다. 기준 날짜를 선택해주세요.`);

      renderTable(parsedData);

      renderPieCharts(parsedData);

      document.getElementById('saveBtn').disabled = false;

      // 날짜 선택 팝업 열기
      const picker = document.getElementById('datePickerModal');
      const pickerInput = document.getElementById('datePickerInput');
      pickerInput.valueAsDate = new Date();
      picker.classList.remove('hidden');

    } catch (err) {

      showStatus('❌ 파싱 오류: ' + err.message, 'error');

    }

  };

  reader.readAsText(file, 'UTF-8');

}

 

/* ═══════════════════════════════════════════════════════════

   저장

═══════════════════════════════════════════════════════════ */

document.getElementById('saveBtn').addEventListener('click', () => {

  if (!parsedData) return;

  const date = document.getElementById('uploadDate').value;

  if (!date) { showStatus('⚠️ 날짜를 선택해주세요.', 'error'); return; }

 

  const history = store.history();

  history[date] = parsedData;

  store.saveHistory(history);

 

  showStatus(`💾 ${date} 데이터가 저장되었습니다.`);

  document.getElementById('saveBtn').disabled = true;

  document.getElementById('fileInput').value  = '';

  renderAllHistory();

  renderDateChips(); // ← 날짜 칩 갱신

});



/* ═══════════════════════════════════════════════════════════

   날짜 선택 팝업 이벤트

═══════════════════════════════════════════════════════════ */

document.getElementById('datePickerCancel').addEventListener('click', () => {

  document.getElementById('datePickerModal').classList.add('hidden');

});

document.getElementById('datePickerConfirm').addEventListener('click', () => {

  const date = document.getElementById('datePickerInput').value;

  if (!date) { alert('날짜를 선택해주세요.'); return; }

  if (!parsedData) return;

  // 저장 전: 기존 categoryMap에 없는 종목 = 신규 종목
  const existingMap = store.categoryMap();

  const newStockNames = new Set(

    parsedData.filter(row => !existingMap[row.name]).map(row => row.name)

  );

  const history = store.history();

  history[date] = parsedData;

  store.saveHistory(history);

  document.getElementById('uploadDate').value = date;

  document.getElementById('saveBtn').disabled = true;

  document.getElementById('fileInput').value  = '';

  document.getElementById('datePickerModal').classList.add('hidden');

  showStatus(`💾 ${date} 데이터가 저장되었습니다.`);

  renderAllHistory();

  renderDateChips();

  renderCategorySection(parsedData, newStockNames);

  navigateTo('categorySection');

});



/* ═══════════════════════════════════════════════════════════

   전체 삭제

═══════════════════════════════════════════════════════════ */

document.getElementById('clearBtn').addEventListener('click', () => {

  if (!confirm('저장된 모든 데이터를 삭제할까요?')) return;

  localStorage.removeItem(STORAGE_KEY);

  parsedData = null;

  // ← 변경: 존재하지 않는 ID 참조 제거, 차트 destroy + 화면 초기화

  destroyChart(pieChartInst);

  destroyChart(catPieChartInst);

  destroyChart(lineChartInst);

  destroyChart(historyPieInst);

  pieChartInst = catPieChartInst = lineChartInst = historyPieInst = null;

  // ← 변경: 대시보드 테이블/차트 영역 비우기

  document.getElementById('tableBody').innerHTML       = '';

  document.getElementById('tableFoot').innerHTML       = '';

  document.getElementById('legendList').innerHTML      = '';

  document.getElementById('categoryLegend').innerHTML  = '';

  // ← 변경: 히스토리 슬라이더 초기화

  document.getElementById('historyTableBody').innerHTML  = '';

  document.getElementById('historyTableFoot').innerHTML  = '';

  document.getElementById('historyLegend').innerHTML     = '';

  document.getElementById('currentDateLabel').textContent = '';

  historyDates = [];

  historyIndex = 0;

  renderDateChips();

  showStatus('🗑 모든 데이터가 삭제되었습니다.', 'error');

});

 

/* ═══════════════════════════════════════════════════════════

   내보내기 / 가져오기

═══════════════════════════════════════════════════════════ */

// ← 변경: 내보내기 공통 함수 (배너 버튼과 공유)

function doExport() {

  const data = {

    history     : store.history(),

    categoryMap : store.categoryMap(),

    categoryList: store.categoryList(),

    target      : store.target(),

    journal     : store.journal(),

    dividend    : store.dividend(),

  };

  // ← 변경: 히스토리 없어도 일지/배당금 데이터가 있으면 내보내기 허용

  const hasData = Object.keys(data.history).length

    || data.journal.length

    || data.dividend.length;

  if (!hasData) {

    showStatus('저장된 데이터가 없습니다.', 'error'); return false;

  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });

  const url  = URL.createObjectURL(blob);

  const a    = document.createElement('a');

  a.href     = url;

  a.download = `portfolio_backup_${new Date().toISOString().slice(0, 10)}.json`;

  a.click();

  URL.revokeObjectURL(url);

  store.saveLastBackup(); // ← 변경: 백업 날짜 갱신

  renderBackupBanner();  // ← 변경: 배너 숨김 처리

  showStatus('✅ 데이터를 내보냈습니다.');

  return true;

}

document.getElementById('exportBtn').addEventListener('click', doExport);

 

document.getElementById('importInput').addEventListener('change', e => {

  const file = e.target.files[0];

  if (!file) return;

  const reader = new FileReader();

  reader.onload = ev => {

    try {

      const imported = JSON.parse(ev.target.result);

      if (imported.history)      store.saveHistory(Object.assign(store.history(), imported.history));

      if (imported.categoryMap)  store.saveCategoryMap(Object.assign(store.categoryMap(), imported.categoryMap));

      if (imported.categoryList) store.saveCategoryList(imported.categoryList);

      if (imported.target)       store.saveTarget(imported.target);

      if (imported.journal)      store.saveJournal(imported.journal);

      if (imported.dividend)     store.saveDividend(imported.dividend); // ← 변경: 배당금도 함께 가져오기

      renderAllHistory();

      renderDateChips();

      renderJournalSection();

      renderDividendSection(); // ← 변경

      showStatus('✅ 데이터를 가져왔습니다!');

    } catch {

      showStatus('❌ 올바른 백업 파일이 아닙니다.', 'error');

    }

  };

  reader.readAsText(file);

});

 

/* ═══════════════════════════════════════════════════════════

   상태 메시지

═══════════════════════════════════════════════════════════ */

function showStatus(msg, type = 'success') {

  const el = document.getElementById('uploadStatus');

  el.textContent = msg;

  el.className   = `upload-status ${type}`;

  el.classList.remove('hidden');

  setTimeout(() => el.classList.add('hidden'), 5000);

}


/* ═══════════════════════════════════════════════════════════
   ← 변경: 투자 일지 모달 관련 상태
═══════════════════════════════════════════════════════════ */

let journalEditId    = null; // 수정 중인 일지 id (null이면 신규)
let selectedEtags    = new Set();


/* ─── 모달 열기 ─── */

function openJournalModal(stockName = '', currentQty = null, prevQty = null) {

  journalEditId = null;

  selectedEtags = new Set();


  // 폼 초기화

  document.getElementById('jDate').value  = new Date().toISOString().slice(0, 10);

  document.getElementById('jName').value  = stockName;

  document.getElementById('jQty').value   = '';

  document.getElementById('jPrice').value = '';

  document.getElementById('jReason').value = '';

  document.querySelectorAll('.etag').forEach(t => t.classList.remove('selected'));

  document.querySelector('input[name="jType"][value="buy"]').checked = true;

  document.getElementById('modalTitle').textContent = '✏️ 투자 일지 작성';


  // 종목명 datalist 채우기

  updateJNameDatalist();


  // 수량 변동 배너

  const banner = document.getElementById('qtyChangeBanner');

  if (prevQty !== null && prevQty !== currentQty) {

    const diff    = currentQty - prevQty;

    const diffStr = diff > 0 ? `+${fmt.number(diff)}주 (매수 추정)` : `${fmt.number(diff)}주 (매도 추정)`;

    banner.textContent = `📊 이전 날짜 대비 수량 변동 감지: ${fmt.number(prevQty)} → ${fmt.number(currentQty)}주 (${diffStr})`;

    banner.classList.remove('hidden');

    // 수량 자동 채우기

    document.getElementById('jQty').value = Math.abs(diff);

    // 매수/매도 자동 선택

    const autoType = diff > 0 ? 'buy' : 'sell';

    document.querySelector(`input[name="jType"][value="${autoType}"]`).checked = true;

  } else {

    banner.classList.add('hidden');

  }


  document.getElementById('journalModal').classList.remove('hidden');

}


/* ─── 수정용 모달 열기 ─── */

function openJournalEditModal(id) {

  const journals = store.journal();

  const entry    = journals.find(j => j.id === id);

  if (!entry) return;


  journalEditId = id;

  selectedEtags = new Set(entry.tags || []);


  document.getElementById('jDate').value   = entry.date;

  document.getElementById('jName').value   = entry.name;

  document.getElementById('jQty').value    = entry.qty   || '';

  document.getElementById('jPrice').value  = entry.price || '';

  document.getElementById('jReason').value = entry.reason || '';

  document.getElementById('modalTitle').textContent = '✏️ 투자 일지 수정';

  document.getElementById('qtyChangeBanner').classList.add('hidden');


  const typeRadio = document.querySelector(`input[name="jType"][value="${entry.type}"]`);

  if (typeRadio) typeRadio.checked = true;


  document.querySelectorAll('.etag').forEach(t => {

    t.classList.toggle('selected', selectedEtags.has(t.dataset.tag));

  });


  updateJNameDatalist();

  document.getElementById('journalModal').classList.remove('hidden');

}


/* ─── datalist 갱신 ─── */

function updateJNameDatalist() {

  const history = store.history();

  const dates   = Object.keys(history).sort();

  const names   = new Set();

  dates.forEach(d => history[d].forEach(r => names.add(r.name)));

  document.getElementById('jNameList').innerHTML =

    [...names].map(n => `<option value="${n}">`).join('');

}


/* ─── 모달 닫기 ─── */

function closeJournalModal() {

  document.getElementById('journalModal').classList.add('hidden');

  journalEditId = null;

  selectedEtags = new Set();

}


document.getElementById('modalClose').addEventListener('click',  closeJournalModal);

document.getElementById('modalCancel').addEventListener('click', closeJournalModal);

document.getElementById('journalModal').addEventListener('click', e => {

  if (e.target === document.getElementById('journalModal')) closeJournalModal();

});


/* ─── 감정 태그 토글 ─── */

document.getElementById('emotionTags').addEventListener('click', e => {

  if (!e.target.classList.contains('etag')) return;

  const tag = e.target.dataset.tag;

  if (selectedEtags.has(tag)) {

    selectedEtags.delete(tag);

    e.target.classList.remove('selected');

  } else {

    selectedEtags.add(tag);

    e.target.classList.add('selected');

  }

});


/* ─── 일지 저장 ─── */

document.getElementById('modalSave').addEventListener('click', () => {

  const name   = document.getElementById('jName').value.trim();

  const date   = document.getElementById('jDate').value;

  const type   = document.querySelector('input[name="jType"]:checked').value;

  const reason = document.getElementById('jReason').value.trim();

  const qty    = parseFloat(document.getElementById('jQty').value)   || 0;

  const price  = parseFloat(document.getElementById('jPrice').value) || 0;


  if (!name) { alert('종목명을 입력해주세요.'); return; }

  if (!date) { alert('날짜를 선택해주세요.');   return; }


  const journals = store.journal();


  if (journalEditId) {

    // 수정

    const idx = journals.findIndex(j => j.id === journalEditId);

    if (idx !== -1) {

      journals[idx] = { ...journals[idx], date, name, type, qty, price, reason, tags: [...selectedEtags] };

    }

  } else {

    // 신규

    journals.push({

      id    : Date.now().toString(),

      date, name, type, qty, price, reason,

      tags  : [...selectedEtags],

    });

  }


  store.saveJournal(journals);

  closeJournalModal();

  renderJournalSection();

  showStatus('📓 일지가 저장되었습니다!');

});


/* ═══════════════════════════════════════════════════════════
   ← 변경: 투자 일지 섹션 — 날짜순 탭을 캘린더 뷰로 교체
═══════════════════════════════════════════════════════════ */

let journalActiveTab  = 'timeline';
let calendarYear      = new Date().getFullYear();
let calendarMonth     = new Date().getMonth(); // 0-indexed
let calendarSelected  = null; // 선택된 날짜 'YYYY-MM-DD'


function renderJournalSection() {

  const journals = store.journal();

  if (journalActiveTab === 'timeline') {

    renderJournalCalendar(journals);

  } else {

    renderJournalByStock(journals);

  }

}


/* ── 캘린더 렌더 ─────────────────────────────────────────── */

function renderJournalCalendar(journals) {

  const pane = document.getElementById('journalTimeline');

  // 날짜별 일지 맵 생성 { 'YYYY-MM-DD': [journal, ...] }

  const dateMap = {};

  journals.forEach(j => {

    if (!dateMap[j.date]) dateMap[j.date] = [];

    dateMap[j.date].push(j);

  });

  // 해당 월 날짜 계산

  const firstDay  = new Date(calendarYear, calendarMonth, 1).getDay(); // 0=일
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  const monthStr  = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}`;

  const monthLabel = `${calendarYear}년 ${calendarMonth + 1}월`;

  // 날짜 셀 생성

  const cells = [];

  for (let i = 0; i < firstDay; i++) cells.push(`<div class="cal-cell cal-cell--empty"></div>`);

  for (let d = 1; d <= daysInMonth; d++) {

    const dateStr  = `${monthStr}-${String(d).padStart(2, '0')}`;

    const dayJournals = dateMap[dateStr] || [];

    const isSelected  = calendarSelected === dateStr;

    const isToday     = dateStr === new Date().toISOString().slice(0, 10);

    // 매수/매도/관찰 점 (최대 3개 종류)

    const types = [...new Set(dayJournals.map(j => j.type))];

    const dots  = types.map(t => `<span class="cal-dot cal-dot--${t}"></span>`).join('');

    cells.push(`
      <div class="cal-cell ${dayJournals.length ? 'cal-cell--has-entry' : ''} ${isSelected ? 'cal-cell--selected' : ''} ${isToday ? 'cal-cell--today' : ''}"
           data-date="${dateStr}">
        <span class="cal-day-num">${d}</span>
        ${dots ? `<div class="cal-dots">${dots}</div>` : ''}
      </div>
    `);

  }

  // 선택된 날짜 일지 HTML

  let selectedHTML = '';

  if (calendarSelected && dateMap[calendarSelected]) {

    const dayJournals = dateMap[calendarSelected];

    selectedHTML = `
      <div class="cal-detail">
        <div class="cal-detail-title">📅 ${calendarSelected} · ${dayJournals.length}건</div>
        <div class="journal-timeline-list" style="margin-top:.8rem">
          ${dayJournals.map(j => journalCardHTML(j)).join('')}
        </div>
      </div>
    `;

  } else if (calendarSelected) {

    selectedHTML = `<p class="journal-empty" style="margin-top:2rem">이 날 작성된 일지가 없어요.</p>`;

  } else {

    selectedHTML = `<p class="journal-empty cal-detail-placeholder">📅 날짜를 선택하면 일지가 표시됩니다.</p>`;

  }

  pane.innerHTML = `
    <div class="cal-layout">
      <div class="cal-left">
        <div class="cal-wrap">
          <div class="cal-nav">
            <button class="btn btn-outline btn-sm" id="calPrevBtn">◀</button>
            <span class="cal-month-label">${monthLabel}</span>
            <button class="btn btn-outline btn-sm" id="calNextBtn">▶</button>
          </div>
          <div class="cal-grid">
            <div class="cal-dow">일</div><div class="cal-dow">월</div>
            <div class="cal-dow">화</div><div class="cal-dow">수</div>
            <div class="cal-dow">목</div><div class="cal-dow">금</div>
            <div class="cal-dow">토</div>
            ${cells.join('')}
          </div>
          <div class="cal-legend">
            <span class="cal-dot cal-dot--buy"></span> 매수
            <span class="cal-dot cal-dot--sell"></span> 매도
            <span class="cal-dot cal-dot--watch"></span> 관찰
          </div>
        </div>
      </div>
      <div class="cal-right">
        ${calendarSelected && dateMap[calendarSelected]
          ? `<div class="cal-detail-title">📅 ${calendarSelected} · ${dateMap[calendarSelected].length}건</div>
             <div class="cal-detail-scroll">${dateMap[calendarSelected].map(j => journalCardHTML(j)).join('')}</div>`
          : selectedHTML
        }
      </div>
    </div>
  `;

  // 월 이동 버튼

  document.getElementById('calPrevBtn').addEventListener('click', () => {

    calendarMonth--;

    if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }

    calendarSelected = null;

    renderJournalCalendar(store.journal());

  });

  document.getElementById('calNextBtn').addEventListener('click', () => {

    calendarMonth++;

    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }

    calendarSelected = null;

    renderJournalCalendar(store.journal());

  });

  // 날짜 셀 클릭

  pane.querySelectorAll('.cal-cell[data-date]').forEach(cell => {

    cell.addEventListener('click', () => {

      const d = cell.dataset.date;

      calendarSelected = calendarSelected === d ? null : d;

      renderJournalCalendar(store.journal());

    });

  });

  if (selectedHTML) bindJournalCardEvents(pane);

}


let journalStockFilter = 'all'; // ← 변경: 종목별 탭 필터 상태

function renderJournalByStock(journals) {

  const pane  = document.getElementById('journalByStock');

  const group = {};

  journals.forEach(j => {

    if (!group[j.name]) group[j.name] = [];

    group[j.name].push(j);

  });

  if (!Object.keys(group).length) {

    pane.innerHTML = '<div class="journal-empty">📭 작성된 일지가 없습니다.</div>';

    return;

  }

  // ← 변경: 필터에 없는 종목이 선택된 경우 초기화

  const stockNames = Object.keys(group).sort((a, b) => a.localeCompare(b));

  if (journalStockFilter !== 'all' && !group[journalStockFilter]) {

    journalStockFilter = 'all';

  }

  // ← 변경: 필터 버튼 렌더링

  const filterHTML = `

    <div class="journal-filter-bar">

      <button class="journal-filter-btn ${journalStockFilter === 'all' ? 'active' : ''}" data-filter="all">

        전체 <span class="filter-count">${journals.length}</span>

      </button>

      ${stockNames.map(name => `

        <button class="journal-filter-btn ${journalStockFilter === name ? 'active' : ''}" data-filter="${name}">

          ${name} <span class="filter-count">${group[name].length}</span>

        </button>

      `).join('')}

    </div>

  `;

  // ← 변경: 필터 적용된 그룹만 렌더링

  const filteredEntries = journalStockFilter === 'all'

    ? stockNames

    : stockNames.filter(n => n === journalStockFilter);

  const PREVIEW_COUNT = 3; // 기본 표시 건수

  const groupsHTML = filteredEntries.map(name => {

    const sorted = [...group[name]].sort((a, b) => b.date.localeCompare(a.date));
    const preview = sorted.slice(0, PREVIEW_COUNT);
    const rest    = sorted.slice(PREVIEW_COUNT);
    const hasMore = rest.length > 0;

    return `
      <div class="jstock-accordion">
        <button class="jstock-header" data-stock="${escapeHtml(name)}" aria-expanded="true">
          <span class="jstock-header-left">
            <span class="jstock-toggle-icon">❯</span>
            <span class="jstock-name">📌 ${escapeHtml(name)}</span>
          </span>
          <span class="jstock-count">${sorted.length}건</span>
        </button>
        <div class="jstock-body">
          <div class="jstock-preview">
            ${preview.map(j => journalCardHTML(j)).join('')}
          </div>
          ${hasMore ? `
          <div class="jstock-more hidden">
            ${rest.map(j => journalCardHTML(j)).join('')}
          </div>
          <button class="jstock-more-btn" data-total="${rest.length}">
            <span class="jstock-more-label">${rest.length}건 더 보기</span>
            <span class="jstock-more-icon">▾</span>
          </button>` : ''}
        </div>
      </div>
    `;

  }).join('');

  pane.innerHTML = filterHTML + `<div class="jstock-list">${groupsHTML}</div>`;

  // 필터 버튼 클릭
  pane.querySelectorAll('.journal-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      journalStockFilter = btn.dataset.filter;
      renderJournalByStock(store.journal());
    });
  });

  // 종목 아코디언 토글
  pane.querySelectorAll('.jstock-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const body     = btn.nextElementSibling;
      const icon     = btn.querySelector('.jstock-toggle-icon');
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      icon.style.transform = expanded ? 'rotate(0deg)' : 'rotate(90deg)';
      body.style.display   = expanded ? 'none' : '';
    });
  });

  // 더보기 버튼 토글
  pane.querySelectorAll('.jstock-more-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const moreEl  = btn.previousElementSibling;
      const label   = btn.querySelector('.jstock-more-label');
      const icon    = btn.querySelector('.jstock-more-icon');
      const total   = parseInt(btn.dataset.total);
      const hidden  = moreEl.classList.contains('hidden');
      moreEl.classList.toggle('hidden', !hidden);
      label.textContent = hidden ? '접기' : `${total}건 더 보기`;
      icon.style.transform = hidden ? 'rotate(180deg)' : 'rotate(0deg)';
    });
  });

  bindJournalCardEvents(pane);

}




function journalCardHTML(j) {

  const typeLabel = { buy: '🟥 매수', sell: '🟦 매도', watch: '👁 관찰' }[j.type] || j.type;

  const typeClass = { buy: 'jtype-buy', sell: 'jtype-sell', watch: 'jtype-watch' }[j.type] || '';

  const metaParts = [];

  if (j.qty)   metaParts.push(`${fmt.number(j.qty)}주`);

  if (j.price) metaParts.push(`@ ${fmt.money(j.price)}`);

  if (j.qty && j.price) metaParts.push(`합계 ${fmt.money(Math.round(j.qty * j.price))}`);


  return `

    <div class="journal-card" data-id="${j.id}">

      <div class="journal-card-header">

        <span class="journal-card-date">${j.date}</span>

        <span class="journal-card-name">${escapeHtml(j.name)}</span><!-- ← 변경: XSS 방지 -->

        <span class="jtype-badge ${typeClass}">${typeLabel}</span>

      </div>

      ${metaParts.length ? `<div class="journal-card-meta">${metaParts.join(' · ')}</div>` : ''}

      ${j.reason ? `<div class="journal-card-reason">${escapeHtml(j.reason)}</div>` : ''}

      ${j.tags?.length ? `

        <div class="journal-card-tags">

          ${j.tags.map(t => `<span class="journal-etag">${escapeHtml(t)}</span>`).join('')}<!-- ← 변경: 태그도 이스케이프 -->

        </div>` : ''}

      <div class="journal-card-actions">

        <button class="edit-btn" data-id="${j.id}">✏️ 수정</button>

        <button class="del-btn"  data-id="${j.id}">🗑 삭제</button>

      </div>

    </div>

  `;

}


function bindJournalCardEvents(container) {

  container.querySelectorAll('.edit-btn').forEach(btn => {

    btn.addEventListener('click', () => openJournalEditModal(btn.dataset.id));

  });

  container.querySelectorAll('.del-btn').forEach(btn => {

    btn.addEventListener('click', () => {

      if (!confirm('이 일지를 삭제할까요?')) return;

      const journals = store.journal().filter(j => j.id !== btn.dataset.id);

      store.saveJournal(journals);

      renderJournalSection();

      showStatus('🗑 일지가 삭제되었습니다.', 'error');

    });

  });

}


function escapeHtml(str) {

  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

}


/* ─── 탭 전환 ─── */

document.querySelectorAll('.journal-tab').forEach(tab => {

  tab.addEventListener('click', () => {

    document.querySelectorAll('.journal-tab').forEach(t => t.classList.remove('active'));

    tab.classList.add('active');

    journalActiveTab = tab.dataset.tab;

    // ← 변경: 탭 전환 시 캘린더 선택 및 종목 필터 초기화

    calendarSelected   = null;

    journalStockFilter = 'all';

    document.getElementById('journalTimeline').classList.toggle('hidden', journalActiveTab !== 'timeline');

    document.getElementById('journalByStock').classList.toggle('hidden',  journalActiveTab !== 'bystock');

    renderJournalSection();

  });

});


/* ─── 새 일지 작성 버튼 ─── */

document.getElementById('newJournalBtn').addEventListener('click', () => {

  openJournalModal();

});

 

/* ═══════════════════════════════════════════════════════════
   ← 변경: STEP 6 · 수익 기여도 분석
═══════════════════════════════════════════════════════════ */

let contribBarInst = null;

function renderContribDateSelects() {

  const history = store.history();

  const dates   = Object.keys(history).sort();

  if (dates.length < 2) return;

  document.getElementById('contributionSection').style.display = '';

  const fromSel = document.getElementById('contribDateFrom');

  const toSel   = document.getElementById('contribDateTo');

  fromSel.innerHTML = dates.map(d => `<option value="${d}">${d}</option>`).join('');

  toSel.innerHTML   = dates.map(d => `<option value="${d}">${d}</option>`).join('');

  fromSel.value = dates[0];

  toSel.value   = dates[dates.length - 1];

}

document.getElementById('calcContribBtn').addEventListener('click', () => {

  const history  = store.history();

  const dateFrom = document.getElementById('contribDateFrom').value;

  const dateTo   = document.getElementById('contribDateTo').value;

  if (!dateFrom || !dateTo || dateFrom >= dateTo) {

    alert('시작 날짜가 종료 날짜보다 앞이어야 해요.'); return;

  }

  const dataFrom = history[dateFrom] || [];

  const dataTo   = history[dateTo]   || [];

  // 종목별 매핑

  const fromMap = {};

  dataFrom.forEach(r => { fromMap[r.name] = r; });

  const toMap = {};

  dataTo.forEach(r => { toMap[r.name] = r; });

  // 공통 종목 + 신규 편입 종목 모두 포함

  const allNames = [...new Set([...Object.keys(fromMap), ...Object.keys(toMap)])];

  const totalEvalTo   = dataTo.reduce((s, r) => s + r.evalAmt, 0);

  const totalEvalFrom = dataFrom.reduce((s, r) => s + r.evalAmt, 0);

  const totalProfit   = totalEvalTo - totalEvalFrom;

  const rows = allNames.map(name => {

    const f = fromMap[name];

    const t = toMap[name];

    const evalFrom  = f ? f.evalAmt : 0;

    const evalTo    = t ? t.evalAmt : 0;

    const profit    = evalTo - evalFrom;

    const profitPct = evalFrom > 0 ? (profit / evalFrom * 100) : null;

    const contrib   = totalEvalFrom > 0 ? (profit / totalEvalFrom * 100) : 0; // 전체 대비 기여도

    const category  = (t || f).category || '-';

    return { name, category, evalFrom, evalTo, profit, profitPct, contrib };

  }).sort((a, b) => b.profit - a.profit);

  // 요약 카드

  const gainCount = rows.filter(r => r.profit > 0).length;

  const lossCount = rows.filter(r => r.profit < 0).length;

  document.getElementById('contribSummaryCards').innerHTML = `

    <div class="summary-card">

      <div class="s-label">기간</div>

      <div class="s-value" style="font-size:.95rem">${dateFrom} → ${dateTo}</div>

    </div>

    <div class="summary-card">

      <div class="s-label">총 수익금액</div>

      <div class="s-value ${totalProfit >= 0 ? 'buy' : 'sell'}">${totalProfit >= 0 ? '+' : ''}${fmt.money(Math.round(totalProfit))}</div>

    </div>

    <div class="summary-card">

      <div class="s-label">총 수익률</div>

      <div class="s-value ${totalProfit >= 0 ? 'buy' : 'sell'}">${totalEvalFrom > 0 ? ((totalProfit / totalEvalFrom * 100).toFixed(2) + '%') : '-'}</div>

    </div>

    <div class="summary-card">

      <div class="s-label">수익 종목 / 손실 종목</div>

      <div class="s-value"><span class="positive">${gainCount}개</span> / <span class="negative">${lossCount}개</span></div>

    </div>

  `;

  // 바 차트

  const top = rows.slice(0, 15); // 최대 15개

  if (contribBarInst) contribBarInst.destroy();

  contribBarInst = new Chart(document.getElementById('contribBarChart'), {

    type: 'bar',

    data: {

      labels  : top.map(r => r.name),

      datasets: [{

        label          : '수익 기여금액',

        data           : top.map(r => Math.round(r.profit)),

        backgroundColor: top.map(r => r.profit >= 0 ? 'rgba(239,68,68,.75)' : 'rgba(59,130,246,.75)'),

        borderColor    : top.map(r => r.profit >= 0 ? '#ef4444' : '#3b82f6'),

        borderWidth    : 1.5,

        borderRadius   : 6,

      }],

    },

    options: {

      responsive: true,

      maintainAspectRatio: false,

      interaction: { mode: 'index', intersect: false },

      plugins: {

        legend: { display: false },

        tooltip: { callbacks: {

          label: ctx => ` ${ctx.parsed.y >= 0 ? '+' : ''}${fmt.money(ctx.parsed.y)}`,

        }},

      },

      scales: {

        x: { grid: { display: false }, ticks: { font: { size: 11 } } },

        y: {

          grid: { color: '#f1f5f9' },

          ticks: { font: { size: 11 }, callback: v => (v / 10000).toFixed(0) + '만' },

        },

      },

    },

  });

  // 테이블

  document.getElementById('contribTableBody').innerHTML = rows.map((r, i) => {

    const profitStr = `${r.profit >= 0 ? '+' : ''}${fmt.money(Math.round(r.profit))}`;

    const profitCls = r.profit > 0 ? 'positive' : r.profit < 0 ? 'negative' : 'zero';

    const pctStr    = r.profitPct !== null ? `${r.profitPct >= 0 ? '+' : ''}${r.profitPct.toFixed(2)}%` : '-';

    const contribStr = `${r.contrib >= 0 ? '+' : ''}${r.contrib.toFixed(2)}%`;

    const rank = i + 1;

    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;

    return `<tr>

      <td>${medal}</td>

      <td><strong>${r.name}</strong></td>

      <td>${r.category}</td>

      <td>${r.evalFrom > 0 ? fmt.money(r.evalFrom) : '-'}</td>

      <td>${r.evalTo   > 0 ? fmt.money(r.evalTo)   : '-'}</td>

      <td class="${profitCls}">${profitStr}</td>

      <td class="${profitCls}">${pctStr}</td>

      <td class="${profitCls}">${contribStr}</td>

    </tr>`;

  }).join('');

  document.getElementById('contribResult').classList.remove('hidden');

  document.getElementById('contribResult').scrollIntoView({ behavior: 'smooth' });

});


/* ═══════════════════════════════════════════════════════════
   ← 변경: STEP 7 · 날짜 간 변동 비교
═══════════════════════════════════════════════════════════ */

let compareAllRows = []; // 필터링을 위해 전체 결과 보관

function renderCompareDateSelects() {

  const history = store.history();

  const dates   = Object.keys(history).sort();

  if (dates.length < 2) return;

  document.getElementById('compareSection').style.display = '';

  const selA = document.getElementById('compareDateA');

  const selB = document.getElementById('compareDateB');

  selA.innerHTML = dates.map(d => `<option value="${d}">${d}</option>`).join('');

  selB.innerHTML = dates.map(d => `<option value="${d}">${d}</option>`).join('');

  selA.value = dates[dates.length - 2];

  selB.value = dates[dates.length - 1];

}

document.getElementById('calcCompareBtn').addEventListener('click', () => {

  const history = store.history();

  const dateA   = document.getElementById('compareDateA').value;

  const dateB   = document.getElementById('compareDateB').value;

  if (!dateA || !dateB || dateA >= dateB) {

    alert('이전 날짜가 이후 날짜보다 앞이어야 해요.'); return;

  }

  const dataA = history[dateA] || [];

  const dataB = history[dateB] || [];

  const mapA  = {};

  dataA.forEach(r => { mapA[r.name] = r; });

  const mapB  = {};

  dataB.forEach(r => { mapB[r.name] = r; });

  const totalEvalA = dataA.reduce((s, r) => s + r.evalAmt, 0);

  const totalEvalB = dataB.reduce((s, r) => s + r.evalAmt, 0);

  const allNames   = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])];

  compareAllRows = allNames.map(name => {

    const a   = mapA[name];

    const b   = mapB[name];

    const cat = (b || a).category || '-';

    // 수량 변동

    const qtyA    = a ? a.qty     : null;

    const qtyB    = b ? b.qty     : null;

    const qtyDiff = (qtyA !== null && qtyB !== null) ? (qtyB - qtyA) : null;

    // 평가금액 변동

    const evalA    = a ? a.evalAmt  : 0;

    const evalB    = b ? b.evalAmt  : 0;

    const evalDiff = evalB - evalA;

    // 수익률 변동

    const profitA    = a ? a.profit : null;

    const profitB    = b ? b.profit : null;

    const profitDiff = (profitA !== null && profitB !== null) ? (profitB - profitA) : null;

    // 비중 변동

    const weightA    = totalEvalA > 0 && a ? (a.evalAmt / totalEvalA * 100) : 0;

    const weightB    = totalEvalB > 0 && b ? (b.evalAmt / totalEvalB * 100) : 0;

    const weightDiff = weightB - weightA;

    // 상태

    const status = !a ? 'new' : !b ? 'removed' :

      (qtyDiff !== 0 || Math.abs(evalDiff) > 1000) ? 'changed' : 'same';

    return { name, cat, qtyA, qtyB, qtyDiff, evalA, evalB, evalDiff, profitA, profitB, profitDiff, weightA, weightB, weightDiff, status };

  });

  // 요약 카드

  const newCount     = compareAllRows.filter(r => r.status === 'new').length;

  const removedCount = compareAllRows.filter(r => r.status === 'removed').length;

  const changedCount = compareAllRows.filter(r => r.status === 'changed').length;

  const evalTotalDiff = totalEvalB - totalEvalA;

  document.getElementById('compareSummaryCards').innerHTML = `

    <div class="summary-card">

      <div class="s-label">비교 기간</div>

      <div class="s-value" style="font-size:.9rem">${dateA} → ${dateB}</div>

    </div>

    <div class="summary-card">

      <div class="s-label">총 평가금액 변동</div>

      <div class="s-value ${evalTotalDiff >= 0 ? 'buy' : 'sell'}">${evalTotalDiff >= 0 ? '+' : ''}${fmt.money(Math.round(evalTotalDiff))}</div>

    </div>

    <div class="summary-card">

      <div class="s-label">신규 편입</div>

      <div class="s-value hold">${newCount}종목</div>

    </div>

    <div class="summary-card">

      <div class="s-label">제외 종목</div>

      <div class="s-value sell">${removedCount}종목</div>

    </div>

    <div class="summary-card">

      <div class="s-label">수량 변동</div>

      <div class="s-value">${changedCount}종목</div>

    </div>

  `;

  renderCompareTable('all');

  document.getElementById('compareResult').classList.remove('hidden');

  document.getElementById('compareResult').scrollIntoView({ behavior: 'smooth' });

});

// 필터 라디오 변경 시 테이블 재렌더

document.querySelectorAll('input[name="compareFilter"]').forEach(radio => {

  radio.addEventListener('change', () => {

    if (!compareAllRows.length) return;

    renderCompareTable(radio.value);

  });

});

function renderCompareTable(filter) {

  const filtered = filter === 'all' ? compareAllRows

    : compareAllRows.filter(r => r.status === filter);

  const statusLabel = { new: '신규', removed: '제외', changed: '변동', same: '동일' };

  const statusClass = { new: 'badge-new', removed: 'badge-removed', changed: 'badge-changed', same: 'badge-same' };

  document.getElementById('compareTableBody').innerHTML = filtered.map(r => {

    // 수량

    const qtyStr = r.qtyA === null ? `- → ${fmt.number(r.qtyB)}` :

                   r.qtyB === null ? `${fmt.number(r.qtyA)} → -` :

                   r.qtyDiff === 0 ? fmt.number(r.qtyB) :

                   `${fmt.number(r.qtyA)} → ${fmt.number(r.qtyB)} <span class="${r.qtyDiff > 0 ? 'delta-positive' : 'delta-negative'}">(${r.qtyDiff > 0 ? '+' : ''}${fmt.number(r.qtyDiff)})</span>`;

    // 평가금액

    const evalDiffStr = r.evalDiff === 0 ? '' :

      ` <span class="${r.evalDiff > 0 ? 'delta-positive' : 'delta-negative'}">(${r.evalDiff > 0 ? '+' : ''}${fmt.money(Math.round(r.evalDiff))})</span>`;

    const evalStr = r.status === 'new'     ? `- → ${fmt.money(r.evalB)}` :

                    r.status === 'removed' ? `${fmt.money(r.evalA)} → -` :

                    `${fmt.money(Math.round(r.evalB))}${evalDiffStr}`;

    // 수익률

    const profitDiffStr = r.profitDiff !== null && Math.abs(r.profitDiff) > 0.01

      ? ` <span class="${r.profitDiff > 0 ? 'delta-positive' : 'delta-negative'}">(${r.profitDiff > 0 ? '+' : ''}${r.profitDiff.toFixed(2)}%p)</span>`

      : '';

    const profitBStr = r.profitB !== null ? fmt.pct(r.profitB) : '-';

    const profitStr  = r.status === 'new' ? profitBStr :

                       r.status === 'removed' ? (r.profitA !== null ? fmt.pct(r.profitA) : '-') :

                       `${profitBStr}${profitDiffStr}`;

    // 비중

    const wDiffStr = Math.abs(r.weightDiff) > 0.05

      ? ` <span class="${r.weightDiff > 0 ? 'delta-positive' : 'delta-negative'}">(${r.weightDiff > 0 ? '+' : ''}${r.weightDiff.toFixed(1)}%p)</span>`

      : '';

    const weightStr = r.status === 'new'     ? `- → ${r.weightB.toFixed(1)}%` :

                      r.status === 'removed' ? `${r.weightA.toFixed(1)}% → -` :

                      `${r.weightB.toFixed(1)}%${wDiffStr}`;

    return `<tr>

      <td><strong>${r.name}</strong></td>

      <td>${r.cat}</td>

      <td>${qtyStr}</td>

      <td>${evalStr}</td>

      <td>${profitStr}</td>

      <td>${weightStr}</td>

      <td><span class="badge ${statusClass[r.status]}">${statusLabel[r.status]}</span></td>

    </tr>`;

  }).join('');

}


/* ═══════════════════════════════════════════════════════════
   ← 변경: STEP 6 · 배당금 기록
═══════════════════════════════════════════════════════════ */

let divEditId       = null;
let divActiveTab    = 'divTimeline';
let divBarChartInst = null;

// ── 섹션 렌더 진입점 ──────────────────────────────────────

function renderDividendSection() {

  const divs = store.dividend();

  const sec  = document.getElementById('dividendSection');

  sec.style.display = ''; // 항상 표시 (빈 상태도 작성 유도)

  renderDivSummaryCards(divs);

  if (divActiveTab === 'divTimeline') renderDivTimeline(divs);

  else if (divActiveTab === 'divByStock') renderDivByStock(divs);

  else renderDivByYear(divs);

}

// ── 요약 카드 ─────────────────────────────────────────────

function renderDivSummaryCards(divs) {

  if (!divs.length) {

    document.getElementById('divSummaryCards').innerHTML = '';

    return;

  }

  const totalNet   = divs.reduce((s, d) => s + (d.net   || 0), 0);

  const totalGross = divs.reduce((s, d) => s + (d.gross || 0), 0);

  const thisYear   = new Date().getFullYear().toString();

  const yearNet    = divs.filter(d => d.date?.startsWith(thisYear))

                        .reduce((s, d) => s + (d.net || 0), 0);

  const stockCount = new Set(divs.map(d => d.name)).size;

  document.getElementById('divSummaryCards').innerHTML = `

    <div class="summary-card">

      <div class="s-label">누적 세후 배당금</div>

      <div class="s-value" style="color:var(--success)">${fmt.money(Math.round(totalNet))}</div>

    </div>

    <div class="summary-card">

      <div class="s-label">누적 세전 배당금</div>

      <div class="s-value">${fmt.money(Math.round(totalGross))}</div>

    </div>

    <div class="summary-card">

      <div class="s-label">${thisYear}년 세후 배당금</div>

      <div class="s-value" style="color:var(--success)">${fmt.money(Math.round(yearNet))}</div>

    </div>

    <div class="summary-card">

      <div class="s-label">배당 수령 종목 수</div>

      <div class="s-value">${stockCount}종목</div>

    </div>

  `;

}

// ── YOC 계산 헬퍼 ────────────────────────────────────────

function calcYoc(stockName, annualNet) {

  // 최신 포트폴리오 데이터에서 해당 종목의 매입금액을 가져옴

  const history = store.history();

  const dates   = Object.keys(history).sort();

  if (!dates.length) return null;

  const latest = history[dates[dates.length - 1]];

  const row    = latest.find(r => r.name === stockName);

  if (!row || !row.buyAmt) return null;

  return (annualNet / row.buyAmt * 100);

}

// ── 수령 내역 탭 ─────────────────────────────────────────

function renderDivTimeline(divs) {

  const pane   = document.getElementById('divTimeline');

  const sorted = [...divs].sort((a, b) => b.date.localeCompare(a.date));

  if (!sorted.length) {

    pane.innerHTML = '<div class="journal-empty">💰 아직 배당금 기록이 없어요. 위 버튼으로 추가해보세요!</div>';

    return;

  }

  pane.innerHTML = `<div style="display:flex;flex-direction:column;gap:.6rem">${sorted.map(divCardHTML).join('')}</div>`;

  bindDivCardEvents(pane);

}

// ── 종목별 합계 탭 ────────────────────────────────────────

function renderDivByStock(divs) {

  const pane = document.getElementById('divByStock');

  if (!divs.length) {

    pane.innerHTML = '<div class="journal-empty">💰 배당 기록이 없어요.</div>'; return;

  }

  const map = {};

  divs.forEach(d => {

    if (!map[d.name]) map[d.name] = { net: 0, gross: 0, count: 0 };

    map[d.name].net   += d.net   || 0;

    map[d.name].gross += d.gross || 0;

    map[d.name].count += 1;

  });

  const rows = Object.entries(map).sort((a, b) => b[1].net - a[1].net);

  const totalNet = rows.reduce((s, [, v]) => s + v.net, 0);

  pane.innerHTML = `

    <div style="border:1.5px solid var(--border);border-radius:12px;overflow:hidden">

      <div style="display:flex;padding:.6rem 1rem;background:var(--bg);font-size:.8rem;font-weight:700;color:var(--text-muted);gap:1rem">

        <span style="flex:1">종목명</span>

        <span style="min-width:110px;text-align:right">세후 합계</span>

        <span style="min-width:90px;text-align:right">YOC(연환산)</span>

        <span style="min-width:60px;text-align:right">수령횟수</span>

      </div>

      ${rows.map(([name, v]) => {

        const yoc = calcYoc(name, v.net);

        const yocStr = yoc !== null ? yoc.toFixed(2) + '%' : '-';

        const pct = totalNet > 0 ? (v.net / totalNet * 100).toFixed(1) : '0';

        return `<div class="div-stock-row">

          <span class="dsn">${name} <span style="font-size:.75rem;color:var(--text-muted);font-weight:400">(${pct}%)</span></span>

          <span class="dsa">${fmt.money(Math.round(v.net))}</span>

          <span class="dsy">${yocStr}</span>

          <span class="dsc">${v.count}회</span>

        </div>`;

      }).join('')}

    </div>

  `;

}

// ── 연도별 합계 탭 ────────────────────────────────────────

function renderDivByYear(divs) {

  if (!divs.length) {

    document.getElementById('divYearTable').innerHTML = '<div class="journal-empty">💰 배당 기록이 없어요.</div>';

    return;

  }

  const yearMap = {};

  divs.forEach(d => {

    const y = d.date?.slice(0, 4) || '미상';

    if (!yearMap[y]) yearMap[y] = { net: 0, gross: 0, count: 0 };

    yearMap[y].net   += d.net   || 0;

    yearMap[y].gross += d.gross || 0;

    yearMap[y].count += 1;

  });

  const years  = Object.keys(yearMap).sort();

  const netArr = years.map(y => Math.round(yearMap[y].net));

  // 바 차트

  if (divBarChartInst) divBarChartInst.destroy();

  divBarChartInst = new Chart(document.getElementById('divBarChart'), {

    type: 'bar',

    data: {

      labels  : years,

      datasets: [{

        label          : '세후 배당금',

        data           : netArr,

        backgroundColor: 'rgba(16,185,129,.75)',

        borderColor    : '#10b981',

        borderWidth    : 1.5,

        borderRadius   : 8,

      }],

    },

    options: {

      responsive: true,

      maintainAspectRatio: false,

      plugins: {

        legend: { display: false },

        tooltip: { callbacks: { label: ctx => ` ${fmt.money(ctx.parsed.y)}` } },

      },

      scales: {

        x: { grid: { display: false } },

        y: { grid: { color: '#f1f5f9' }, ticks: { callback: v => (v / 10000).toFixed(0) + '만' } },

      },

    },

  });

  // 연도별 테이블

  document.getElementById('divYearTable').innerHTML = `

    <div style="border:1.5px solid var(--border);border-radius:12px;overflow:hidden">

      <div style="display:flex;padding:.6rem 1rem;background:var(--bg);font-size:.8rem;font-weight:700;color:var(--text-muted);gap:1rem">

        <span style="flex:1">연도</span>

        <span style="min-width:120px;text-align:right">세후 배당금</span>

        <span style="min-width:120px;text-align:right">세전 배당금</span>

        <span style="min-width:60px;text-align:right">수령횟수</span>

      </div>

      ${years.slice().reverse().map(y => {

        const v = yearMap[y];

        return `<div class="div-stock-row">

          <span class="dsn">${y}년</span>

          <span class="dsa">${fmt.money(Math.round(v.net))}</span>

          <span style="min-width:120px;text-align:right;font-size:.88rem;color:var(--text-muted)">${fmt.money(Math.round(v.gross))}</span>

          <span class="dsc">${v.count}회</span>

        </div>`;

      }).join('')}

    </div>

  `;

}

// ── 배당 카드 HTML ────────────────────────────────────────

function divCardHTML(d) {

  const icon    = d.type === 'stock' ? '📦' : '💵';

  const typeStr = d.type === 'stock' ? '주식' : '현금';

  return `

    <div class="div-card" data-id="${d.id}">

      <div class="div-card-left">

        <span class="div-card-icon">${icon}</span>

        <span class="div-card-type">${typeStr}</span>

      </div>

      <div class="div-card-body">

        <div class="div-card-header">

          <span class="div-card-name">${d.name}</span>

          <span class="div-card-date">${d.date}</span>

        </div>

        <div class="div-card-amounts">

          <span class="div-card-net">세후 ${fmt.money(Math.round(d.net || 0))}</span>

          ${d.gross ? `<span class="div-card-gross">세전 ${fmt.money(Math.round(d.gross))}</span>` : ''}

        </div>

        ${d.memo ? `<div class="div-card-memo">${escapeHtml(d.memo)}</div>` : ''}

      </div>

      <div class="div-card-actions">

        <button class="edit-btn" data-id="${d.id}">✏️ 수정</button>

        <button class="del-btn"  data-id="${d.id}">🗑 삭제</button>

      </div>

    </div>

  `;

}

function bindDivCardEvents(container) {

  container.querySelectorAll('.edit-btn').forEach(btn => {

    btn.addEventListener('click', () => openDivEditModal(btn.dataset.id));

  });

  container.querySelectorAll('.del-btn').forEach(btn => {

    btn.addEventListener('click', () => {

      if (!confirm('이 배당 기록을 삭제할까요?')) return;

      store.saveDividend(store.dividend().filter(d => d.id !== btn.dataset.id));

      renderDividendSection();

      showStatus('🗑 배당 기록이 삭제되었습니다.', 'error');

    });

  });

}

// ── 탭 전환 ──────────────────────────────────────────────

document.querySelectorAll('.div-tab').forEach(tab => {

  tab.addEventListener('click', () => {

    document.querySelectorAll('.div-tab').forEach(t => t.classList.remove('active'));

    tab.classList.add('active');

    divActiveTab = tab.dataset.tab;

    ['divTimeline', 'divByStock', 'divByYear'].forEach(id => {

      document.getElementById(id).classList.toggle('hidden', id !== divActiveTab);

    });

    renderDividendSection();

  });

});

// ── 모달 열기/닫기 ───────────────────────────────────────

function openDivModal(prefillName = '') {

  divEditId = null;

  document.getElementById('divModalTitle').textContent = '💰 배당금 기록';

  document.getElementById('dDate').value  = new Date().toISOString().slice(0, 10);

  document.getElementById('dName').value  = prefillName;

  document.getElementById('dGross').value = '';

  document.getElementById('dNet').value   = '';

  document.getElementById('dMemo').value  = '';

  document.querySelector('input[name="dType"][value="cash"]').checked = true;

  document.getElementById('dYocPreview').classList.add('hidden');

  // datalist 갱신

  const history = store.history();

  const dates   = Object.keys(history).sort();

  const names   = new Set();

  dates.forEach(d => history[d].forEach(r => names.add(r.name)));

  document.getElementById('dNameList').innerHTML = [...names].map(n => `<option value="${n}">`).join('');

  document.getElementById('dividendModal').classList.remove('hidden');

}

function openDivEditModal(id) {

  const d = store.dividend().find(x => x.id === id);

  if (!d) return;

  divEditId = id;

  document.getElementById('divModalTitle').textContent = '💰 배당금 수정';

  document.getElementById('dDate').value  = d.date;

  document.getElementById('dName').value  = d.name;

  document.getElementById('dGross').value = d.gross || '';

  document.getElementById('dNet').value   = d.net   || '';

  document.getElementById('dMemo').value  = d.memo  || '';

  const typeRadio = document.querySelector(`input[name="dType"][value="${d.type || 'cash'}"]`);

  if (typeRadio) typeRadio.checked = true;

  document.getElementById('dividendModal').classList.remove('hidden');

}

function closeDivModal() {

  document.getElementById('dividendModal').classList.add('hidden');

  divEditId = null;

}

document.getElementById('newDividendBtn').addEventListener('click',  () => openDivModal());

document.getElementById('divModalClose').addEventListener('click',   closeDivModal);

document.getElementById('divModalCancel').addEventListener('click',  closeDivModal);

document.getElementById('dividendModal').addEventListener('click', e => {

  if (e.target === document.getElementById('dividendModal')) closeDivModal();

});

// 세금 자동계산 버튼 (15.4%)

document.getElementById('dAutoTaxBtn').addEventListener('click', () => {

  const gross = parseFloat(document.getElementById('dGross').value) || 0;

  if (!gross) { alert('세전 금액을 먼저 입력해주세요.'); return; }

  document.getElementById('dNet').value = Math.round(gross * (1 - 0.154));

});

// YOC 미리보기 — 종목명 + 세후금액 입력 시 자동 계산

function updateYocPreview() {

  const name = document.getElementById('dName').value.trim();

  const net  = parseFloat(document.getElementById('dNet').value) || 0;

  const el   = document.getElementById('dYocPreview');

  if (!name || !net) { el.classList.add('hidden'); return; }

  const yoc = calcYoc(name, net);

  if (yoc === null) { el.classList.add('hidden'); return; }

  el.textContent = `📊 YOC (매입가 대비 배당수익률): ${yoc.toFixed(2)}% — 연간 ${fmt.money(Math.round(net))} 수령 기준`;

  el.classList.remove('hidden');

}

document.getElementById('dName').addEventListener('input',  updateYocPreview);

document.getElementById('dNet').addEventListener('input',   updateYocPreview);

// 저장

document.getElementById('divModalSave').addEventListener('click', () => {

  const name  = document.getElementById('dName').value.trim();

  const date  = document.getElementById('dDate').value;

  const type  = document.querySelector('input[name="dType"]:checked').value;

  const gross = parseFloat(document.getElementById('dGross').value) || 0;

  const net   = parseFloat(document.getElementById('dNet').value)   || 0;

  const memo  = document.getElementById('dMemo').value.trim();

  if (!name) { alert('종목명을 입력해주세요.'); return; }

  if (!date) { alert('수령일을 선택해주세요.');  return; }

  if (!net && !gross) { alert('배당금액을 입력해주세요.'); return; }

  const divs = store.dividend();

  if (divEditId) {

    const idx = divs.findIndex(d => d.id === divEditId);

    if (idx !== -1) divs[idx] = { ...divs[idx], date, name, type, gross, net, memo };

  } else {

    divs.push({ id: Date.now().toString(), date, name, type, gross, net, memo });

  }

  store.saveDividend(divs);

  closeDivModal();

  renderDividendSection();

  showStatus('💰 배당금이 저장되었습니다!');

});


/* ═══════════════════════════════════════════════════════════
   ← 변경: STEP 9 · 월간 요약 리포트
═══════════════════════════════════════════════════════════ */

function renderReportMonthSelect() {

  const history = store.history();

  const dates   = Object.keys(history).sort();

  const sec     = document.getElementById('reportSection');

  if (!dates.length) { sec.style.display = 'none'; return; }

  sec.style.display = '';

  // 저장된 날짜에서 연-월 목록 추출 (중복 제거)

  const months = [...new Set(dates.map(d => d.slice(0, 7)))].sort().reverse();

  const sel    = document.getElementById('reportMonthSelect');

  sel.innerHTML = months.map(m => `<option value="${m}">${m}</option>`).join('');

}

// ── 리포트 탭 전환
document.querySelectorAll('.report-type-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.report-type-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const type = tab.dataset.reportType;
    document.getElementById('reportMonthlyControls').classList.toggle('hidden', type !== 'monthly');
    document.getElementById('reportAnnualControls').classList.toggle('hidden', type !== 'annual');
    document.getElementById('reportOutput').classList.add('hidden');
    if (type === 'annual') renderReportYearSelect();
  });
});

document.getElementById('genReportBtn').addEventListener('click', () => {

  const month = document.getElementById('reportMonthSelect').value;

  if (!month) return;

  const html = buildReportHTML(month);

  const out  = document.getElementById('reportOutput');

  out.innerHTML = html;

  out.classList.remove('hidden');

  document.getElementById('printReportBtn').classList.remove('hidden');

  out.scrollIntoView({ behavior: 'smooth' });

});

document.getElementById('printReportBtn').addEventListener('click', () => window.print());

// ── 연간 리포트
function renderReportYearSelect() {
  const history = store.history();
  const dates   = Object.keys(history).sort();
  const years   = [...new Set(dates.map(d => d.slice(0, 4)))].sort().reverse();
  const sel     = document.getElementById('reportYearSelect');
  sel.innerHTML = years.map(y => `<option value="${y}">${y}년</option>`).join('');
}

let annualMonthChartInst = null;

document.getElementById('genAnnualReportBtn').addEventListener('click', () => {
  const year = document.getElementById('reportYearSelect').value;
  if (!year) return;
  const { html, monthRows } = buildAnnualReportHTML(year);
  const out  = document.getElementById('reportOutput');
  out.innerHTML = html;
  out.classList.remove('hidden');
  document.getElementById('printAnnualReportBtn').classList.remove('hidden');
  renderAnnualMonthChart(monthRows);
  out.scrollIntoView({ behavior: 'smooth' });
});

function renderAnnualMonthChart(monthRows) {
  if (annualMonthChartInst) { annualMonthChartInst.destroy(); annualMonthChartInst = null; }
  const canvas = document.getElementById('annualMonthChart');
  if (!canvas) return;

  const active   = monthRows.filter(r => r.eval !== null);
  const labels   = active.map(r => r.month);
  const evals    = active.map(r => r.eval);
  const pcts     = active.map(r => r.pct ?? 0);

  annualMonthChartInst = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: '평가금액',
          data: evals,
          backgroundColor: evals.map((_, i) =>
            i === 0 ? 'rgba(79,70,229,.35)' :
            evals[i] >= evals[i - 1] ? 'rgba(79,70,229,.55)' : 'rgba(239,68,68,.45)'
          ),
          borderColor: evals.map((_, i) =>
            i === 0 ? '#4f46e5' :
            evals[i] >= evals[i - 1] ? '#4f46e5' : '#ef4444'
          ),
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: 'yEval',
          order: 2,
        },
        {
          type: 'line',
          label: '전월비(%)',
          data: pcts,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,.1)',
          borderWidth: 2,
          pointBackgroundColor: '#f59e0b',
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.35,
          yAxisID: 'yPct',
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', labels: { font: { size: 11 }, boxWidth: 12, padding: 14 } },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label === '평가금액') return ` 평가금액: ${fmt.money(Math.round(ctx.parsed.y))}`;
              const sign = ctx.parsed.y >= 0 ? '+' : '';
              return ` 전월비: ${sign}${ctx.parsed.y.toFixed(2)}%`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        yEval: {
          position: 'left',
          grid: { color: 'rgba(0,0,0,.06)' },
          ticks: { font: { size: 10 }, callback: v => (v / 10000).toFixed(0) + '만' },
        },
        yPct: {
          position: 'right',
          grid: { display: false },
          ticks: { font: { size: 10 }, callback: v => v.toFixed(1) + '%' },
        },
      },
    },
  });
}

document.getElementById('printAnnualReportBtn').addEventListener('click', () => window.print());

function buildAnnualReportHTML(year) {
  const history  = store.history();
  const journals = store.journal();
  const divs     = store.dividend();
  const target   = store.target();
  const allDates = Object.keys(history).sort();

  // ── 연도 내 날짜 & 전년도 말 기준
  const yearDates  = allDates.filter(d => d.startsWith(year));
  const prevDates  = allDates.filter(d => d < `${year}-01-01`);
  const dateStart  = prevDates.length ? prevDates[prevDates.length - 1] : (yearDates[0] || null);
  const dateEnd    = yearDates.length ? yearDates[yearDates.length - 1] : null;
  const dataStart  = dateStart ? history[dateStart] : null;
  const dataEnd    = dateEnd   ? history[dateEnd]   : null;

  if (!dataEnd) return '<p style="padding:1rem;color:var(--text-muted)">해당 연도에 저장된 데이터가 없어요.</p>';

  const evalStart   = dataStart ? dataStart.reduce((s, r) => s + r.evalAmt, 0) : 0;
  const evalEnd     = dataEnd.reduce((s, r) => s + r.evalAmt, 0);
  const buyEnd      = dataEnd.reduce((s, r) => s + r.buyAmt, 0);
  const evalDiff    = evalEnd - evalStart;
  const evalPct     = evalStart > 0 ? (evalDiff / evalStart * 100) : 0;
  const totalProfit = buyEnd > 0 ? ((evalEnd - buyEnd) / buyEnd * 100) : 0;

  // ── 1. 연간 KPI
  const kpiHTML = `
    <div class="report-kpi-grid">
      <div class="report-kpi">
        <div class="report-kpi-label">연말 평가금액</div>
        <div class="report-kpi-value">${fmt.money(Math.round(evalEnd))}</div>
      </div>
      <div class="report-kpi">
        <div class="report-kpi-label">연간 평가금액 변동</div>
        <div class="report-kpi-value ${evalDiff >= 0 ? 'positive' : 'negative'}">
          ${evalDiff >= 0 ? '+' : ''}${fmt.money(Math.round(evalDiff))}
          <span style="font-size:.82rem;font-weight:600">(${evalDiff >= 0 ? '+' : ''}${evalPct.toFixed(2)}%)</span>
        </div>
      </div>
      <div class="report-kpi">
        <div class="report-kpi-label">총 매입금액</div>
        <div class="report-kpi-value">${fmt.money(Math.round(buyEnd))}</div>
      </div>
      <div class="report-kpi">
        <div class="report-kpi-label">누적 수익률</div>
        <div class="report-kpi-value ${totalProfit >= 0 ? 'positive' : 'negative'}">
          ${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}%
        </div>
      </div>
    </div>`;

  // ── 2. 월별 추이 테이블
  const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const monthRows = [];
  let prevEval = evalStart;
  let prevDate = dateStart;

  for (let m = 1; m <= 12; m++) {
    const mStr     = `${year}-${String(m).padStart(2,'0')}`;
    const mDates   = yearDates.filter(d => d.startsWith(mStr));
    const mLastDate = mDates.length ? mDates[mDates.length - 1] : null;
    const mData    = mLastDate ? history[mLastDate] : null;
    const mEval    = mData ? mData.reduce((s, r) => s + r.evalAmt, 0) : null;
    const mDiff    = mEval !== null ? mEval - prevEval : null;
    const mPct     = (mEval !== null && prevEval > 0) ? (mDiff / prevEval * 100) : null;

    monthRows.push({ month: MONTHS[m - 1], date: mLastDate, eval: mEval, diff: mDiff, pct: mPct });
    if (mEval !== null) { prevEval = mEval; prevDate = mLastDate; }
  }

  const monthTableHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>월</th><th>기준일</th><th>평가금액</th><th>전월 대비</th><th>전월비 (%)</th>
          </tr>
        </thead>
        <tbody>
          ${monthRows.map(r => r.eval !== null ? `
            <tr>
              <td><strong>${r.month}</strong></td>
              <td style="font-size:.82rem;color:var(--text-muted)">${r.date}</td>
              <td>${fmt.money(Math.round(r.eval))}</td>
              <td class="${r.diff >= 0 ? 'positive' : 'negative'}">${r.diff >= 0 ? '+' : ''}${fmt.money(Math.round(r.diff))}</td>
              <td class="${r.pct >= 0 ? 'positive' : 'negative'}">${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(2)}%</td>
            </tr>` : `
            <tr style="opacity:.4">
              <td><strong>${r.month}</strong></td>
              <td colspan="4" style="font-size:.82rem;color:var(--text-muted)">데이터 없음</td>
            </tr>`
          ).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2"><strong>연간 합계</strong></td>
            <td><strong>${fmt.money(Math.round(evalEnd))}</strong></td>
            <td class="${evalDiff >= 0 ? 'positive' : 'negative'}"><strong>${evalDiff >= 0 ? '+' : ''}${fmt.money(Math.round(evalDiff))}</strong></td>
            <td class="${evalPct >= 0 ? 'positive' : 'negative'}"><strong>${evalPct >= 0 ? '+' : ''}${evalPct.toFixed(2)}%</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  // ── 3. 종목별 연간 성과 TOP3 / BOTTOM3
  const startMap = {};
  if (dataStart) dataStart.forEach(r => { startMap[r.name] = r.evalAmt; });
  const perfRows = dataEnd.map(r => {
    const prev = startMap[r.name] ?? r.evalAmt;
    const diff = r.evalAmt - prev;
    const pct  = prev > 0 ? (diff / prev * 100) : 0;
    return { name: r.name, diff, pct };
  }).sort((a, b) => b.pct - a.pct);
  const top3    = perfRows.slice(0, 3);
  const bottom3 = [...perfRows].sort((a, b) => a.pct - b.pct).slice(0, 3);
  const rankItemHTML = (r, i) => `
    <div class="report-rank-item">
      <span class="report-rank-num">${i + 1}</span>
      <span class="report-rank-name">${r.name}</span>
      <span class="report-rank-val ${r.pct >= 0 ? 'positive' : 'negative'}">${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(2)}%</span>
    </div>`;
  const rankHTML = `
    <div class="report-rank-grid">
      <div>
        <div style="font-size:.8rem;font-weight:700;color:var(--danger);margin-bottom:.5rem">🏆 TOP 3</div>
        <div class="report-rank-list">${top3.map(rankItemHTML).join('')}</div>
      </div>
      <div>
        <div style="font-size:.8rem;font-weight:700;color:#3b82f6;margin-bottom:.5rem">📉 BOTTOM 3</div>
        <div class="report-rank-list">${bottom3.map(rankItemHTML).join('')}</div>
      </div>
    </div>`;

  // ── 4. 연간 거래 요약
  const yearJournals = journals.filter(j => j.date?.startsWith(year)).sort((a, b) => a.date.localeCompare(b.date));
  const typeLabel    = { buy: '🟥 매수', sell: '🟦 매도', watch: '👁 관찰' };
  const buyCnt  = yearJournals.filter(j => j.type === 'buy').length;
  const sellCnt = yearJournals.filter(j => j.type === 'sell').length;
  const watchCnt = yearJournals.filter(j => j.type === 'watch').length;
  const tradeHTML = yearJournals.length ? `
    <div style="display:flex;gap:1.5rem;margin-bottom:.75rem;flex-wrap:wrap">
      <span style="font-size:.85rem">🟥 매수 <strong>${buyCnt}건</strong></span>
      <span style="font-size:.85rem">🟦 매도 <strong>${sellCnt}건</strong></span>
      <span style="font-size:.85rem">👁 관찰 <strong>${watchCnt}건</strong></span>
      <span style="font-size:.85rem">합계 <strong>${yearJournals.length}건</strong></span>
    </div>
    <div class="report-trade-list">
      ${yearJournals.map(j => `
        <div class="report-trade-item">
          <span class="badge ${j.type === 'buy' ? 'badge-buy' : j.type === 'sell' ? 'badge-sell' : 'badge-hold'}">${typeLabel[j.type] || j.type}</span>
          <span class="report-trade-name">${j.name}</span>
          <span style="font-size:.82rem;color:var(--text-muted)">${j.date}</span>
          ${j.qty   ? `<span style="font-size:.82rem">${fmt.number(j.qty)}주</span>` : ''}
          ${j.price ? `<span style="font-size:.82rem">@${fmt.money(j.price)}</span>` : ''}
          ${j.reason ? `<span class="report-trade-reason">"${escapeHtml(j.reason)}"</span>` : ''}
        </div>`).join('')}
    </div>` : '<p style="font-size:.85rem;color:var(--text-muted)">이 연도 거래 기록이 없어요.</p>';

  // ── 5. 연간 배당금
  const yearDivs    = divs.filter(d => d.date?.startsWith(year));
  const divTotalNet = yearDivs.reduce((s, d) => s + (d.net || 0), 0);
  const divHTML = yearDivs.length ? `
    <div style="margin-bottom:.5rem;font-size:.88rem;font-weight:700;color:var(--success)">연간 배당금 합계: ${fmt.money(Math.round(divTotalNet))}</div>
    <div style="display:flex;flex-direction:column;gap:.4rem">
      ${yearDivs.map(d => `
        <div class="report-rank-item">
          <span>${d.type === 'stock' ? '📦' : '💵'}</span>
          <span class="report-rank-name">${d.name}</span>
          <span style="font-size:.8rem;color:var(--text-muted)">${d.date}</span>
          <span class="report-rank-val" style="color:var(--success)">세후 ${fmt.money(Math.round(d.net || 0))}</span>
        </div>`).join('')}
    </div>` : '<p style="font-size:.85rem;color:var(--text-muted)">이 연도 배당금 기록이 없어요.</p>';

  // ── 최종 조립
  const html = `
    <div class="report-wrap">
      <div class="report-header">
        <div>
          <div class="report-header-title">📆 ${year}년 연간 포트폴리오 리포트</div>
          <div class="report-header-date">비교 기간: ${dateStart || '-'} → ${dateEnd}</div>
        </div>
        <div style="font-size:.85rem;opacity:.9">생성일 ${new Date().toLocaleDateString('ko-KR')}</div>
      </div>
      <div class="report-block">
        <div class="report-block-title">📊 연간 성과 요약</div>
        <div class="report-block-body">${kpiHTML}</div>
      </div>
      <div class="report-block">
        <div class="report-block-title">📅 월별 평가금액 추이</div>
        <div class="report-block-body">
          <div class="annual-chart-wrap"><canvas id="annualMonthChart"></canvas></div>
          ${monthTableHTML}
        </div>
      </div>
      <div class="report-block">
        <div class="report-block-title">🏆 종목별 연간 성과 TOP / BOTTOM</div>
        <div class="report-block-body">${rankHTML}</div>
      </div>
      <div class="report-block">
        <div class="report-block-title">🔄 연간 거래 내역 <span style="font-size:.78rem;font-weight:400;color:var(--text-muted)">(투자 일지 기반)</span></div>
        <div class="report-block-body">${tradeHTML}</div>
      </div>
      <div class="report-block">
        <div class="report-block-title">💰 연간 배당금 수령</div>
        <div class="report-block-body">${divHTML}</div>
      </div>
    </div>`;

  return { html, monthRows };
}

function buildReportHTML(month) {

  const history  = store.history();

  const journals = store.journal();

  const divs     = store.dividend();

  const target   = store.target();

  const [year, mon] = month.split('-');


  // ── 해당 월 범위 날짜 찾기 ──────────────────────────────

  const allDates    = Object.keys(history).sort();

  const monthDates  = allDates.filter(d => d.startsWith(month));

  // 월초에 가장 가까운 이전 날짜 (전월 말 기준)

  const prevDates   = allDates.filter(d => d < month + '-01');

  const dateStart   = prevDates.length ? prevDates[prevDates.length - 1] : (monthDates[0] || null);

  const dateEnd     = monthDates.length ? monthDates[monthDates.length - 1] : null;

  const dataStart   = dateStart ? history[dateStart] : null;

  const dataEnd     = dateEnd   ? history[dateEnd]   : null;

  if (!dataEnd) return '<p style="padding:1rem;color:var(--text-muted)">해당 월에 저장된 데이터가 없어요.</p>';

  const evalStart  = dataStart ? dataStart.reduce((s, r) => s + r.evalAmt, 0) : 0;

  const evalEnd    = dataEnd.reduce((s, r) => s + r.evalAmt, 0);

  const buyEnd     = dataEnd.reduce((s, r) => s + r.buyAmt,  0);

  const evalDiff   = evalEnd - evalStart;

  const evalPct    = evalStart > 0 ? (evalDiff / evalStart * 100) : 0;

  const totalProfit = buyEnd > 0 ? ((evalEnd - buyEnd) / buyEnd * 100) : 0;


  // ── 1. 성과 KPI ─────────────────────────────────────────

  const kpiHTML = `

    <div class="report-kpi-grid">

      <div class="report-kpi">

        <div class="report-kpi-label">월말 평가금액</div>

        <div class="report-kpi-value">${fmt.money(Math.round(evalEnd))}</div>

      </div>

      <div class="report-kpi">

        <div class="report-kpi-label">전월 대비 변동</div>

        <div class="report-kpi-value ${evalDiff >= 0 ? 'positive' : 'negative'}">

          ${evalDiff >= 0 ? '+' : ''}${fmt.money(Math.round(evalDiff))}

          <span style="font-size:.82rem;font-weight:600">(${evalDiff >= 0 ? '+' : ''}${evalPct.toFixed(2)}%)</span>

        </div>

      </div>

      <div class="report-kpi">

        <div class="report-kpi-label">총 매입금액</div>

        <div class="report-kpi-value">${fmt.money(Math.round(buyEnd))}</div>

      </div>

      <div class="report-kpi">

        <div class="report-kpi-label">누적 수익률</div>

        <div class="report-kpi-value ${totalProfit >= 0 ? 'positive' : 'negative'}">

          ${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}%

        </div>

      </div>

    </div>

  `;


  // ── 2. 종목별 TOP3 / BOTTOM3 ────────────────────────────

  const startMap = {};

  if (dataStart) dataStart.forEach(r => { startMap[r.name] = r.evalAmt; });

  const perfRows = dataEnd.map(r => {

    const prev   = startMap[r.name] ?? r.evalAmt;

    const diff   = r.evalAmt - prev;

    const pct    = prev > 0 ? (diff / prev * 100) : 0;

    return { name: r.name, diff, pct };

  }).sort((a, b) => b.pct - a.pct);

  const top3    = perfRows.slice(0, 3);

  const bottom3 = [...perfRows].sort((a, b) => a.pct - b.pct).slice(0, 3);

  const rankItemHTML = (r, i) => `

    <div class="report-rank-item">

      <span class="report-rank-num">${i + 1}</span>

      <span class="report-rank-name">${r.name}</span>

      <span class="report-rank-val ${r.pct >= 0 ? 'positive' : 'negative'}">

        ${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(2)}%

      </span>

    </div>`;

  const rankHTML = `

    <div class="report-rank-grid">

      <div>

        <div style="font-size:.8rem;font-weight:700;color:var(--danger);margin-bottom:.5rem">🏆 TOP 3</div>

        <div class="report-rank-list">${top3.map(rankItemHTML).join('')}</div>

      </div>

      <div>

        <div style="font-size:.8rem;font-weight:700;color:#3b82f6;margin-bottom:.5rem">📉 BOTTOM 3</div>

        <div class="report-rank-list">${bottom3.map(rankItemHTML).join('')}</div>

      </div>

    </div>

  `;


  // ── 3. 거래 내역 (투자 일지 기반) ───────────────────────

  const monthJournals = journals.filter(j => j.date?.startsWith(month))

                                .sort((a, b) => a.date.localeCompare(b.date));

  const typeLabel = { buy: '🟥 매수', sell: '🟦 매도', watch: '👁 관찰' };

  const tradeHTML = monthJournals.length ? `

    <div class="report-trade-list">

      ${monthJournals.map(j => `

        <div class="report-trade-item">

          <span class="badge ${j.type === 'buy' ? 'badge-buy' : j.type === 'sell' ? 'badge-sell' : 'badge-hold'}">${typeLabel[j.type] || j.type}</span>

          <span class="report-trade-name">${j.name}</span>

          <span style="font-size:.82rem;color:var(--text-muted)">${j.date}</span>

          ${j.qty   ? `<span style="font-size:.82rem">${fmt.number(j.qty)}주</span>` : ''}

          ${j.price ? `<span style="font-size:.82rem">@${fmt.money(j.price)}</span>` : ''}

          ${j.tags?.length ? `<span style="font-size:.75rem;color:var(--primary)">${j.tags.join(' · ')}</span>` : ''}

          ${j.reason ? `<span class="report-trade-reason">"${escapeHtml(j.reason)}"</span>` : ''}

        </div>

      `).join('')}

    </div>

  ` : '<p style="font-size:.85rem;color:var(--text-muted)">이 달 거래 기록이 없어요.</p>';


  // ── 4. 배당금 ────────────────────────────────────────────

  const monthDivs   = divs.filter(d => d.date?.startsWith(month));

  const divTotalNet = monthDivs.reduce((s, d) => s + (d.net || 0), 0);

  const divHTML = monthDivs.length ? `

    <div style="display:flex;flex-direction:column;gap:.4rem">

      ${monthDivs.map(d => `

        <div class="report-rank-item">

          <span style="font-size:1rem">${d.type === 'stock' ? '📦' : '💵'}</span>

          <span class="report-rank-name">${d.name}</span>

          <span style="font-size:.8rem;color:var(--text-muted)">${d.date}</span>

          <span class="report-rank-val" style="color:var(--success)">세후 ${fmt.money(Math.round(d.net || 0))}</span>

        </div>

      `).join('')}

      <div style="padding:.5rem .6rem;font-size:.88rem;font-weight:700;color:var(--success);text-align:right;border-top:1px solid var(--border);margin-top:.2rem">

        합계 ${fmt.money(Math.round(divTotalNet))}

      </div>

    </div>

  ` : '<p style="font-size:.85rem;color:var(--text-muted)">이 달 배당금 기록이 없어요.</p>';


  // ── 5. 리밸런싱 현황 ─────────────────────────────────────

  let rebalHTML = '<p style="font-size:.85rem;color:var(--text-muted)">저장된 목표 비중이 없어요.</p>';

  if (Object.keys(target).length) {

    const totalEval = evalEnd;

    const rebalRows = dataEnd.map(r => {

      const ct       = target[r.category];

      const catPct   = ct?.pct || 0;

      const stockPct = ct?.stocks?.[r.name] || 0;

      const targetPct = catPct * stockPct / 100;

      const currentPct = totalEval > 0 ? (r.evalAmt / totalEval * 100) : 0;

      const diff = targetPct - currentPct;

      return { name: r.name, currentPct, targetPct, diff };

    }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 8);

    rebalHTML = `

      <div class="rebal-status-list">

        ${rebalRows.map(r => {

          const barColor = Math.abs(r.diff) > 3 ? (r.diff > 0 ? '#ef4444' : '#3b82f6') : '#10b981';

          const fillW    = Math.min(Math.abs(r.currentPct), 100);

          return `

            <div class="rebal-status-item">

              <span class="rebal-status-name">${r.name}</span>

              <div class="rebal-status-bar-wrap">

                <div class="rebal-status-bar-fill" style="width:${fillW}%;background:${barColor}"></div>

              </div>

              <span class="rebal-status-pct ${Math.abs(r.diff) > 3 ? (r.diff > 0 ? 'positive' : 'negative') : 'zero'}">

                현재 ${r.currentPct.toFixed(1)}% / 목표 ${r.targetPct.toFixed(1)}%

              </span>

            </div>

          `;

        }).join('')}

      </div>

    `;

  }


  // ── 최종 조립 ────────────────────────────────────────────

  return `

    <div class="report-wrap">

      <div class="report-header">

        <div>

          <div class="report-header-title">📋 ${year}년 ${parseInt(mon)}월 포트폴리오 리포트</div>

          <div class="report-header-date">기준: ${dateEnd}${dateStart && dateStart !== dateEnd ? ` · 비교: ${dateStart}` : ''}</div>

        </div>

        <div style="font-size:.85rem;opacity:.9">생성일 ${new Date().toLocaleDateString('ko-KR')}</div>

      </div>

      <div class="report-block">

        <div class="report-block-title">📊 성과 요약</div>

        <div class="report-block-body">${kpiHTML}</div>

      </div>

      <div class="report-block">

        <div class="report-block-title">🏆 종목별 성과 TOP / BOTTOM</div>

        <div class="report-block-body">${rankHTML}</div>

      </div>

      <div class="report-block">

        <div class="report-block-title">🔄 거래 내역 <span style="font-size:.78rem;font-weight:400;color:var(--text-muted)">(투자 일지 기반)</span></div>

        <div class="report-block-body">${tradeHTML}</div>

      </div>

      <div class="report-block">

        <div class="report-block-title">💰 배당금 수령</div>

        <div class="report-block-body">${divHTML}</div>

      </div>

      <div class="report-block">

        <div class="report-block-title">🎯 리밸런싱 현황 <span style="font-size:.78rem;font-weight:400;color:var(--text-muted)">(차이 큰 순)</span></div>

        <div class="report-block-body">${rebalHTML}</div>

      </div>

    </div>

  `;

}


/* ═══════════════════════════════════════════════════════════
   ← 변경: 사이드바 네비게이션 시스템
═══════════════════════════════════════════════════════════ */

const NAV_ITEMS = [
  { target: 'uploadSection',      label: '📂 STEP 1 · 포트폴리오 업로드' },
  { target: 'categorySection',    label: '🗂 STEP 2 · 카테고리 확인' },
  { target: 'targetSection',      label: '🎯 STEP 3 · 목표 비중 설정' },
  { target: 'rebalanceSection',   label: '🔄 STEP 4 · 리밸런싱 결과' },
  { target: 'reportSection',      label: '📊 STEP 5 · 리포트' },
  { target: 'dashboardSection',   label: '📋 현재 포트폴리오' },
  { target: 'historySection',     label: '📅 포트폴리오 히스토리' },
  { target: 'journalSection',     label: '📓 투자 일지' },
  { target: 'dividendSection',    label: '💰 배당금 기록' },
  { target: 'contributionSection',label: '💹 수익 기여도' },
  { target: 'compareSection',     label: '🔍 날짜 간 비교' },
];

// 모바일 드롭다운 옵션 생성
/* ═══════════════════════════════════════════════════════════
   ← 변경: 자동 백업 알림 배너
═══════════════════════════════════════════════════════════ */

const BACKUP_INTERVAL_DAYS = 7; // ← 백업 권장 주기 (일)

const BACKUP_SNOOZE_KEY    = 'portfolio_backup_snooze'; // 오늘 하루 숨기기

function renderBackupBanner() {

  const existing = document.getElementById('backupBanner');

  if (existing) existing.remove();

  const today      = new Date().toISOString().slice(0, 10);

  const lastBackup = store.lastBackup();

  const snoozeDate = localStorage.getItem(BACKUP_SNOOZE_KEY);

  // 오늘 이미 닫은 경우 표시 안 함

  if (snoozeDate === today) return;

  // 데이터가 없으면 배너 불필요

  if (!Object.keys(store.history()).length) return;

  // 마지막 백업으로부터 경과 일수 계산

  let daysSince = null;

  if (lastBackup) {

    const diff = new Date(today) - new Date(lastBackup);

    daysSince  = Math.floor(diff / (1000 * 60 * 60 * 24));

  }

  // 한 번도 백업 안 했거나 주기 초과 시 배너 표시

  if (lastBackup && daysSince < BACKUP_INTERVAL_DAYS) return;

  const msg = lastBackup

    ? `마지막 백업으로부터 <strong>${daysSince}일</strong>이 지났어요.`

    : `아직 백업을 한 번도 하지 않았어요.`;

  const banner = document.createElement('div');

  banner.id        = 'backupBanner';

  banner.className = 'backup-banner';

  banner.innerHTML = `

    <div class="backup-banner-left">

      <span class="backup-banner-icon">💾</span>

      <span class="backup-banner-msg">데이터를 백업해두세요! ${msg} 브라우저 데이터가 지워지면 복구할 수 없어요.</span>

    </div>

    <div class="backup-banner-actions">

      <button class="btn btn-success btn-sm" id="backupNowBtn">지금 백업하기</button>

      <button class="backup-banner-close" id="backupSnoozeBtn" title="오늘 하루 숨기기">✕</button>

    </div>

  `;

  // STEP 1 섹션 맨 위에 삽입

  const uploadSection = document.getElementById('uploadSection');

  uploadSection.insertBefore(banner, uploadSection.firstChild);

  document.getElementById('backupNowBtn').addEventListener('click', () => {

    doExport();

  });

  document.getElementById('backupSnoozeBtn').addEventListener('click', () => {

    localStorage.setItem(BACKUP_SNOOZE_KEY, today);

    banner.remove();

  });

}

function buildMobileNav() {
  const nav     = document.getElementById('mobileDrawerNav');
  const menuBtn = document.getElementById('mobileMenuBtn');
  const overlay = document.getElementById('mobileDrawerOverlay');
  const drawer  = document.getElementById('mobileDrawer');
  const closeBtn= document.getElementById('mobileDrawerClose');
  if (!nav) return;

  // 드로어 nav 아이템 생성
  nav.innerHTML = NAV_ITEMS.map(n => `
    <button class="mobile-drawer-item" data-target="${n.target}">
      <span class="mobile-drawer-label">${n.label}</span>
      <svg class="mobile-drawer-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>`).join('');

  // 드로어 열기/닫기
  function openDrawer() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  menuBtn.addEventListener('click', openDrawer);
  closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);

  // 항목 클릭
  nav.querySelectorAll('.mobile-drawer-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.target === 'categorySection') {
        const saved = getLatestSavedData();
        if (saved) {
          parsedData = saved;
          renderCategorySection(saved, currentNewStocks);
        }
      }
      navigateTo(btn.dataset.target);
      closeDrawer();
    });
  });
}

function syncMobileDrawerActive(targetId) {
  document.querySelectorAll('.mobile-drawer-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === targetId);
  });
}

// 섹션 전환
function navigateTo(targetId) {

  // 모든 page-section 숨기기
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));

  // 목표 섹션 표시
  const target = document.getElementById(targetId);
  if (target) target.classList.add('active');

  // 사이드바 active 상태
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === targetId);
  });

  // 모바일 드로어 active 동기화
  syncMobileDrawerActive(targetId);

  // ← 변경: 섹션 표시 후 차트 재렌더 (display:none 상태에서 그리면 크기 0으로 잡히는 문제 해결)
  setTimeout(() => {

    if (targetId === 'dashboardSection') {
      // 현재 포트폴리오 — 파이차트 리사이즈
      [pieChartInst, catPieChartInst].forEach(c => { if (c) c.resize(); });
    }

    if (targetId === 'historySection') {
      // 날짜별 추이 — 라인차트 리사이즈 + 히스토리 파이차트 재렌더
      if (lineChartInst) lineChartInst.resize();
      const history = store.history();
      if (Object.keys(history).length) {
        // historyPieInst는 destroy 후 재생성해야 크기를 올바르게 잡음
        destroyChart(historyPieInst);
        historyPieInst = null;
        showHistorySlide(history);
      }
    }

  }, 60); // ← 섹션이 완전히 표시된 후 실행되도록 60ms 대기
}

// 사이드바 버튼 이벤트
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.target === 'categorySection') {
      // 항상 최신 저장 데이터 + categoryMap 적용 버전으로 표시
      const saved = getLatestSavedData();
      if (saved) {
        parsedData = saved;
        renderCategorySection(saved, currentNewStocks);
      }
    }
    navigateTo(btn.dataset.target);
  });
});

// CSV 업로드/저장 완료 후 → 현재 포트폴리오 페이지로 이동
function navigateToDashboard() { navigateTo('dashboardSection'); }

// STEP 2 확인 완료 → STEP 3으로
const _origConfirmCat = document.getElementById('confirmCategoryBtn').onclick;
document.getElementById('confirmCategoryBtn').addEventListener('click', () => {
  navigateTo('targetSection');
});

// ← 변경: saveTargetBtn 네비게이션은 저장 성공 시 메인 리스너에서 처리 (중복 리스너 제거)


/* ═══════════════════════════════════════════════════════════
   ← 변경: 다크모드 토글
═══════════════════════════════════════════════════════════ */

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const icon = dark ? '☀️' : '🌙';
  const dt = document.getElementById('themeToggle');
  const mt = document.getElementById('mobileThemeToggle');
  if (dt) dt.textContent = icon;
  if (mt) mt.textContent = icon;
  localStorage.setItem('portfolio_theme', dark ? 'dark' : 'light');
}

function initTheme() {
  const saved = localStorage.getItem('portfolio_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ? saved === 'dark' : prefersDark);
}

['themeToggle', 'mobileThemeToggle'].forEach(id => {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    applyTheme(!isDark);
  });
});

initTheme(); // ← 변경: 페이지 로드 시 테마 적용


/* ═══════════════════════════════════════════════════════════

   초기화

═══════════════════════════════════════════════════════════ */

document.getElementById('uploadDate').valueAsDate = new Date();

// ← 변경: 모바일 네비게이션 드롭다운 초기화
buildMobileNav();

renderBackupBanner(); // ← 변경: 백업 알림 배너 초기화

// ← 변경: 새로고침 후 localStorage 최신 데이터로 parsedData + STEP 3/4 복원

(function restoreLatestData() {

  const history = store.history();

  const dates   = Object.keys(history).sort();

  if (!dates.length) return;

  const latest = dates[dates.length - 1];

  parsedData = history[latest];

  const target = store.target();

  if (Object.keys(target).length) {

    renderTargetSection(parsedData);

  }

})();

renderAllHistory();

renderDateChips();

renderJournalSection();

renderDividendSection();

renderReportMonthSelect(); // ← 변경: 초기 로드시 리포트 월 셀렉트 표시

/* ═══════════════════════════════════════════════════════════
   소개 토글 (← 추가)
═══════════════════════════════════════════════════════════ */
(function () { // ← 추가
  const bar    = document.getElementById('introToggleBar');  // ← 추가
  const panel  = document.getElementById('introPanel');      // ← 추가
  const arrow  = document.getElementById('introToggleArrow'); // ← 추가
  const label  = document.getElementById('introToggleText'); // ← 추가

  if (!bar || !panel) return; // ← 추가

  bar.addEventListener('click', () => { // ← 추가
    const isOpen = panel.classList.toggle('open'); // ← 추가
    arrow.classList.toggle('open', isOpen); // ← 추가
    label.textContent = isOpen // ← 추가
      ? '사용 가이드 닫기' // ← 추가
      : '이 앱이 처음이세요? 사용 가이드 보기'; // ← 추가
  }); // ← 추가

  const copyBtn    = document.getElementById('introCopyBtn');    // ← 추가
  const promptText = document.getElementById('introPromptText'); // ← 추가

  if (copyBtn && promptText) { // ← 추가
    const originalHTML = copyBtn.innerHTML; // ← 추가
    copyBtn.addEventListener('click', () => { // ← 추가
      const text = promptText.textContent.trim(); // ← 추가
      function onSuccess() { // ← 추가
        copyBtn.innerHTML = '✓ 복사됨'; // ← 추가
        setTimeout(() => { copyBtn.innerHTML = originalHTML; }, 2000); // ← 추가
      } // ← 추가
      if (navigator.clipboard && window.isSecureContext) { // ← 추가
        navigator.clipboard.writeText(text).then(onSuccess).catch(() => fallback(text)); // ← 추가
      } else { // ← 추가
        // HTTP 환경(로컬 IP) 폴백 // ← 추가
        const el = document.createElement('textarea'); // ← 추가
        el.value = text; // ← 추가
        el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;'; // ← 추가
        document.body.appendChild(el); // ← 추가
        el.focus(); el.select(); // ← 추가
        document.execCommand('copy'); // ← 추가
        document.body.removeChild(el); // ← 추가
        onSuccess(); // ← 추가
      } // ← 추가
    }); // ← 추가
  } // ← 추가
})(); // ← 추가
