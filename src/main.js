import './styles.css';
import './fonts.css';
import './overrides.css';
import { supabase, supabaseConfigError } from './supabase.js';

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
  ],
  savings: []
};
const legacyState = JSON.parse(localStorage.getItem(KEY) || 'null');
let state = { settings: { ...seed.settings }, records: [], savings: [] };
let activeTab = 'home';
let filter = { start: iso(startOfMonth(today)), end: iso(endOfMonth(today)), label: '이번 달' };
let editingId = null;
let householdId = null;
let realtimeChannel = null;
let editingSavingsId = null;

function appError(error) { console.error(error); alert('저장 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.'); }
function toAppRecord(row) { return { id: row.id, date: row.date, amount: Number(row.amount), restaurant: row.restaurant || '', menu: row.menu || '', category: row.category, memo: row.memo || '', createdAt: Date.parse(row.created_at), updatedAt: Date.parse(row.updated_at) }; }
function toSavingsEntry(row) { return { id: row.id, date: row.recorded_on, amount: Number(row.amount), note: row.note || '', createdAt: Date.parse(row.created_at), updatedAt: Date.parse(row.updated_at) }; }
function inviteUrl(token) { return `${location.origin}${location.pathname}?invite=${encodeURIComponent(token)}`; }
async function copyInviteLink() {
  const token = sessionStorage.getItem('dining-calendar-invite-token');
  if (!token) return alert('이 공간의 초대 링크를 찾지 못했어요. 처음 만든 기기에서 앱을 다시 열어주세요.');
  const link = inviteUrl(token);
  try {
    await navigator.clipboard.writeText(link);
    alert('초대 링크를 복사했어요. 남편에게 보내주세요.');
  } catch {
    window.prompt('초대 링크를 복사해주세요.', link);
  }
}
function save() { persistSettings().catch(appError); }

async function persistSettings() {
  const { error } = await supabase.from('household_settings').update({
    monthly_budget: state.settings.monthlyBudget,
    selected_theme: state.settings.selectedTheme,
    updated_at: new Date().toISOString()
  }).eq('household_id', householdId);
  if (error) throw error;
}

async function loadRemoteState() {
  const [{ data: settings, error: settingsError }, { data: records, error: recordsError }, { data: savings, error: savingsError }] = await Promise.all([
    supabase.from('household_settings').select('*').eq('household_id', householdId).maybeSingle(),
    supabase.from('dining_records').select('*').eq('household_id', householdId).order('date', { ascending: false }),
    supabase.from('savings_entries').select('*').eq('household_id', householdId).order('recorded_on', { ascending: false })
  ]);
  if (settingsError) throw settingsError;
  if (recordsError) throw recordsError;
  if (savingsError) throw savingsError;
  state = {
    settings: { ...seed.settings, monthlyBudget: settings?.monthly_budget ?? seed.settings.monthlyBudget, selectedTheme: settings?.selected_theme ?? seed.settings.selectedTheme },
    records: records.map(toAppRecord),
    savings: savings.map(toSavingsEntry)
  };
}

async function migrateLegacyState() {
  if (!legacyState || state.records.length) return;
  const records = (legacyState.records || []).map(({ companion, id, createdAt, updatedAt, ...record }) => ({
    ...record,
    id: id || crypto.randomUUID(),
    household_id: householdId,
    amount: Number(record.amount)
  }));
  if (records.length) {
    const { error } = await supabase.from('dining_records').insert(records);
    if (error) throw error;
  }
  state.settings = { ...state.settings, ...legacyState.settings };
  await persistSettings();
  localStorage.removeItem(KEY);
  await loadRemoteState();
}

