import './styles.css';
import './fonts.css';
import './overrides.css';

const KEY = 'dining-calendar-v1';
const categories = ['동석 외식', '희랑 외식', '대리비', '같이 외식'];
const today = new Date();
const iso = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const money = n => `${Math.round(n).toLocaleString('ko-KR')}원`;
const monthLabel = d => `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
const parseLocal = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const startOfMonth = d => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = d => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const fmtDate = s => { const d = parseLocal(s); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };

const seed = {
  settings: { monthlyBudget: 400000, selectedTheme: 'character', selectedCharacter: 'cat', selectedCar: 'compact', selectedCake: 'strawberry' },
  records: [
    { id: crypto.randomUUID(), date: iso(new Date(today.getFullYear(), today.getMonth(), 3)), amount: 24000, restaurant: '소담 파스타', menu: '크림파스타, 에이드', category: '동석 외식', memo: '', createdAt: Date.now(), updatedAt: Date.now() },
    { id: crypto.randomUUID(), date: iso(new Date(today.getFullYear(), today.getMonth(), 8)), amount: 18500, restaurant: '버거룸', menu: '버거 세트', category: '희랑 외식', memo: '', createdAt: Date.now(), updatedAt: Date.now() },
    { id: crypto.randomUUID(), date: iso(new Date(today.getFullYear(), today.getMonth(), 13)), amount: 9000, restaurant: '오늘의 집밥', menu: '김치찌개, 공기밥', category: '같이 외식', memo: '', createdAt: Date.now(), updatedAt: Date.now() }
  ]
};
let state = JSON.parse(localStorage.getItem(KEY) || 'null') || seed;
let activeTab = 'home';
let filter = { start: iso(startOfMonth(today)), end: iso(endOfMonth(today)), label: '이번 달' };
let editingId = null;

function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
function recordsBetween(start, end) { return state.records.filter(r => r.date >= start && r.date <= end).sort((a, b) => b.date.localeCompare(a.date)); }
function currentMonthRecords() { return recordsBetween(iso(startOfMonth(today)), iso(endOfMonth(today))); }
function sum(rs) { return rs.reduce((a, r) => a + Number(r.amount), 0); }
function pct(total, budget = state.settings.monthlyBudget) { return budget ? (total / budget) * 100 : 0; }
function esc(s = '') { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }

function icon(name) { return `<span class="icon icon-${name}" aria-hidden="true"></span>`; }
function layout() {
  const view = activeTab === 'home' ? home() : activeTab === 'records' ? recordsView() : activeTab === 'stats' ? statsView() : settingsView();
  document.querySelector('#app').innerHTML = `<main class="app-shell theme-${state.settings.selectedTheme}">${view}</main>`;
  bind();
}
function topbar(title, action = '', subtitle = '') { return `<header class="topbar"><div><p class="eyebrow">DINING CALENDAR</p><h1>${title}</h1>${subtitle ? `<p class="topbar-subtitle">${subtitle}</p>` : ''}</div>${action}</header>`; }
function summaryCard(rs = currentMonthRecords()) {
  const total = sum(rs), budget = state.settings.monthlyBudget, rate = pct(total), diff = budget - total;
  return `<section class="summary-card"><div class="summary-stats"><div><span>이번 달 사용</span><strong>${money(total)}</strong></div><div><span>목표 예산</span><b>${money(budget)}</b></div><div><span>사용률</span><b class="rate-value">${rate.toFixed(rate % 1 ? 1 : 0)}%</b></div></div><div class="summary-foot"><span class="${diff < 0 ? 'over' : ''}">${diff < 0 ? `예산 초과 ${money(Math.abs(diff))}` : `남은 예산 ${money(diff)}`}</span><div class="progress"><span style="width:${Math.min(rate, 100)}%"></span></div>${rate > 100 ? `<small class="over-copy">100% + ${Math.round(rate - 100)}% 초과</small>` : ''}</div></section>`;
}
function modeData(rate) {
  if (rate < 25) return { title: '아직 배가 고파요!', sub: '이번 달 첫 외식을 기록해보세요.' };
  if (rate < 50) return { title: '맛있는 걸 조금 먹었어요.', sub: '천천히 맛있는 시간을 쌓아가요.' };
  if (rate < 75) return { title: `배부름 ${Math.round(rate)}%`, sub: '이번 달도 맛있게 즐기고 있어요!' };
  if (rate < 90) return { title: '슬슬 배가 꽉 차고 있어요.', sub: '그래도 기록은 계속할 수 있어요.' };
  if (rate < 100) return { title: '거의 배불러요!', sub: '이번 달의 맛있는 순간을 돌아봐요.' };
  if (rate < 120) return { title: '앗! 예산보다 조금 더 먹었어요.', sub: '외식은 계속 기록할 수 있어요.' };
  if (rate < 150) return { title: '배가 빵빵해졌어요!', sub: '예산을 조금 많이 넘겼어요.' };
  if (rate < 200) return { title: '이제 정말 배불러요…!', sub: '맛있는 기록이 가득 쌓였네요.' };
  return { title: '이번 달은 정말 많이 먹었네요!', sub: '다음 맛있는 순간도 편하게 기록해요.' };
}
function characterAsset(rate) {
  if (rate < 25) return 'character-00-hungry.png';
  if (rate < 50) return 'character-25-lightly-full.png';
  if (rate < 75) return 'character-50-happy-full.png';
  if (rate < 100) return 'character-75-very-full.png';
  if (rate === 100) return 'character-100-complete.png';
  if (rate < 150) return 'character-101-over.png';
  return 'character-150-extra-full.png';
}
function cakeAsset(rate) {
  if (rate < 25) return 'cake-00-whole.png';
  if (rate < 50) return 'cake-25-slice.png';
  if (rate < 75) return 'cake-50-half.png';
  if (rate < 100) return 'cake-75-nearly-gone.png';
  return 'cake-100-dessert-party.png';
}
function carAsset(rate) {
  if (rate < 25) return 'car-00-start.png';
  if (rate < 50) return 'car-25-cruise.png';
  if (rate < 75) return 'car-50-middle.png';
  if (rate < 100) return 'car-75-near-finish.png';
  return 'car-100-long-drive.png';
}
function sceneDecorations(theme, rate) {
  const stage = rate < 25 ? 'start' : rate < 50 ? 'light' : rate < 75 ? 'middle' : rate < 100 ? 'full' : 'over';
  const food = (name, position) => `<img class="scene-food scene-food-${position}" src="/illustrations/${name}" alt="" aria-hidden="true">`;
  const sparkle = position => `<i class="scene-sparkle scene-sparkle-${position}" aria-hidden="true"></i>`;
  if (theme === 'character') {
    const props = stage === 'start' ? `${food('food-pasta.png', 'top-left')}${food('food-drink.png', 'right')}`
      : stage === 'light' ? `${food('food-pizza.png', 'top-left')}${sparkle('right')}`
      : stage === 'middle' ? `${food('food-pasta.png', 'top-left')}${food('food-burger.png', 'right')}${sparkle('left')}`
      : stage === 'full' ? `${food('food-burger.png', 'top-left')}${food('food-drink.png', 'right')}${sparkle('top')}`
      : `${food('food-pizza.png', 'top-left')}${food('food-drink.png', 'right')}${sparkle('top')}${sparkle('left')}`;
    return `<div class="scene-decorations scene-character-decorations stage-${stage}">${props}</div>`;
  }
  if (theme === 'cake') {
    const props = stage === 'start' ? `${sparkle('left')}${sparkle('right')}`
      : stage === 'light' ? `${food('food-drink.png', 'right')}${sparkle('left')}`
      : stage === 'middle' ? `${food('food-pizza.png', 'left')}${sparkle('right')}`
      : stage === 'full' ? `${food('food-drink.png', 'left')}${food('food-pizza.png', 'right')}`
      : `${food('food-pizza.png', 'left')}${food('food-drink.png', 'right')}${sparkle('top')}`;
    return `<div class="scene-decorations scene-cake-decorations stage-${stage}">${props}</div>`;
  }
  const props = stage === 'start' ? `${sparkle('left')}`
    : stage === 'light' ? `${sparkle('left')}${sparkle('right')}`
    : stage === 'middle' ? `${food('food-drink.png', 'right')}${sparkle('left')}`
    : stage === 'full' ? `${food('food-burger.png', 'left')}${sparkle('right')}`
    : `${food('food-pizza.png', 'left')}${food('food-drink.png', 'right')}${sparkle('top')}`;
  return `<div class="scene-decorations scene-car-decorations stage-${stage}">${props}</div>`;
}
function statusBar(kicker, title, subtitle) {
  return `<section class="visual-status"><span class="visual-kicker">${kicker}</span><h2>${title}</h2><p>${subtitle}</p></section>`;
}
function visualization() {
  const total = sum(currentMonthRecords()), rate = pct(total), d = modeData(rate);
  if (state.settings.selectedTheme === 'cake') return `<div class="visual-stack"><section class="visual visual-cake"><img class="generated-visual" src="/illustrations/${cakeAsset(rate)}" alt="외식비 사용률에 따른 케이크 장면"></section>${statusBar('MONTHLY DESSERT', rate < 100 ? `케이크 ${Math.round(rate)}% 먹었어요` : rate < 150 ? '추가 디저트까지 먹는 중!' : '이번 달은 디저트 파티가 됐어요!', rate < 100 ? `남은 케이크 약 ${Math.max(0, Math.ceil((100 - rate) / 12.5))}조각` : '케이크는 다 먹었지만 외식은 계속됐어요!')}</div>`;
  if (state.settings.selectedTheme === 'car') return `<div class="visual-stack"><section class="visual visual-car"><img class="generated-visual" src="/illustrations/${carAsset(rate)}" alt="외식비 사용률에 따른 자동차 드라이브 장면"></section>${statusBar('MONTHLY DRIVE', rate < 100 ? `현재 위치 ${Math.round(rate)}%` : rate < 150 ? '추가 드라이브 중!' : rate < 200 ? '생각보다 멀리 왔네요!' : '이번 달은 장거리 드라이브네요!', rate < 100 ? '나만의 외식 코스를 달리는 중이에요.' : '결승선을 지나서도 계속 달릴 수 있어요.')}</div>`;
  return `<div class="visual-stack"><section class="visual visual-character"><img class="character-generated" src="/illustrations/${characterAsset(rate)}" alt="외식비 사용률에 따른 고양이 캐릭터"></section>${statusBar('MONTHLY APPETITE', esc(d.title), esc(d.sub))}</div>`;
}
function recent(rs) { return `<section class="section-block"><div class="section-heading"><h2>최근 외식 기록</h2><button class="text-button" data-tab="records">더보기 ${icon('arrow')}</button></div>${rs.length ? `<div class="record-list compact">${rs.slice(0, 3).map(recordRow).join('')}</div>` : emptyState('이번 달 첫 외식을 기록해보세요.')}</section>`; }
function foodAsset(r) {
  const details = `${r.restaurant || ''} ${r.menu || ''}`.toLowerCase();
  if (details.includes('피자') || details.includes('pizza')) return 'food-pizza.png';
  if (details.includes('버거') || details.includes('burger')) return 'food-burger.png';
  if (details.includes('파스타') || details.includes('pasta')) return 'food-pasta.png';
  if (/커피|음료|에이드|주스|라떼|티\b/.test(details)) return 'food-drink.png';
  return '';
}
function recordRow(r) { const iconType = r.category === '대리비' ? 'cup' : 'bowl'; const food = foodAsset(r); const recordIcon = food ? `<img src="/illustrations/${food}" alt="" aria-hidden="true">` : icon(iconType); return `<button class="record-row" data-edit="${r.id}"><span class="record-icon ${food ? 'with-food' : iconType}">${recordIcon}</span><span class="record-info"><strong>${esc(r.restaurant || '이름 없는 외식')}</strong><small>${esc(r.menu || r.category)}</small></span><span class="record-date">${fmtDate(r.date)}</span><b>${money(r.amount)}</b></button>`; }
function emptyState(msg) { return `<div class="empty-state">${icon('spark')}<p>${msg}</p><button class="secondary-button" data-action="add">외식 기록 추가</button></div>`; }
function home() { return `${topbar(monthLabel(today), `<button class="icon-button" data-tab="settings" aria-label="설정">${icon('settings')}</button>`, '맛있는 오늘이 모여 행복한 한 달이에요') }<div class="home-content">${summaryCard()}${visualization()}<div class="home-actions"><button class="primary-button" data-action="add">${icon('plus')} 외식 기록</button></div>${recent(currentMonthRecords())}</div>${nav()}`; }
function nav() { return `<nav class="bottom-nav">${[['home','홈','home'],['records','기록','list'],['stats','통계','chart'],['settings','설정','settings']].map(([id, label, ico]) => `<button class="nav-item ${activeTab === id ? 'active' : ''}" data-tab="${id}">${icon(ico)}<span>${label}</span></button>`).join('')}</nav>`; }

function filterPanel() { return `<section class="filter-panel"><div class="quick-filters">${['오늘','최근 7일','최근 30일','이번 달','지난 달','직접 선택'].map(x => `<button class="chip ${filter.label === x ? 'selected' : ''}" data-quick="${x}">${x}</button>`).join('')}</div><div class="date-fields"><label>시작일<input id="filter-start" type="date" value="${filter.start}"></label><span>부터</span><label>종료일<input id="filter-end" type="date" value="${filter.end}"></label><button class="small-button" data-action="apply-filter">조회</button></div><p class="field-error" id="filter-error"></p></section>`; }
function rangeSummary(rs) { const total = sum(rs), category = mostCommon(rs.map(r => r.category)), restaurant = mostCommon(rs.map(r => r.restaurant).filter(Boolean)); return `<div class="range-summary"><span>조회 기간</span><strong>${filter.start.replaceAll('-', '.')} ~ ${filter.end.replaceAll('-', '.')}</strong><div class="summary-grid"><div><span>총 외식비</span><b>${money(total)}</b></div><div><span>외식 횟수</span><b>${rs.length}회</b></div><div><span>1회 평균</span><b>${money(rs.length ? total / rs.length : 0)}</b></div><div><span>가장 많이 사용</span><b>${category || '-'}</b></div></div>${restaurant ? `<small>가장 많이 방문한 식당 · ${esc(restaurant)}</small>` : ''}</div>`; }
function mostCommon(a) { if (!a.length) return ''; const m = {}; a.forEach(x => m[x] = (m[x] || 0) + 1); return Object.keys(m).sort((x, y) => m[y] - m[x])[0]; }
function recordsView() { const rs = recordsBetween(filter.start, filter.end); return `${topbar('기록', `<button class="icon-button" data-action="add" aria-label="기록 추가">${icon('plus')}</button>`)}<div class="page-content"><div class="page-intro"><p>내가 먹은 맛있는 순간을 모아봤어요.</p></div>${filterPanel()}${rangeSummary(rs)}<section class="section-block"><div class="section-heading"><h2>외식 내역 <span>${rs.length}</span></h2></div>${rs.length ? `<div class="record-list">${rs.map(recordRow).join('')}</div>` : emptyState('선택한 기간에 외식 기록이 없어요.')}</section></div>${nav()}`; }
function statsView() { const rs = recordsBetween(filter.start, filter.end), total = sum(rs), grouped = categories.map(c => [c, sum(rs.filter(r => r.category === c))]).filter(x => x[1]); const monthTotals = Array.from({length: 6}, (_, i) => { const d = new Date(today.getFullYear(), today.getMonth() - 5 + i, 1); return [d.getMonth() + 1, sum(recordsBetween(iso(startOfMonth(d)), iso(endOfMonth(d))))]; }); const max = Math.max(1, ...monthTotals.map(x => x[1])); return `${topbar('통계', `<button class="icon-button" data-action="add" aria-label="기록 추가">${icon('plus')}</button>`)}<div class="page-content"><div class="stats-switch"><span>조회 기간</span><button class="select-button" data-action="toggle-range">${filter.label} ${icon('chevron')}</button></div>${filter.label === '직접 선택' || filter.label === '오늘' || filter.label === '최근 7일' || filter.label === '최근 30일' || filter.label === '이번 달' || filter.label === '지난 달' ? filterPanel() : ''}<section class="stat-hero"><span>선택 기간 총 외식비</span><strong>${money(total)}</strong><div><b>${rs.length}회</b><b>평균 ${money(rs.length ? total / rs.length : 0)}</b></div></section><section class="chart-section"><div class="section-heading"><h2>카테고리별 지출</h2></div>${grouped.length ? `<div class="bar-chart">${grouped.map(([c, v]) => `<div class="bar-row"><span>${c}</span><div><i style="width:${Math.max(8, v / Math.max(...grouped.map(x => x[1])) * 100)}%"></i></div><b>${money(v)}</b></div>`).join('')}</div>` : emptyState('기록이 생기면 카테고리별 지출을 보여드려요.')}</section><section class="chart-section"><div class="section-heading"><h2>최근 6개월 비교</h2></div><div class="month-chart">${monthTotals.map(([m, v]) => `<div class="month-bar"><div class="bar-value" style="height:${Math.max(4, v / max * 100)}%"></div><span>${m}월</span></div>`).join('')}</div></section></div>${nav()}`; }

function settingsView() { const s = state.settings; return `${topbar('설정')}<div class="page-content settings-page"><section class="settings-group"><h2>월간 목표 예산</h2><label class="currency-input"><input id="budget-input" type="number" min="0" step="10000" value="${s.monthlyBudget}"><span>원</span></label><p>예산을 넘어도 기록과 통계는 계속 이어져요.</p></section><section class="settings-group"><h2>홈 화면 스타일</h2><div class="theme-options">${[['character','캐릭터 배부르기','파스텔 그린'],['cake','월급 케이크','딸기 크림'],['car','자동차 드라이브','하늘색 도로']].map(([id, name, desc]) => `<button class="theme-option ${s.selectedTheme === id ? 'selected' : ''}" data-theme="${id}"><span class="theme-thumb thumb-${id}"></span><span><strong>${name}</strong><small>${desc}</small></span>${s.selectedTheme === id ? icon('check') : ''}</button>`).join('')}</div></section><section class="settings-group"><h2>데이터 관리</h2><div class="settings-actions"><button class="secondary-button" data-action="backup">${icon('download')} 데이터 백업</button><button class="secondary-button" data-action="restore">${icon('upload')} 백업 데이터 불러오기</button><input id="restore-input" type="file" accept="application/json" hidden></div></section><section class="danger-zone"><h2>주의가 필요한 작업</h2><button class="danger-button" data-action="clear">전체 데이터 삭제</button></section></div>${nav()}`; }

function modal() { return `<div class="modal-backdrop" id="modal"><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>${editingId ? '외식 기록 수정' : '새 외식 기록'}</h2><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('close')}</button></div><form id="record-form"><div class="form-grid"><label>날짜 *<input name="date" type="date" required value="${editingId ? state.records.find(r => r.id === editingId).date : iso(today)}"></label><label>금액 *<input name="amount" type="number" min="0" required placeholder="24000" value="${editingId ? state.records.find(r => r.id === editingId).amount : ''}"></label></div><label>식당명<input name="restaurant" placeholder="예: 소담 파스타" value="${editingId ? esc(state.records.find(r => r.id === editingId).restaurant) : ''}"></label><label>메뉴<input name="menu" placeholder="예: 크림파스타, 에이드" value="${editingId ? esc(state.records.find(r => r.id === editingId).menu) : ''}"></label><label>카테고리<select name="category">${categories.map(c => `<option ${editingId && state.records.find(r => r.id === editingId).category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label>메모<textarea name="memo" rows="2" placeholder="남기고 싶은 이야기">${editingId ? esc(state.records.find(r => r.id === editingId).memo) : ''}</textarea></label><div class="modal-actions">${editingId ? '<button type="button" class="danger-button" data-action="delete-record">삭제</button>' : ''}<button type="button" class="secondary-button" data-action="close-modal">취소</button><button class="primary-button" type="submit">저장하기</button></div></form></section></div>`; }

function openModal(id = null) { editingId = id; document.body.insertAdjacentHTML('beforeend', modal()); bind(); }
function bind() { document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { activeTab = b.dataset.tab; layout(); }); document.querySelectorAll('[data-action="add"]').forEach(b => b.onclick = () => openModal()); document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openModal(b.dataset.edit)); document.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => { state.settings.selectedTheme = b.dataset.theme; save(); layout(); }); document.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => quickRange(b.dataset.quick)); document.querySelectorAll('[data-action="apply-filter"]').forEach(b => b.onclick = applyFilter); document.querySelectorAll('[data-action="toggle-range"]').forEach(b => b.onclick = () => { filter.label = filter.label === '이번 달' ? '직접 선택' : '이번 달'; layout(); }); const budget = document.querySelector('#budget-input'); if (budget) budget.onchange = () => { state.settings.monthlyBudget = Number(budget.value) || 0; save(); layout(); }; document.querySelectorAll('[data-action="close-modal"]').forEach(b => b.onclick = () => { document.querySelector('#modal')?.remove(); editingId = null; }); document.querySelector('[data-action="delete-record"]')?.addEventListener('click', deleteRecord); document.querySelector('#record-form')?.addEventListener('submit', submitRecord); document.querySelector('[data-action="backup"]')?.addEventListener('click', backup); const restore = document.querySelector('[data-action="restore"]'); restore?.addEventListener('click', () => document.querySelector('#restore-input').click()); document.querySelector('#restore-input')?.addEventListener('change', restoreData); document.querySelector('[data-action="clear"]')?.addEventListener('click', clearData); }
function quickRange(label) { const t = new Date(); let a, b = t; if (label === '오늘') a = t; else if (label === '최근 7일') { a = new Date(t); a.setDate(t.getDate() - 6); } else if (label === '최근 30일') { a = new Date(t); a.setDate(t.getDate() - 29); } else if (label === '지난 달') { a = new Date(t.getFullYear(), t.getMonth() - 1, 1); b = endOfMonth(a); } else { a = startOfMonth(t); b = endOfMonth(t); } filter = { start: iso(a), end: iso(b), label }; layout(); }
function applyFilter() { const start = document.querySelector('#filter-start').value, end = document.querySelector('#filter-end').value, err = document.querySelector('#filter-error'); if (!start || !end) { err.textContent = '시작일과 종료일을 모두 입력해주세요.'; return; } if (start > end) { err.textContent = '시작일은 종료일보다 이전이어야 합니다.'; return; } filter = { start, end, label: '직접 선택' }; layout(); }
function submitRecord(e) { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); const now = Date.now(); if (editingId) { const i = state.records.findIndex(r => r.id === editingId); const { companion, ...record } = state.records[i]; state.records[i] = { ...record, ...data, amount: Number(data.amount), updatedAt: now }; } else state.records.push({ ...data, id: crypto.randomUUID(), amount: Number(data.amount), createdAt: now, updatedAt: now }); save(); document.querySelector('#modal').remove(); editingId = null; layout(); }
function deleteRecord() { if (!confirm('이 외식 기록을 삭제할까요?')) return; state.records = state.records.filter(r => r.id !== editingId); save(); document.querySelector('#modal').remove(); editingId = null; layout(); }
function backup() { const blob = new Blob([JSON.stringify({ app: 'dining-calendar', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `외식비기록_${iso(today)}.json`; a.click(); URL.revokeObjectURL(a.href); }
function restoreData(e) { const file = e.target.files[0]; if (!file || !confirm('현재 저장된 데이터가 변경될 수 있습니다. 백업 데이터를 불러올까요?')) return; const reader = new FileReader(); reader.onload = () => { try { const incoming = JSON.parse(reader.result); if (incoming.app !== 'dining-calendar' || !Array.isArray(incoming.records) || !incoming.settings) throw new Error(); state = { settings: { ...seed.settings, ...incoming.settings }, records: incoming.records.map(({ companion, ...record }) => record) }; save(); layout(); alert('백업 데이터를 불러왔어요.'); } catch { alert('이 앱에서 만든 올바른 JSON 백업 파일이 아니에요.'); } }; reader.readAsText(file); }
function clearData() { if (!confirm('모든 외식 기록과 설정이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.')) return; state = { ...seed, records: [] }; save(); layout(); }

layout();
