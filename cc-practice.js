/* Date-specific free practice. CC IDs are not case numbers or source-table IDs. */
(() => {
  'use strict';
  const prefix = 'mtl_cc_20260907_cc_practice_date_v1_';
  const ccIds = Array.from({length:61}, (_, i) => 'c' + (i + 1));
  const allowed = new Set(ccIds);
  let dialog, dateInput, search, list, count, status, start, savedDates;
  let activeDate = '', selected = new Set(), returnFocus = null;
  const key = date => prefix + date;
  function today() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T12:00:00');
    return !Number.isNaN(d.getTime()) && d.getFullYear() === Number(value.slice(0,4)) &&
      d.getMonth()+1 === Number(value.slice(5,7)) && d.getDate() === Number(value.slice(8));
  }
  function cleanIds(ids) { return Array.isArray(ids) ? ccIds.filter(id => ids.includes(id) && QUIZ_DATA[id]) : []; }
  function normalize(value) {
    if (!value || !validDate(value.date)) return null;
    const ids = cleanIds(value.ids);
    return ids.length ? {date:value.date, ids} : null;
  }
  function read(date) {
    const raw = localStorage.getItem(key(date));
    if (!raw) return [];
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || !Array.isArray(value.ids)) throw new Error('Invalid saved selection');
    return cleanIds(value.ids);
  }
  function message(text, error = false) { status.textContent = text; status.classList.toggle('is-error', error); }
  function refreshDates() {
    savedDates.replaceChildren(new Option('저장한 날짜 불러오기', ''));
    try {
      const dates = [];
      for (let i=0;i<localStorage.length;i++) {
        const name = localStorage.key(i);
        if (name?.startsWith(prefix) && validDate(name.slice(prefix.length))) dates.push(name.slice(prefix.length));
      }
      dates.sort().reverse().forEach(date => {
        try { savedDates.add(new Option(`${date} · ${read(date).length}개`, date)); } catch (_) {}
      });
    } catch (_) { /* The main status reports storage failures. */ }
  }
  function render() {
    const query = search.value.trim().toLocaleLowerCase().replace(/\s/g,'');
    let visible = 0;
    list.querySelectorAll('label').forEach(row => {
      row.hidden = !row.dataset.search.includes(query);
      if (!row.hidden) visible++;
      const box = row.querySelector('input');
      box.checked = selected.has(box.dataset.ccId);
    });
    document.getElementById('ccPracticeEmpty').hidden = visible > 0;
    count.textContent = `${selected.size} / ${ccIds.length} CC 선택`;
    start.textContent = `선택한 ${selected.size}개로 랜덤 시작`;
    start.disabled = !selected.size || !validDate(activeDate);
    document.getElementById('ccPracticeSelectAll').textContent = query ? '검색 결과 모두 선택' : '전체 선택';
  }
  function loadDate(date) {
    if (!validDate(date)) { dateInput.value = activeDate; message('올바른 연습 날짜를 선택해 주세요.', true); return; }
    activeDate = date; dateInput.value = date;
    try { selected = new Set(read(date)); message(selected.size ? '저장한 선택을 불러왔어요. 변경하면 자동 저장됩니다.' : 'CC를 체크하면 이 날짜에 자동 저장됩니다.'); }
    catch (_) { selected = new Set(); message('이 날짜의 선택을 읽지 못했어요. 다시 선택해 저장하거나 백업을 복원해 주세요.', true); }
    render(); refreshDates();
  }
  function changeSelection(change) {
    const before = selected;
    try {
      // Re-read this date so another tab's independent checkbox change survives.
      let latest;
      try { latest = new Set(read(activeDate)); } catch (_) { latest = new Set(selected); }
      change(latest);
      const ids = cleanIds([...latest]);
      localStorage.setItem(key(activeDate), JSON.stringify({version:1, ids, updatedAt:Date.now()}));
      selected = new Set(ids);
      message(`${activeDate} · ${ids.length}개 자동 저장됨`);
      refreshDates();
    } catch (_) { selected = before; message('선택을 저장하지 못해 변경을 되돌렸어요. 브라우저 저장공간을 확인해 주세요.', true); }
    render();
  }
  function open(date) {
    if (!dialog) return;
    returnFocus = document.activeElement;
    search.value = '';
    loadDate(validDate(date) ? date : (activeDate || today()));
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('cc-picker-open');
    dateInput.focus();
  }
  function close() { dialog.close(); }
  function launch(value) {
    const practice = normalize(value);
    if (!practice) return;
    try { flushEditableChangesForBackup(); saveQuizSession(); }
    catch (error) { if (dialog.open) message('현재 수정 내용을 저장한 뒤 다시 시작해 주세요.', true); else alert(error.message); return; }
    if (dialog.open) close();
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    document.getElementById('sbOverlay')?.classList.remove('active');
    const toggle = document.getElementById('sbMobileToggle'); if (toggle) toggle.textContent = '☰';
    startQuizWith(shuffledCopy(practice.ids), {orderMode:'random', pending:[], bonusMode:true, practice});
  }
  window.MTLCCPractice = {normalize, open, launch, cleanIds};
  window.addEventListener('DOMContentLoaded', () => {
    dialog = document.createElement('dialog'); dialog.id = 'ccPracticeDialog';
    dialog.setAttribute('aria-labelledby','ccPracticeTitle');
    dialog.innerHTML = `<div class="cc-picker-head"><div><h2 id="ccPracticeTitle">선택한 CC로 암기</h2><p>날짜별로 골라서, 고른 CC만 랜덤으로.</p></div><button type="button" id="ccPracticeClose" aria-label="CC 선택 닫기">✕</button></div>
      <div class="cc-picker-controls"><label>연습 날짜<input id="ccPracticeDate" type="date" required></label><label>저장한 목록<select id="ccPracticeSavedDates"></select></label><label class="cc-picker-search">CC 검색<input id="ccPracticeSearch" type="search" placeholder="예: 복통, 기침, 혈뇨" autocomplete="off"></label><div class="cc-picker-actions"><button type="button" id="ccPracticeSelectAll">전체 선택</button><button type="button" id="ccPracticeClear">전체 선택 해제</button><strong id="ccPracticeCount" role="status"></strong></div></div>
      <div id="ccPracticeList" class="cc-picker-list" role="group" aria-label="연습할 CC 체크리스트"></div><p id="ccPracticeEmpty" hidden>검색 결과가 없어요. 다른 CC 이름을 입력해 보세요.</p>
      <div class="cc-picker-foot"><p id="ccPracticeStatus" role="status" aria-live="polite"></p><p class="cc-picker-help">공통대본·증례 제외 · 이미 외운 CC도 연습 가능<br>기존 복습 일정은 바꾸지 않습니다. 선택 목록은 이 브라우저에 저장되며 백업에 포함됩니다.</p><button type="button" id="ccPracticeStart" disabled>선택한 0개로 랜덤 시작</button></div>`;
    document.body.append(dialog);
    dateInput = document.getElementById('ccPracticeDate'); search = document.getElementById('ccPracticeSearch');
    list = document.getElementById('ccPracticeList'); count = document.getElementById('ccPracticeCount');
    status = document.getElementById('ccPracticeStatus'); start = document.getElementById('ccPracticeStart');
    savedDates = document.getElementById('ccPracticeSavedDates');
    ccIds.forEach(id => {
      const title = document.createElement('div'); title.innerHTML = QUIZ_DATA[id].q;
      const text = title.textContent.trim();
      const row = document.createElement('label'); row.dataset.search = (id.slice(1)+' '+text).toLocaleLowerCase().replace(/\s/g,'');
      const box = document.createElement('input'); box.type = 'checkbox'; box.dataset.ccId = id;
      const name = document.createElement('span'); name.textContent = text;
      const number = document.createElement('small'); number.textContent = id.slice(1).padStart(2,'0');
      row.append(box, number, name); list.append(row);
    });
    document.addEventListener('click', event => { if (event.target.closest('[data-cc-practice-open]')) open(); });
    document.getElementById('ccPracticeClose').addEventListener('click',close);
    dialog.addEventListener('close', () => { document.body.classList.remove('cc-picker-open'); returnFocus?.focus(); });
    dateInput.addEventListener('change', () => loadDate(dateInput.value));
    savedDates.addEventListener('change', () => { if (savedDates.value) loadDate(savedDates.value); });
    search.addEventListener('input',render);
    list.addEventListener('change', event => {
      const id = event.target.dataset.ccId;
      if (allowed.has(id)) changeSelection(set => event.target.checked ? set.add(id) : set.delete(id));
    });
    document.getElementById('ccPracticeSelectAll').addEventListener('click', () => changeSelection(set => list.querySelectorAll('label:not([hidden]) input').forEach(box => set.add(box.dataset.ccId))));
    document.getElementById('ccPracticeClear').addEventListener('click', () => changeSelection(set => set.clear()));
    start.addEventListener('click', () => launch({date:activeDate,ids:[...selected]}));
    window.addEventListener('storage', event => {
      if (dialog.open && (event.key === key(activeDate) || event.key === null)) loadDate(activeDate);
    });
  });
})();
