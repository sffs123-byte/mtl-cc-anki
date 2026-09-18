/* MTL source replacement, not a clinical approval layer. IDs/SRS remain unchanged. */
(() => {
  'use strict';
  const prefix = 'mtl_cc_20260907_';
  const packet = window.MTLCCReplacement;
  const ids = new Set(Array.from({length:61},(_,i)=>'c'+(i+1)));
  let fallback = !packet || Object.keys(packet.replacements || {}).length !== 61 || [...ids].some(id=>!packet.replacements[id]);
  let legacy = new URL(location.href).searchParams.get('cc-version') === 'legacy' || fallback;
  const revision = packet?.revision || 'unavailable';
  const snapshot = Symbol('content-map-snapshot');
  const suffixes = new Set(['edits_v1','guide_edits_v1','draw_v2','crop_edits_v1','crop_orig_v1']);
  const isContentKey = key => key.startsWith(prefix) && suffixes.has(key.slice(prefix.length));
  const versionKey = key => prefix + 'ccv1_' + revision + '_' + key.slice(prefix.length);
  const read = key => JSON.parse(localStorage.getItem(key) || '{}');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function conflict() { const e = new Error('다른 화면에서 저장한 내용이 있습니다. 현재 입력은 유지됩니다.'); e.code = 'ANNOTATION_CONFLICT'; return e; }

  window.loadContentMap = function(key) {
    const original = read(key), versioned = !legacy && isContentKey(key) ? read(versionKey(key)) : null;
    const visible = {...original};
    if (versioned) for (const id of ids) {
      delete visible[id];
      if (Object.hasOwn(versioned,id)) visible[id] = versioned[id];
    }
    // Enumerable symbol survives a spread, but JSON serialization never stores it.
    visible[snapshot] = {key, original:structuredClone(original), versioned:structuredClone(versioned), visible:structuredClone(visible)};
    return visible;
  };
  window.saveContentMap = function(key, view) {
    if (window.MTLStorageRestoreInProgress) return;
    const previous = view[snapshot];
    if (!previous || previous.key !== key) throw new Error('Content storage snapshot missing');
    const original = read(key), versioned = previous.versioned === null ? null : read(versionKey(key));
    let originalChanged = false, versionChanged = false;
    const changedIds = [];
    for (const id of new Set([...Object.keys(previous.visible), ...Object.keys(view)])) {
      if (same(view[id], previous.visible[id])) continue;
      const isNew = versioned !== null && ids.has(id);
      const current = isNew ? versioned : original;
      const expected = isNew ? previous.versioned : previous.original;
      if (!same(current[id], expected[id])) throw conflict();
      if (Object.hasOwn(view,id)) current[id] = view[id]; else delete current[id];
      changedIds.push({id,isNew});
      if (isNew) versionChanged = true; else originalChanged = true;
    }
    const changes = [];
    if (originalChanged) changes.push([key, JSON.stringify(original)]);
    if (versionChanged) changes.push([versionKey(key), JSON.stringify(versioned)]);
    const before = changes.map(([key]) => [key,localStorage.getItem(key)]);
    try { for (const [key,value] of changes) localStorage.setItem(key,value); }
    catch (error) {
      for (const [key,value] of before) {
        try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key,value); } catch (_) {}
      }
      throw error;
    }
    // Keep untouched entries' old baselines: a save on A must never bless a
    // concurrent B revision while this in-memory view still contains stale B.
    const next = {key, original:structuredClone(previous.original), versioned:structuredClone(previous.versioned), visible:structuredClone(view)};
    for (const {id,isNew} of changedIds) {
      const target = isNew ? next.versioned : next.original;
      if (Object.hasOwn(view,id)) target[id] = structuredClone(view[id]); else delete target[id];
    }
    view[snapshot] = next;
  };
  window.MTLCCVersion = {ready:false, legacy, fallback, revision, ids:[...ids], versionKey};

  function versionLink(label, id) {
    const a = document.createElement('a'); a.className = 'cc-version-link'; a.textContent = label;
    const url = new URL(location.href);
    if (legacy) url.searchParams.delete('cc-version'); else url.searchParams.set('cc-version','legacy');
    url.searchParams.set('view','cards'); url.searchParams.set('mode','original');
    if (id) url.hash = 'card-' + id;
    a.href = url.href;
    a.addEventListener('click', event => {
      try { flushEditableChangesForBackup(); saveQuizSession(); }
      catch (error) { event.preventDefault(); alert(error.message); }
    });
    return a;
  }
  window.addEventListener('DOMContentLoaded', () => {
    // Validate every binding before changing the first visible card. If a
    // network/cache failure leaves data unavailable, use a clearly named old
    // version with fully working original storage, never a half-replaced page.
    if (!legacy && [...ids].some(id => {
      const replacement = packet.replacements[id];
      return !QUIZ_DATA[id] || QUIZ_DATA[id].q !== replacement.q || QUIZ_DATA[id].num !== replacement.num ||
        typeof replacement.a !== 'string' || typeof replacement.g !== 'string' || !document.getElementById('ans-content-'+id);
    })) { legacy = true; fallback = true; }
    Object.assign(window.MTLCCVersion,{legacy,fallback});
    edits=loadContentMap(EDITS_KEY);drawData=loadContentMap(DRAW_KEY);
    cropEdits=loadContentMap(CROP_EDITS_KEY);cropOriginals=loadContentMap(CROP_ORIG_KEY);
    for (const id of ids) {
      if (!legacy) {
        const replacement = packet.replacements[id];
        QUIZ_DATA[id].a = replacement.a; QUIZ_DATA[id].g = replacement.g;
        document.getElementById('ans-content-' + id).innerHTML = replacement.a;
      }
      const card = document.getElementById('card-' + id);
      card.dataset.ccVersion = legacy ? 'legacy' : revision;
      const nav = document.createElement('div'); nav.className = 'cc-version-nav';
      nav.append(versionLink(legacy ? '최신 MTL 대본 보기' : '이전 대본·내 수정 보기', id));
      card.querySelector('.card-body').prepend(nav);
    }
    const banner = document.createElement('aside'); banner.className = 'cc-version-banner';
    const label = document.createElement('span');
    label.textContent = fallback ? '새 MTL 자료를 불러오지 못했습니다. 현재 이전 대본입니다.' : legacy ? '이전 CC 대본 · 이전 버전의 수정·필기' : 'CC 대본 · MTL 9/18 첨부본';
    banner.append(label, versionLink(fallback ? '다시 불러오기' : legacy ? '최신 MTL로 돌아가기' : '이전 대본·내 기록'));
    document.getElementById('mainContent').prepend(banner);
    window.MTLCCVersion.ready = true;
    if (location.hash.startsWith('#card-')) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView(), 100);
  });
})();