async function startRealtime() {
  realtimeChannel?.unsubscribe();
  realtimeChannel = supabase.channel(`dining-calendar-${householdId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dining_records', filter: `household_id=eq.${householdId}` }, async () => {
      await loadRemoteState();
      layout();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'household_settings', filter: `household_id=eq.${householdId}` }, async () => {
      await loadRemoteState();
      layout();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'savings_entries', filter: `household_id=eq.${householdId}` }, async () => {
      await loadRemoteState();
      layout();
    })
    .subscribe();
}

async function bootstrap() {
  if (supabaseConfigError) throw new Error(supabaseConfigError);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }
  const inviteToken = new URLSearchParams(location.search).get('invite');
  if (inviteToken) {
    const { data, error } = await supabase.rpc('join_household', { invite_token: inviteToken });
    if (error) throw error;
    householdId = data;
    sessionStorage.setItem('dining-calendar-invite-token', inviteToken);
    history.replaceState({}, '', location.pathname);
  }
  if (!householdId) {
    const { data: membership, error } = await supabase.from('household_members').select('household_id').limit(1).maybeSingle();
    if (error) throw error;
    householdId = membership?.household_id;
  }
  if (!householdId) {
    const { data, error } = await supabase.rpc('create_household');
    if (error) throw error;
    householdId = data[0].household_id;
    sessionStorage.setItem('dining-calendar-invite-token', data[0].invite_token);
    setTimeout(() => window.prompt('남편에게 보낼 초대 링크예요.', inviteUrl(data[0].invite_token)), 0);
  }
  await loadRemoteState();
  await migrateLegacyState();
  await startRealtime();
  layout();
}
function recordsBetween(start, end) { return state.records.filter(r => r.date >= start && r.date <= end).sort((a, b) => b.date.localeCompare(a.date)); }
function currentMonthRecords() { return recordsBetween(iso(startOfMonth(today)), iso(endOfMonth(today))); }
function sum(rs) { return rs.reduce((a, r) => a + Number(r.amount), 0); }
function pct(total, budget = state.settings.monthlyBudget) { return budget ? (total / budget) * 100 : 0; }
function esc(s = '') { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }

function icon(name) { return `<span class="icon icon-${name}" aria-hidden="true"></span>`; }
function layout() {
  const view = activeTab === 'home' ? home() : activeTab === 'records' ? recordsView() : activeTab === 'assets' ? assetsView() : activeTab === 'stats' ? statsView() : settingsView();
  document.querySelector('#app').innerHTML = `<main class="app-shell theme-${state.settings.selectedTheme}">${view}</main>`;
  bind();
}
function topbar(title, action = '', subtitle = '') { return `<header class="topbar"><div><p class="eyebrow">DINING CALENDAR</p><h1>${title}</h1>${subtitle ? `<p class="topbar-subtitle">${subtitle}</p>` : ''}</div>${action}</header>`; }
function summaryCard(rs = currentMonthRecords()) {
  const total = sum(rs), budget = state.settings.monthlyBudget, rate = pct(total), diff = budget - total;
  return `<section class="summary-card"><div class="summary-stats"><div><span>이번 달 사용</span><strong>${money(total)}</strong></div><div><span>목표 예산</span><b>${money(budget)}</b></div><div><span>사용률</span><b class="rate-value">${rate.toFixed(rate % 1 ? 1 : 0)}%</b></div></div><div class="summary-foot"><span class="${diff < 0 ? 'over' : ''}">${diff < 0 ? `예산 초과 ${money(Math.abs(diff))}` : `남은 예산 ${money(diff)}`}</span><div class="progress"><span style="width:${Math.min(rate, 100)}%"></span></div>${rate > 100 ? `<small class="over-copy">100% + ${Math.round(rate - 100)}% 초과</small>` : ''}</div></section>`;
}
function modeData(rate, hasRecords) {
  if (rate < 20) return hasRecords
    ? { title: '가볍게 맛있는 시간을 쌓았어요.', sub: '아직 여유가 있으니 다음 기록도 남겨보세요.' }
    : { title: '아직 배가 고파요!', sub: '이번 달 첫 외식을 기록해보세요.' };
  if (rate < 40) return { title: '맛있는 걸 조금 먹었어요.', sub: '천천히 맛있는 시간을 쌓아가요.' };
  if (rate < 60) return { title: `배부름 ${Math.round(rate)}%`, sub: '이번 달도 맛있게 즐기고 있어요!' };
  if (rate < 80) return { title: '슬슬 배가 꽉 차고 있어요.', sub: '그래도 기록은 계속할 수 있어요.' };
  if (rate < 100) return { title: '거의 배불러요!', sub: '이번 달의 맛있는 순간을 돌아봐요.' };
  return { title: '배가 빵빵해졌어요!', sub: '맛있는 기록이 가득 쌓였네요.' };
}
function characterAsset(rate) {
  if (rate < 20) return 'character-stage-1.png';
  if (rate < 40) return 'character-stage-2.png';
  if (rate < 60) return 'character-stage-3.png';
  if (rate < 80) return 'character-stage-4.png';
  if (rate < 100) return 'character-stage-5.png';
  return 'character-stage-6.png';
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
  const monthRecords = currentMonthRecords();
  const total = sum(monthRecords), rate = pct(total), d = modeData(rate, monthRecords.length > 0);
  if (state.settings.selectedTheme === 'cake') return `<div class="visual-stack"><section class="visual visual-cake"><img class="generated-visual" src="/illustrations/${cakeAsset(rate)}" alt="외식비 사용률에 따른 케이크 장면"></section>${statusBar('MONTHLY DESSERT', rate < 100 ? `케이크 ${Math.round(rate)}% 먹었어요` : rate < 150 ? '추가 디저트까지 먹는 중!' : '이번 달은 디저트 파티가 됐어요!', rate < 100 ? `남은 케이크 약 ${Math.max(0, Math.ceil((100 - rate) / 12.5))}조각` : '케이크는 다 먹었지만 외식은 계속됐어요!')}</div>`;
  if (state.settings.selectedTheme === 'car') return `<div class="visual-stack"><section class="visual visual-car"><img class="generated-visual" src="/illustrations/${carAsset(rate)}" alt="외식비 사용률에 따른 자동차 드라이브 장면"></section>${statusBar('MONTHLY DRIVE', rate < 100 ? `현재 위치 ${Math.round(rate)}%` : rate < 150 ? '추가 드라이브 중!' : rate < 200 ? '생각보다 멀리 왔네요!' : '이번 달은 장거리 드라이브네요!', rate < 100 ? '나만의 외식 코스를 달리는 중이에요.' : '결승선을 지나서도 계속 달릴 수 있어요.')}</div>`;
  return `<div class="visual-stack"><section class="visual visual-character"><img class="character-generated" src="/illustrations/${characterAsset(rate)}" alt="외식비 사용률에 따른 캐릭터 배부르기 장면"></section>${statusBar('MONTHLY APPETITE', esc(d.title), esc(d.sub))}</div>`;
}
function recent(rs) { return `<section class="section-block"><div class="section-heading"><h2>최근 외식 기록</h2><button class="text-button" data-tab="records">더보기 ${icon('arrow')}</button></div>${rs.length ? `<div class="record-list compact">${rs.slice(0, 3).map(recordRow).join('')}</div>` : emptyState('이번 달 첫 외식을 기록해보세요.')}</section>`; }
function categoryAsset(category) { return { '동석 외식': 'category-dongseok.png', '희랑 외식': 'category-huirang.png', '같이 외식': 'category-together.png', '대리비': 'category-driver.png' }[category] || 'category-together.png'; }
function categoryImage(category) { return `<img src="/illustrations/${categoryAsset(category)}" alt="" aria-hidden="true">`; }
function recordRow(r) { return `<button class="record-row" data-edit="${r.id}"><span class="record-icon with-category">${categoryImage(r.category)}</span><span class="record-info"><strong>${esc(r.restaurant || '이름 없는 외식')}</strong><small>${esc(r.menu || r.category)}</small></span><span class="record-date">${fmtDate(r.date)}</span><b>${money(r.amount)}</b></button>`; }
function emptyState(msg) { return `<div class="empty-state"><p>${msg}</p><button class="secondary-button" data-action="add">외식 기록 추가</button></div>`; }
function home() { return `${topbar(monthLabel(today), `<button class="icon-button" data-tab="settings" aria-label="설정">${icon('settings')}</button>`, '맛있는 오늘이 모여 행복한 한 달이에요') }<div class="home-content">${summaryCard()}${visualization()}<div class="home-actions"><button class="primary-button" data-action="add">${icon('plus')} 외식 기록</button></div>${recent(currentMonthRecords())}</div>${nav()}`; }
function nav() { return `<nav class="bottom-nav">${[['home','홈','home'],['records','기록','list'],['assets','자산','vault'],['stats','통계','chart'],['settings','설정','settings']].map(([id, label, ico]) => `<button class="nav-item ${activeTab === id ? 'active' : ''}" data-tab="${id}">${icon(ico)}<span>${label}</span></button>`).join('')}</nav>`; }

function filterPanel() { return `<section class="filter-panel"><div class="quick-filters">${['오늘','최근 7일','최근 30일','이번 달','지난 달','직접 선택'].map(x => `<button class="chip ${filter.label === x ? 'selected' : ''}" data-quick="${x}">${x}</button>`).join('')}</div><div class="date-fields"><label>시작일<input id="filter-start" type="date" value="${filter.start}"></label><span>부터</span><label>종료일<input id="filter-end" type="date" value="${filter.end}"></label><button class="small-button" data-action="apply-filter">조회</button></div><p class="field-error" id="filter-error"></p></section>`; }
function rangeSummary(rs) { const total = sum(rs), diningCount = rs.filter(r => r.category !== '대리비').length, category = mostSpentCategory(rs), restaurant = mostCommon(rs.map(r => r.restaurant).filter(Boolean)); return `<div class="range-summary"><span>조회 기간</span><strong>${filter.start.replaceAll('-', '.')} ~ ${filter.end.replaceAll('-', '.')}</strong><div class="summary-grid"><div><span>총 외식비</span><b>${money(total)}</b></div><div><span>외식 횟수</span><b>${diningCount}회</b></div><div><span>1회 평균</span><b>${money(rs.length ? total / rs.length : 0)}</b></div><div><span>가장 많이 사용</span><b>${category || '-'}</b></div></div>${restaurant ? `<small>가장 많이 방문한 식당 · ${esc(restaurant)}</small>` : ''}</div>`; }
function mostSpentCategory(rs) { const totals = {}; rs.forEach(record => { totals[record.category] = (totals[record.category] || 0) + Number(record.amount); }); return Object.keys(totals).sort((a, b) => totals[b] - totals[a])[0] || ''; }
function mostCommon(a) { if (!a.length) return ''; const m = {}; a.forEach(x => m[x] = (m[x] || 0) + 1); return Object.keys(m).sort((x, y) => m[y] - m[x])[0]; }
function latestSavings() { return [...state.savings].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)[0] || null; }
function savingsChange() { const entries = [...state.savings].sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt); if (entries.length < 2) return null; const latest = entries[entries.length - 1]; const previous = entries[entries.length - 2]; return { amount: latest.amount - previous.amount, previous, latest }; }
function savingsMood() { const change = savingsChange(); if (!latestSavings()) return { title: '우리 가족 금고를 열어볼까요?', sub: '현재 저축액을 한 번 기록해보세요.' }; if (!change) return { title: '첫 저축 기록을 간직하고 있어요.', sub: '다음 기록부터 변화가 보여요.' }; if (change.amount > 0) return { title: '금고가 조금 더 든든해졌어요!', sub: `지난 기록보다 ${money(change.amount)} 늘었어요.` }; if (change.amount < 0) return { title: '금고를 잘 지켜보고 있어요.', sub: `지난 기록보다 ${money(Math.abs(change.amount))} 줄었어요.` }; return { title: '금고가 그대로 든든해요.', sub: '지난 기록과 같은 금액이에요.' }; }
function savingsCharacter() { const mood = savingsMood(); return `<section class="savings-hero"><div class="savings-copy"><span class="visual-kicker">FAMILY SAVINGS</span><h2>${esc(mood.title)}</h2><p>${esc(mood.sub)}</p><div class="savings-total"><span>현재 총 저축액</span><strong>${money(latestSavings()?.amount || 0)}</strong></div></div><img src="/illustrations/savings-vault-fairy.png" alt="저축 상태를 알려주는 금고요정"></section>`; }
function savingsEntryRow(entry, index, entries) { const previous = entries[index + 1]; const change = previous ? entry.amount - previous.amount : null; return `<button class="savings-row" data-savings-edit="${entry.id}"><span class="savings-date">${entry.date.replaceAll('-', '.')}</span><span class="savings-entry-info"><strong>${money(entry.amount)}</strong><small>${esc(entry.note || '저축액 기록')}</small></span><span class="savings-change ${change > 0 ? 'up' : change < 0 ? 'down' : ''}">${change === null ? '첫 기록' : `${change > 0 ? '+' : ''}${money(change)}`}</span>${icon('arrow')}</button>`; }
function assetsView() { const entries = [...state.savings].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt); const change = savingsChange(); return `${topbar('자산', `<button class="icon-button" data-action="add-savings" aria-label="저축액 기록 추가">${icon('plus')}</button>`, '우리 가족의 저축 흐름을 함께 살펴봐요') }<div class="page-content assets-page">${savingsCharacter()}${change ? `<section class="asset-change"><span>최근 변화</span><strong class="${change.amount >= 0 ? 'up' : 'down'}">${change.amount > 0 ? '+' : ''}${money(change.amount)}</strong><small>${change.latest.date.replaceAll('-', '.')} 기준 · 직전 기록과 비교</small></section>` : ''}<section class="section-block"><div class="section-heading"><h2>저축액 변화 기록 <span>${entries.length}</span></h2></div>${entries.length ? `<div class="savings-list">${entries.map((entry, index) => savingsEntryRow(entry, index, entries)).join('')}</div>` : `<div class="empty-state"><p>아직 저축액 기록이 없어요.</p><button class="secondary-button" data-action="add-savings">현재 저축액 입력</button></div>`}</section><section class="asset-tip"><strong>기록하는 방법</strong><p>잔액이 바뀔 때마다 현재 금액을 남기면 가족의 저축 흐름이 이어져요.</p></section></div>${nav()}`; }
function recordsView() { const rs = recordsBetween(filter.start, filter.end); return `${topbar('기록', `<button class="icon-button" data-action="add" aria-label="기록 추가">${icon('plus')}</button>`)}<div class="page-content"><div class="page-intro"><p>내가 먹은 맛있는 순간을 모아봤어요.</p></div>${filterPanel()}${rangeSummary(rs)}<section class="section-block"><div class="section-heading"><h2>외식 내역 <span>${rs.length}</span></h2></div>${rs.length ? `<div class="record-list">${rs.map(recordRow).join('')}</div>` : emptyState('선택한 기간에 외식 기록이 없어요.')}</section></div>${nav()}`; }
function statsView() { const rs = recordsBetween(filter.start, filter.end), total = sum(rs), diningCount = rs.filter(r => r.category !== '대리비').length, grouped = categories.map(c => [c, sum(rs.filter(r => r.category === c))]).filter(x => x[1]); const monthTotals = Array.from({length: 6}, (_, i) => { const d = new Date(today.getFullYear(), today.getMonth() - 5 + i, 1); return [d.getMonth() + 1, sum(recordsBetween(iso(startOfMonth(d)), iso(endOfMonth(d))))]; }); const max = Math.max(1, ...monthTotals.map(x => x[1])); const categoryMax = Math.max(1, ...grouped.map(x => x[1])); return `${topbar('통계', `<button class="icon-button" data-action="add" aria-label="기록 추가">${icon('plus')}</button>`)}<div class="page-content"><div class="stats-switch"><span>조회 기간</span><button class="select-button" data-action="toggle-range">${filter.label} ${icon('chevron')}</button></div>${filter.label === '직접 선택' || filter.label === '오늘' || filter.label === '최근 7일' || filter.label === '최근 30일' || filter.label === '이번 달' || filter.label === '지난 달' ? filterPanel() : ''}<section class="stat-hero"><span>선택 기간 총 외식비</span><strong>${money(total)}</strong><div><b>${diningCount}회</b><b>평균 ${money(rs.length ? total / rs.length : 0)}</b></div></section><section class="chart-section"><div class="section-heading"><h2>카테고리별 지출 분석</h2></div>${grouped.length ? `<div class="bar-chart">${grouped.map(([c, v]) => `<div class="bar-row"><span class="category-label">${categoryImage(c)}<span>${c}</span></span><div><i style="width:${Math.max(8, v / categoryMax * 100)}%"></i></div><b>${money(v)}</b></div>`).join('')}</div>` : emptyState('기록이 생기면 카테고리별 지출을 보여드려요.')}</section><section class="chart-section"><div class="section-heading"><h2>최근 6개월 비교</h2></div><div class="month-chart">${monthTotals.map(([m, v]) => `<div class="month-bar"><div class="bar-value" style="height:${Math.max(4, v / max * 100)}%"></div><span>${m}월</span></div>`).join('')}</div></section></div>${nav()}`; }

function settingsView() { const s = state.settings; return `${topbar('설정')}<div class="page-content settings-page"><section class="settings-group"><h2>월간 목표 예산</h2><label class="currency-input"><input id="budget-input" type="number" min="0" step="10000" value="${s.monthlyBudget}"><span>원</span></label><p>예산을 넘어도 기록과 통계는 계속 이어져요.</p></section><section class="settings-group"><h2>홈 화면 스타일</h2><div class="theme-options">${[['character','캐릭터 배부르기','파스텔 그린'],['cake','월급 케이크','딸기 크림'],['car','자동차 드라이브','하늘색 도로']].map(([id, name, desc]) => `<button class="theme-option ${s.selectedTheme === id ? 'selected' : ''}" data-theme="${id}"><span class="theme-thumb thumb-${id}"></span><span><strong>${name}</strong><small>${desc}</small></span>${s.selectedTheme === id ? icon('check') : ''}</button>`).join('')}</div></section><section class="settings-group"><h2>함께 쓰기</h2><button class="secondary-button invite-button" data-action="copy-invite">${icon('link')} 초대 링크 복사</button><p>이 링크를 연 사람은 이 앱의 같은 기록 공간에 참여할 수 있어요.</p></section><section class="settings-group"><h2>데이터 관리</h2><div class="settings-actions"><button class="secondary-button" data-action="backup">${icon('download')} 데이터 백업</button><button class="secondary-button" data-action="restore">${icon('upload')} 백업 데이터 불러오기</button><input id="restore-input" type="file" accept="application/json" hidden></div></section><section class="danger-zone"><h2>주의가 필요한 작업</h2><button class="danger-button" data-action="clear">전체 데이터 삭제</button></section></div>${nav()}`; }

function modal() { return `<div class="modal-backdrop" id="modal"><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>${editingId ? '외식 기록 수정' : '새 외식 기록'}</h2><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('close')}</button></div><form id="record-form"><div class="form-grid"><label>날짜 *<input name="date" type="date" required value="${editingId ? state.records.find(r => r.id === editingId).date : iso(today)}"></label><label>금액 *<input name="amount" type="number" min="0" required placeholder="24000" value="${editingId ? state.records.find(r => r.id === editingId).amount : ''}"></label></div><label>식당명<input name="restaurant" placeholder="예: 소담 파스타" value="${editingId ? esc(state.records.find(r => r.id === editingId).restaurant) : ''}"></label><label>메뉴<input name="menu" placeholder="예: 크림파스타, 에이드" value="${editingId ? esc(state.records.find(r => r.id === editingId).menu) : ''}"></label><label>카테고리<select name="category">${categories.map(c => `<option ${editingId && state.records.find(r => r.id === editingId).category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label>메모<textarea name="memo" rows="2" placeholder="남기고 싶은 이야기">${editingId ? esc(state.records.find(r => r.id === editingId).memo) : ''}</textarea></label><div class="modal-actions">${editingId ? '<button type="button" class="danger-button" data-action="delete-record">삭제</button>' : ''}<button type="button" class="secondary-button" data-action="close-modal">취소</button><button class="primary-button" type="submit">저장하기</button></div></form></section></div>`; }
function savingsModal() { const entry = editingSavingsId ? state.savings.find(item => item.id === editingSavingsId) : null; return `<div class="modal-backdrop" id="modal"><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>${entry ? '저축액 기록 수정' : '현재 저축액 입력'}</h2><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('close')}</button></div><form id="savings-form"><label>기록 날짜 *<input name="date" type="date" required value="${entry?.date || iso(today)}"></label><label>현재 총 저축액 *<input name="amount" type="number" min="0" step="1" required placeholder="1000000" value="${entry?.amount ?? ''}"></label><label>메모<textarea name="note" rows="2" placeholder="예: 월급 저축 반영">${entry ? esc(entry.note) : ''}</textarea></label><div class="modal-actions">${entry ? '<button type="button" class="danger-button" data-action="delete-savings">삭제</button>' : ''}<button type="button" class="secondary-button" data-action="close-modal">취소</button><button class="primary-button" type="submit">저장하기</button></div></form></section></div>`; }

function openModal(id = null) { editingId = id; document.body.insertAdjacentHTML('beforeend', modal()); bind(); }
function openSavingsModal(id = null) { editingSavingsId = id; document.body.insertAdjacentHTML('beforeend', savingsModal()); bind(); document.querySelector('#savings-form input[name="amount"]')?.focus(); }
function bind() { document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { activeTab = b.dataset.tab; layout(); }); document.querySelectorAll('[data-action="add"]').forEach(b => b.onclick = () => openModal()); document.querySelectorAll('[data-action="add-savings"]').forEach(b => b.onclick = () => openSavingsModal()); document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openModal(b.dataset.edit)); document.querySelectorAll('[data-savings-edit]').forEach(b => b.onclick = () => openSavingsModal(b.dataset.savingsEdit)); document.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => { state.settings.selectedTheme = b.dataset.theme; save(); layout(); }); document.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => quickRange(b.dataset.quick)); document.querySelectorAll('[data-action="apply-filter"]').forEach(b => b.onclick = applyFilter); document.querySelectorAll('[data-action="toggle-range"]').forEach(b => b.onclick = () => { filter.label = filter.label === '이번 달' ? '직접 선택' : '이번 달'; layout(); }); const budget = document.querySelector('#budget-input'); if (budget) budget.onchange = () => { state.settings.monthlyBudget = Number(budget.value) || 0; save(); layout(); }; document.querySelectorAll('[data-action="close-modal"]').forEach(b => b.onclick = () => { document.querySelector('#modal')?.remove(); editingId = null; editingSavingsId = null; }); document.querySelector('[data-action="delete-record"]')?.addEventListener('click', deleteRecord); document.querySelector('[data-action="delete-savings"]')?.addEventListener('click', deleteSavings); document.querySelector('#record-form')?.addEventListener('submit', submitRecord); document.querySelector('#savings-form')?.addEventListener('submit', submitSavings); document.querySelector('[data-action="backup"]')?.addEventListener('click', backup); document.querySelector('[data-action="copy-invite"]')?.addEventListener('click', copyInviteLink); const restore = document.querySelector('[data-action="restore"]'); restore?.addEventListener('click', () => document.querySelector('#restore-input').click()); document.querySelector('#restore-input')?.addEventListener('change', restoreData); document.querySelector('[data-action="clear"]')?.addEventListener('click', clearData); }
function quickRange(label) { const t = new Date(); let a, b = t; if (label === '오늘') a = t; else if (label === '최근 7일') { a = new Date(t); a.setDate(t.getDate() - 6); } else if (label === '최근 30일') { a = new Date(t); a.setDate(t.getDate() - 29); } else if (label === '지난 달') { a = new Date(t.getFullYear(), t.getMonth() - 1, 1); b = endOfMonth(a); } else { a = startOfMonth(t); b = endOfMonth(t); } filter = { start: iso(a), end: iso(b), label }; layout(); }
function applyFilter() { const start = document.querySelector('#filter-start').value, end = document.querySelector('#filter-end').value, err = document.querySelector('#filter-error'); if (!start || !end) { err.textContent = '시작일과 종료일을 모두 입력해주세요.'; return; } if (start > end) { err.textContent = '시작일은 종료일보다 이전이어야 합니다.'; return; } filter = { start, end, label: '직접 선택' }; layout(); }
async function submitRecord(e) { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); const payload = { date: data.date, amount: Number(data.amount), restaurant: data.restaurant || null, menu: data.menu || null, category: data.category, memo: data.memo || '' }; const query = editingId ? supabase.from('dining_records').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId).eq('household_id', householdId) : supabase.from('dining_records').insert({ ...payload, household_id: householdId }); const { error } = await query; if (error) return appError(error); await loadRemoteState(); document.querySelector('#modal').remove(); editingId = null; layout(); }
async function deleteRecord() { if (!confirm('이 외식 기록을 삭제할까요?')) return; const { error } = await supabase.from('dining_records').delete().eq('id', editingId).eq('household_id', householdId); if (error) return appError(error); await loadRemoteState(); document.querySelector('#modal').remove(); editingId = null; layout(); }
function backup() { const blob = new Blob([JSON.stringify({ app: 'dining-calendar', version: 2, exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `가족기록_${iso(today)}.json`; a.click(); URL.revokeObjectURL(a.href); }
function restoreData(e) { const file = e.target.files[0]; if (!file || !confirm('현재 저장된 데이터가 변경될 수 있습니다. 백업 데이터를 불러올까요?')) return; const reader = new FileReader(); reader.onload = () => { try { const incoming = JSON.parse(reader.result); if (incoming.app !== 'dining-calendar' || !Array.isArray(incoming.records) || !incoming.settings) throw new Error(); state = { settings: { ...seed.settings, ...incoming.settings }, records: incoming.records.map(({ companion, ...record }) => record), savings: Array.isArray(incoming.savings) ? incoming.savings : [] }; save(); layout(); alert('백업 데이터를 불러왔어요.'); } catch { alert('이 앱에서 만든 올바른 JSON 백업 파일이 아니에요.'); } }; reader.readAsText(file); }
async function submitSavings(e) { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); const payload = { recorded_on: data.date, amount: Number(data.amount), note: data.note || null, updated_at: new Date().toISOString() }; const query = editingSavingsId ? supabase.from('savings_entries').update(payload).eq('id', editingSavingsId).eq('household_id', householdId) : supabase.from('savings_entries').insert({ ...payload, household_id: householdId }); const { error } = await query; if (error) return appError(error); await loadRemoteState(); document.querySelector('#modal').remove(); editingSavingsId = null; layout(); }
async function deleteSavings() { if (!confirm('이 저축액 기록을 삭제할까요?')) return; const { error } = await supabase.from('savings_entries').delete().eq('id', editingSavingsId).eq('household_id', householdId); if (error) return appError(error); await loadRemoteState(); document.querySelector('#modal').remove(); editingSavingsId = null; layout(); }
async function clearData() { if (!confirm('모든 외식 기록, 저축 기록과 설정이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.')) return; const [{ error: recordsError }, { error: savingsError }] = await Promise.all([supabase.from('dining_records').delete().eq('household_id', householdId), supabase.from('savings_entries').delete().eq('household_id', householdId)]); if (recordsError || savingsError) return appError(recordsError || savingsError); state = { ...seed, records: [], savings: [] }; await persistSettings(); layout(); }

bootstrap().catch(error => {
  console.error(error);
  document.querySelector('#app').innerHTML = `<main class="app-shell"><div class="page-content" style="padding-top:48px"><section class="empty-state"><h2>앱 설정이 아직 끝나지 않았어요.</h2><p>${esc(error.message || 'Supabase 연결에 실패했어요.')}</p></section></div></main>`;
});
