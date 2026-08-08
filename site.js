// ---- Service Worker registration (offline support) ----
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}

// ---- Raid Tray ----
const RAID_TRAY_KEY = 'easytarkov-raidtray';

function loadTray(){
  try{
    const raw = localStorage.getItem(RAID_TRAY_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    return [];
  }
}

function saveTray(list){
  try{ localStorage.setItem(RAID_TRAY_KEY, JSON.stringify(list)); }catch(e){}
}

let raidTray = loadTray();

// ---- Custom items (not tied to any task page) ----
const CUSTOM_ITEMS_KEY = 'easytarkov-custom-items';
function loadCustomItems(){
  try{
    const raw = localStorage.getItem(CUSTOM_ITEMS_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch(e){
    return {};
  }
}
function saveCustomItems(obj){
  try{ localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(obj)); }catch(e){}
}
let customItems = loadCustomItems();

// ---- Starred (pinned-to-top) items within Current Raid ----
const STARRED_KEY = 'easytarkov-raidtray-starred';
function loadStarred(){
  try{
    const raw = localStorage.getItem(STARRED_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    return [];
  }
}
function saveStarred(list){
  try{ localStorage.setItem(STARRED_KEY, JSON.stringify(list)); }catch(e){}
}
let starredItems = loadStarred();

// ---- Team count: how many squad members are doing each pinned item (0-5) ----
const TEAM_COUNT_KEY = 'easytarkov-raidtray-teamcount';
function loadTeamCounts(){
  try{
    const raw = localStorage.getItem(TEAM_COUNT_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch(e){
    return {};
  }
}
function saveTeamCounts(obj){
  try{ localStorage.setItem(TEAM_COUNT_KEY, JSON.stringify(obj)); }catch(e){}
}
let teamCounts = loadTeamCounts();

const raidTrayEl = document.getElementById('raidTray');
const raidTrayToggle = document.getElementById('raidTrayToggle');
const raidTrayInfil = document.getElementById('raidTrayInfil');
const raidTrayCompact = document.getElementById('raidTrayCompact');
const NAMES_ONLY_KEY = 'easytarkov-raidtray-compact';

function loadNamesOnly(){
  try{ return localStorage.getItem(NAMES_ONLY_KEY) === '1'; }catch(e){ return false; }
}

function saveNamesOnly(active){
  try{ localStorage.setItem(NAMES_ONLY_KEY, active ? '1' : '0'); }catch(e){}
}
const raidTrayPanel = document.getElementById('raidTrayPanel');
const raidTrayCount = document.getElementById('raidTrayCount');

// ---- Flea market price lookup (tarkov.dev public API) ----
// Note: this data is PvP flea market pricing. tarkov.dev does not currently
// expose a confirmed PvE-specific price feed, so treat results as a general
// guide rather than exact PvE values.
async function fetchTarkovPrice(name){
  const res = await fetch('/api/price?name=' + encodeURIComponent(name));
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if(data.error) throw new Error(data.error);
  return data.items || [];
}

function bestTraderSell(item){
  const traderOffers = (item.sellFor || []).filter(s => s.source && s.source.toLowerCase() !== 'fleamarket');
  if(!traderOffers.length) return null;
  return traderOffers.reduce((best, cur) => cur.price > best.price ? cur : best);
}

function taskLookup(url){
  if(url.indexOf('custom:') === 0){
    const item = customItems[url];
    return { name: item ? item.name : 'Custom item', trader: 'Custom', level: null, custom: true };
  }
  const found = TASKS.find(t => t.url === url);
  if(found) return found;
  const readable = url.replace(/\.html$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { name: readable, trader: '', level: '' };
}

function applyInfilSizing(){
  if(!raidTrayEl.classList.contains('infil')) return;
  const header = document.querySelector('header');
  const barHeight = raidTrayEl.querySelector('.raid-tray-bar').getBoundingClientRect().height;
  // Hard ceiling: the bar must always stay on-screen, regardless of scroll position.
  // (If the header has scrolled out of view - e.g. on a tall mobile page - its
  // position can go negative, which would otherwise blow up the calculation below.)
  const maxPanelHeight = window.innerHeight - barHeight - 8;
  let panelHeight = header
    ? window.innerHeight - header.getBoundingClientRect().top - barHeight
    : window.innerHeight - barHeight - 40;
  panelHeight = Math.max(200, panelHeight);
  panelHeight = Math.min(panelHeight, maxPanelHeight);
  raidTrayPanel.style.height = panelHeight + 'px';

  const budget = panelHeight / Math.max(1, raidTray.length);
  raidTrayEl.classList.remove('infil-lg', 'infil-md', 'infil-sm');
  raidTrayEl.classList.add(budget >= 140 ? 'infil-lg' : budget >= 80 ? 'infil-md' : 'infil-sm');
}

const raidImageCache = {};

function fetchRaidImages(url){
  if(raidImageCache[url]) return; // already loaded or loading - don't re-fetch
  raidImageCache[url] = { status: 'loading', slots: [] };
  fetch('/api/images?task='+encodeURIComponent(url))
    .then(res => res.ok ? res.json() : { slots: [] })
    .then(data => {
      raidImageCache[url] = { status: 'loaded', slots: (data.slots || []).slice(0, 4) };
      renderTray();
    })
    .catch(() => {
      raidImageCache[url] = { status: 'loaded', slots: [] };
    });
}

// Repositions raidTray by star + dot-count priority. Called only when a star or
// dot is toggled, so the new arrangement becomes the order - after that, dragging
// is free to rearrange things again until priority is next touched.
function resortByPriority(){
  raidTray = raidTray.slice().sort((a, b) => {
    const aStar = starredItems.indexOf(a) !== -1 ? 1 : 0;
    const bStar = starredItems.indexOf(b) !== -1 ? 1 : 0;
    if(aStar !== bStar) return bStar - aStar;
    const aCount = teamCounts[a] || 0;
    const bCount = teamCounts[b] || 0;
    return bCount - aCount;
  });
  saveTray(raidTray);
}

function renderTray(){
  applyInfilSizing();
  const autoExpand = raidTrayEl.classList.contains('infil') && !raidTrayEl.classList.contains('infil-sm');

  // FLIP animation setup: record each item's current on-screen position before
  // the re-render, so we can smoothly animate it from old to new position after.
  const firstRects = {};
  raidTrayPanel.querySelectorAll('.raid-tray-item').forEach(el => {
    firstRects[el.getAttribute('data-url')] = el.getBoundingClientRect();
  });

  raidTrayCount.textContent = raidTray.length;

  // Starred items always float to the top; stable sort keeps relative order within each group.
  // raidTray's stored order IS the display order - this lets manual drag reordering
  // always stick. Star/dot-count only reposition an item at the moment they're
  // changed (see resortByPriority), not continuously on every render.
  const displayOrder = raidTray;

  if(raidTrayEl.classList.contains('merged') && raidTray.length){
    const rows = displayOrder.map(url => {
      const t = taskLookup(url);
      const d = TASK_DETAILS[url];
      if(t.custom){
        const item = customItems[url];
        return '<div class="rt-merge-row"><span class="rt-merge-item">'+t.name+(item && item.note ? ' &mdash; '+item.note : '')+'</span><span class="rt-merge-task">Custom</span></div>';
      }
      if(!d) return '';
      return d.items.map(item =>
        '<div class="rt-merge-row"><span class="rt-merge-item">'+item.replace(/;$/, '')+'</span><span class="rt-merge-task">'+t.name+'</span></div>'
      ).join('');
    }).join('');
    raidTrayPanel.innerHTML = '<div class="rt-merge-list">' +
      (rows || '<div class="raid-tray-empty">No item data available for the pinned tasks.</div>') +
      '</div>';
    return;
  }

  raidTrayPanel.innerHTML = raidTray.length
    ? displayOrder.map((url, i) => {
        const t = taskLookup(url);
        const d = TASK_DETAILS[url];
        const isStarred = starredItems.indexOf(url) !== -1;
        const cached = raidImageCache[url];
        if(!t.custom && !cached) fetchRaidImages(url);
        const imgSlots = (cached && cached.status === 'loaded') ? cached.slots : [];
        const imageBoxes = imgSlots.length
          ? '<div class="raid-tray-images">' +
              imgSlots.map(s =>
                '<div class="raid-tray-img-box" data-src="'+s.url+'" data-alt="'+(s.label || t.name).replace(/"/g, '&quot;')+'">' +
                  '<img src="'+s.url+'" alt="'+(s.label || t.name).replace(/"/g, '&quot;')+'">' +
                '</div>'
              ).join('') +
            '</div>'
          : '';
        let detail;
        if(t.custom){
          const item = customItems[url];
          detail = '<div class="rt-row">'+(item && item.note ? item.note : '<em>No note added.</em>')+'</div>' + imageBoxes;
        }else{
          detail = (d
            ? '<div class="rt-row"><b>Location:</b> '+d.location+'</div>' +
              '<div class="rt-row"><b>Items:</b> '+d.items.join(';<br>')+'</div>' +
              '<div class="rt-row"><a href="'+url+'" style="color:var(--amber)">Open full page &rarr;</a></div>'
            : '<div class="rt-row"><a href="'+url+'" style="color:var(--amber)">Open full page &rarr;</a></div>') + imageBoxes;
        }
        detail += '<div class="rt-price-result" id="rtPrice-'+btoa(url).replace(/=/g, '')+'"></div>';
        const count = teamCounts[url] || 0;
        const dots = '<span class="raid-tray-team" data-url="'+url+'" title="How many of your squad are doing this">' +
          [1,2,3,4,5].map(n => '<button class="rt-dot'+(n <= count ? ' filled' : '')+'" data-url="'+url+'" data-n="'+n+'" type="button"></button>').join('') +
        '</span>';
        return '<div class="raid-tray-item'+(autoExpand ? ' expanded' : '')+(isStarred ? ' starred' : '')+'" data-url="'+url+'" draggable="true">' +
          '<div class="raid-tray-item-head">' +
            '<span class="raid-tray-item-title">' +
              '<button class="raid-tray-star'+(isStarred ? ' active' : '')+'" data-url="'+url+'" type="button" title="Pin to top">&#9733;</button>' +
              '<span><span class="raid-tray-item-name">'+t.name+'</span><br><span class="raid-tray-item-sub">'+t.trader+(d && d.location ? ' &middot; '+d.location+(d.subLocation ? ' ('+d.subLocation+')' : '') : '')+'</span></span>' +
            '</span>' +
            '<span class="raid-tray-item-actions">' +
              dots +
              '<button class="raid-tray-price" data-url="'+url+'" type="button">Price</button>' +
              '<button class="raid-tray-remove" data-url="'+url+'" type="button">Remove</button>' +
            '</span>' +
          '</div>' +
          '<div class="raid-tray-detail">'+detail+'</div>' +
        '</div>';
      }).join('')
    : '<div class="raid-tray-empty">Nothing here yet. Type a name above and hit "+ Task" to add something for this raid.</div>';

  // FLIP animation: for each item that existed before, jump it back to its old
  // position with no transition, then release it into a smooth transition to
  // its real (new) position - reads as a natural slide rather than an instant jump.
  raidTrayPanel.querySelectorAll('.raid-tray-item').forEach(el => {
    const url = el.getAttribute('data-url');
    const first = firstRects[url];
    if(!first) return;
    const last = el.getBoundingClientRect();
    const deltaY = first.top - last.top;
    if(Math.abs(deltaY) < 1) return;
    el.style.transition = 'none';
    el.style.transform = 'translateY('+deltaY+'px)';
    requestAnimationFrame(() => {
      el.style.transition = 'transform 220ms ease';
      el.style.transform = '';
    });
  });
}

raidTrayToggle.addEventListener('click', () => raidTrayEl.classList.toggle('open'));
raidTrayToggle.addEventListener('keydown', (e) => {
  if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); raidTrayEl.classList.toggle('open'); }
});

raidTrayCount.addEventListener('click', (e) => {
  e.stopPropagation();
  if(!raidTray.length) return;
  raidTray = [];
  saveTray(raidTray);
  renderTray();
  if(typeof updatePinBtn === 'function') updatePinBtn();
  if(typeof updatePinButtons === 'function') updatePinButtons();
});

raidTrayInfil.addEventListener('click', (e) => {
  e.stopPropagation();
  const active = raidTrayEl.classList.toggle('infil');
  if(active){
    raidTrayEl.classList.add('open');
  }else{
    raidTrayEl.classList.remove('open', 'infil-lg', 'infil-md', 'infil-sm');
    raidTrayPanel.style.height = '';
  }
  raidTrayInfil.textContent = active ? 'Exfil' : 'Infil';
  const tabLabel = document.getElementById('tabLabel');
  if(tabLabel) tabLabel.textContent = active ? 'Good Luck, Soldier' : (tabLabel.dataset.default || tabLabel.textContent);
  renderTray();
});

if(raidTrayCompact){
  if(loadNamesOnly()){
    raidTrayEl.classList.add('names-only');
    raidTrayCompact.textContent = 'Show Full';
    raidTrayCompact.classList.add('active');
  }
  raidTrayCompact.addEventListener('click', (e) => {
    e.stopPropagation();
    const active = raidTrayEl.classList.toggle('names-only');
    raidTrayCompact.textContent = active ? 'Show Full' : 'Show Compact';
    raidTrayCompact.classList.toggle('active', active);
    saveNamesOnly(active);
  });

  const raidMergeBtn = document.createElement('button');
  raidMergeBtn.className = 'raid-tray-compact';
  raidMergeBtn.type = 'button';
  raidMergeBtn.id = 'raidTrayMerge';
  raidTrayCompact.after(raidMergeBtn);

  const MERGE_KEY = 'easytarkov-raidtray-merge';
  function loadMerge(){
    try{ return localStorage.getItem(MERGE_KEY) === '1'; }catch(e){ return false; }
  }
  function saveMerge(active){
    try{ localStorage.setItem(MERGE_KEY, active ? '1' : '0'); }catch(e){}
  }
  if(loadMerge()){
    raidTrayEl.classList.add('merged');
    raidMergeBtn.textContent = 'Unmerge';
    raidMergeBtn.classList.add('active');
  }else{
    raidMergeBtn.textContent = 'Merge';
  }
  raidMergeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const active = raidTrayEl.classList.toggle('merged');
    raidMergeBtn.textContent = active ? 'Unmerge' : 'Merge';
    raidMergeBtn.classList.toggle('active', active);
    saveMerge(active);
    renderTray();
  });

  const raidAddWrap = document.createElement('div');
  raidAddWrap.className = 'rt-quick-add-wrap';

  const raidAddInput = document.createElement('input');
  raidAddInput.type = 'text';
  raidAddInput.id = 'rtQuickAdd';
  raidAddInput.className = 'rt-quick-add';
  raidAddInput.placeholder = 'Add item...';
  raidAddInput.maxLength = 80;

  const raidAddBtn = document.createElement('button');
  raidAddBtn.className = 'rt-quick-add-btn';
  raidAddBtn.type = 'button';
  raidAddBtn.textContent = '+ Task';

  const raidAddMic = document.createElement('button');
  raidAddMic.className = 'rt-mic-btn';
  raidAddMic.type = 'button';
  raidAddMic.title = 'Add by voice (or press ' + loadVoiceKeybinds().add.toUpperCase() + ' anywhere)';
  raidAddMic.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  raidAddMic.addEventListener('click', (e) => {
    e.stopPropagation();
    startVoiceCapture('add');
  });

  raidAddWrap.appendChild(raidAddInput);
  raidAddWrap.appendChild(raidAddMic);
  raidAddWrap.appendChild(raidAddBtn);
  raidMergeBtn.after(raidAddWrap);

  function findSimilarItem(name){
    const target = name.toLowerCase();
    for(const url of raidTray){
      const existingName = taskLookup(url).name;
      const existing = existingName.toLowerCase();
      if(existing === target || existing.indexOf(target) !== -1 || target.indexOf(existing) !== -1){
        return existingName;
      }
    }
    return null;
  }

  function submitQuickAdd(){
    const name = raidAddInput.value.trim();
    if(!name) return;
    const similar = findSimilarItem(name);
    if(similar && !confirm('This looks similar to "'+similar+'", already in your list. Add anyway?')){
      return;
    }
    const id = 'custom:' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    customItems[id] = { name, note: '' };
    saveCustomItems(customItems);
    raidTray.push(id);
    saveTray(raidTray);
    raidAddInput.value = '';
    renderTray();
  }

  raidAddBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    submitQuickAdd();
  });
  raidAddInput.addEventListener('click', (e) => e.stopPropagation());
  raidAddInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){
      e.preventDefault();
      submitQuickAdd();
    }
  });
}

raidTrayPanel.addEventListener('click', (e) => {
  const dotBtn = e.target.closest('.rt-dot');
  if(dotBtn){
    const url = dotBtn.getAttribute('data-url');
    const n = parseInt(dotBtn.getAttribute('data-n'), 10);
    const current = teamCounts[url] || 0;
    teamCounts[url] = (current === n) ? 0 : n;
    saveTeamCounts(teamCounts);
    resortByPriority();
    renderTray();
    return;
  }
  const imgBox = e.target.closest('.raid-tray-img-box');
  if(imgBox){
    raidImgZoomImg.src = imgBox.getAttribute('data-src');
    raidImgZoomImg.alt = imgBox.getAttribute('data-alt') || 'Raid screenshot';
    raidImgZoomOverlay.classList.add('open');
    return;
  }
  const starBtn = e.target.closest('.raid-tray-star');
  if(starBtn){
    const url = starBtn.getAttribute('data-url');
    const idx = starredItems.indexOf(url);
    if(idx === -1) starredItems.push(url); else starredItems.splice(idx, 1);
    saveStarred(starredItems);
    resortByPriority();
    renderTray();
    return;
  }
  const priceBtn = e.target.closest('.raid-tray-price');
  if(priceBtn){
    const url = priceBtn.getAttribute('data-url');
    const item = priceBtn.closest('.raid-tray-item');
    if(item && !item.classList.contains('expanded')) item.classList.add('expanded');
    const target = document.getElementById('rtPrice-' + btoa(url).replace(/=/g, ''));
    if(!target) return;
    const t = taskLookup(url);
    target.innerHTML = '<div class="rt-row">Checking price\u2026</div>';
    fetchTarkovPrice(t.name).then(items => {
      if(!items.length){
        target.innerHTML = '<div class="rt-row">No flea market match found for "'+t.name+'".</div>';
        return;
      }
      const found = items[0];
      const best = bestTraderSell(found);
      target.innerHTML =
        '<div class="rt-row"><b>Flea (avg 24h):</b> '+(found.avg24hPrice ? found.avg24hPrice.toLocaleString()+' \u20bd' : 'No recent data')+'</div>' +
        (best ? '<div class="rt-row"><b>Best trader sell:</b> '+best.source+' &mdash; '+best.price.toLocaleString()+' \u20bd</div>' : '') +
        '<div class="rt-row" style="font-size:10.5px;">PvP flea data via tarkov.dev &mdash; treat as a general guide.</div>';
    }).catch(err => {
      target.innerHTML = '<div class="rt-row">Price service error: '+(err && err.message ? err.message : 'unknown')+'</div>';
    });
    return;
  }
  const removeBtn = e.target.closest('.raid-tray-remove');
  if(removeBtn){
    const url = removeBtn.getAttribute('data-url');
    raidTray = raidTray.filter(u => u !== url);
    saveTray(raidTray);
    starredItems = starredItems.filter(u => u !== url);
    saveStarred(starredItems);
    delete teamCounts[url];
    saveTeamCounts(teamCounts);
    if(url.indexOf('custom:') === 0){
      delete customItems[url];
      saveCustomItems(customItems);
    }
    renderTray();
    if(typeof updatePinBtn === 'function') updatePinBtn();
    if(typeof updatePinButtons === 'function') updatePinButtons();
    return;
  }
  const head = e.target.closest('.raid-tray-item-head');
  if(head) head.closest('.raid-tray-item').classList.toggle('expanded');
});

let draggedRaidUrl = null;

raidTrayPanel.addEventListener('dragstart', (e) => {
  const item = e.target.closest('.raid-tray-item');
  if(!item) return;
  draggedRaidUrl = item.getAttribute('data-url');
  item.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});

raidTrayPanel.addEventListener('dragend', (e) => {
  const item = e.target.closest('.raid-tray-item');
  if(item) item.classList.remove('dragging');
  raidTrayPanel.querySelectorAll('.raid-tray-item').forEach(el => el.classList.remove('drag-over'));
  draggedRaidUrl = null;
});

raidTrayPanel.addEventListener('dragover', (e) => {
  const item = e.target.closest('.raid-tray-item');
  if(!item || !draggedRaidUrl) return;
  e.preventDefault();
  if(item.getAttribute('data-url') !== draggedRaidUrl) item.classList.add('drag-over');
});

raidTrayPanel.addEventListener('dragleave', (e) => {
  const item = e.target.closest('.raid-tray-item');
  if(item) item.classList.remove('drag-over');
});

raidTrayPanel.addEventListener('drop', (e) => {
  const item = e.target.closest('.raid-tray-item');
  if(!item || !draggedRaidUrl) return;
  e.preventDefault();
  item.classList.remove('drag-over');
  const targetUrl = item.getAttribute('data-url');
  if(targetUrl === draggedRaidUrl) return;

  // Read the current on-screen order directly, since it may reflect star-sorting
  // rather than the raw stored order.
  const currentOrder = Array.from(raidTrayPanel.querySelectorAll('.raid-tray-item')).map(el => el.getAttribute('data-url'));
  const fromIdx = currentOrder.indexOf(draggedRaidUrl);
  let toIdx = currentOrder.indexOf(targetUrl);
  if(fromIdx === -1 || toIdx === -1) return;

  currentOrder.splice(fromIdx, 1);
  toIdx = currentOrder.indexOf(targetUrl);
  const rect = item.getBoundingClientRect();
  const insertAfter = (e.clientY - rect.top) > rect.height / 2;
  currentOrder.splice(insertAfter ? toIdx + 1 : toIdx, 0, draggedRaidUrl);

  raidTray = currentOrder;
  saveTray(raidTray);
  renderTray();
});

function togglePin(url){
  if(raidTray.includes(url)){
    raidTray = raidTray.filter(u => u !== url);
  }else{
    raidTray.push(url);
  }
  saveTray(raidTray);
  renderTray();
}

renderTray();

// ---- Search ----
const searchInput = document.getElementById('taskSearch');
const searchResults = document.getElementById('searchResults');

function renderResults(query){
  const q = query.trim().toLowerCase();
  if(!q){ searchResults.classList.remove('open'); searchResults.innerHTML = ''; return; }
  const matches = TASKS.filter(t => t.name.toLowerCase().includes(q));
  searchResults.innerHTML = matches.length
    ? matches.map(t => '<div data-url="'+t.url+'">'+t.name+' <span style="opacity:.6">&middot; '+t.trader+'</span></div>').join('')
    : '<div class="none">No tasks found</div>';
  searchResults.classList.add('open');
}

searchInput.addEventListener('input', (e) => renderResults(e.target.value));
searchInput.addEventListener('focus', (e) => renderResults(e.target.value));
document.addEventListener('click', (e) => {
  if(!e.target.closest('.search-wrap')) searchResults.classList.remove('open');
});
searchResults.addEventListener('click', (e) => {
  const row = e.target.closest('[data-url]');
  if(row) window.location.href = row.getAttribute('data-url');
});

// ---- Mobile nav menu ----
const topbarRightEl = document.querySelector('.topbar-right');
if(topbarRightEl){
  const mobileMenuWrap = document.createElement('div');
  mobileMenuWrap.className = 'mobile-menu-wrap';

  const mobileMenuBtn = document.createElement('button');
  mobileMenuBtn.type = 'button';
  mobileMenuBtn.className = 'mobile-menu-btn';
  mobileMenuBtn.setAttribute('aria-label', 'Open navigation menu');
  mobileMenuBtn.textContent = '\u2630 Menu';

  const mobileMenuPanel = document.createElement('div');
  mobileMenuPanel.className = 'mobile-menu-panel';

  const staticLinks = [
    { name: 'Home', url: 'index.html' },
    { name: 'Traders', url: 'traders.html' },
    { name: 'Maps', url: 'maps.html' },
    { name: 'Kappa', url: 'kappa.html' },
    { name: 'Price', url: 'price.html' },
    { name: 'Recent', url: 'recent.html' },
    { name: 'Settings', url: 'import.html' }
  ];

  mobileMenuPanel.innerHTML = staticLinks.map(l => '<a href="'+l.url+'">'+l.name+'</a>').join('');

  mobileMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    mobileMenuPanel.classList.toggle('open');
  });

  mobileMenuWrap.appendChild(mobileMenuBtn);
  mobileMenuWrap.appendChild(mobileMenuPanel);
  topbarRightEl.appendChild(mobileMenuWrap);

  const mobileSearchBtn = document.createElement('button');
  mobileSearchBtn.type = 'button';
  mobileSearchBtn.className = 'mobile-search-btn';
  mobileSearchBtn.setAttribute('aria-label', 'Search tasks');
  mobileSearchBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  mobileSearchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = document.querySelector('.search-wrap').classList.toggle('mobile-search-open');
    if(open) searchInput.focus();
  });
  topbarRightEl.appendChild(mobileSearchBtn);

  document.addEventListener('click', (e) => {
    if(!e.target.closest('.mobile-menu-wrap')) mobileMenuPanel.classList.remove('open');
    if(!e.target.closest('.search-wrap') && !e.target.closest('.mobile-search-btn')){
      document.querySelector('.search-wrap').classList.remove('mobile-search-open');
    }
  });
}

// ---- Current Raid image boxes: zoom overlay for viewing each task's real uploaded images ----
const raidImgZoomOverlay = document.createElement('div');
raidImgZoomOverlay.className = 'zoom-overlay';
raidImgZoomOverlay.innerHTML = '<img id="raidImgZoomImg" alt="Zoomed raid screenshot">';
document.body.appendChild(raidImgZoomOverlay);
const raidImgZoomImg = document.getElementById('raidImgZoomImg');
raidImgZoomOverlay.addEventListener('click', () => {
  raidImgZoomOverlay.classList.remove('open');
  raidImgZoomImg.src = '';
});

// ---- Keyboard shortcuts help overlay ----
// ---- Voice input: works from any page via keybind, or the mic icons on specific pages ----
const KEYBIND_KEY = 'easytarkov-keybinds';
function loadVoiceKeybinds(){
  try{
    const raw = localStorage.getItem(KEYBIND_KEY);
    return raw ? JSON.parse(raw) : { add: 'r', price: 'p' };
  }catch(e){
    return { add: 'r', price: 'p' };
  }
}

const voicePopup = document.createElement('div');
voicePopup.className = 'voice-popup';
voicePopup.innerHTML = '<div class="voice-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></div><div class="voice-status"></div>';
document.body.appendChild(voicePopup);

function speechSupported(){
  return ('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window);
}

function describeSpeechError(code){
  switch(code){
    case 'not-allowed':
    case 'permission-denied':
      return 'Microphone access is blocked - check your browser/site permissions.';
    case 'no-speech':
      return 'No speech detected - try again and speak right after it starts listening.';
    case 'audio-capture':
      return 'No microphone found on this device.';
    case 'network':
      return 'Network error reaching the speech service.';
    case 'service-not-allowed':
      return 'Speech recognition is blocked in this context (may need HTTPS).';
    case 'aborted':
      return 'Cancelled.';
    default:
      return 'Voice input error (' + (code || 'unknown') + ') - try again.';
  }
}

function startVoiceCapture(mode){
  if(!speechSupported()){
    alert('Voice input isn\'t supported in this browser. Try Chrome or Edge.');
    return;
  }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new Recognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  const statusEl = voicePopup.querySelector('.voice-status');
  voicePopup.classList.add('open', 'listening');
  statusEl.textContent = mode === 'price' ? 'Listening for an item to price-check\u2026' : 'Listening for a task to add\u2026';

  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    voicePopup.classList.remove('listening');
    if(mode === 'add'){
      const id = 'custom:' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      customItems[id] = { name: transcript, note: '' };
      saveCustomItems(customItems);
      raidTray.push(id);
      saveTray(raidTray);
      renderTray();
      statusEl.textContent = 'Added: ' + transcript;
    }else if(mode === 'price'){
      statusEl.textContent = 'Checking "' + transcript + '"\u2026';
      fetchTarkovPrice(transcript).then(items => {
        if(!items.length){
          statusEl.textContent = 'No match for "' + transcript + '".';
          return;
        }
        const found = items[0];
        const best = bestTraderSell(found);
        const price = found.avg24hPrice || (best ? best.price : 0);
        statusEl.textContent = found.name + ': ' + (price ? price.toLocaleString()+'\u20bd' : 'No recent data');
      }).catch(err => { statusEl.textContent = 'Price service error: ' + (err && err.message ? err.message : 'unknown'); });
    }
    setTimeout(() => voicePopup.classList.remove('open'), 3200);
  };
  recognition.onerror = (e) => {
    voicePopup.classList.remove('listening');
    statusEl.textContent = describeSpeechError(e.error);
    setTimeout(() => voicePopup.classList.remove('open'), 3200);
  };
  recognition.onspeechend = () => recognition.stop();
  recognition.start();
}

const shortcutsOverlay = document.createElement('div');
shortcutsOverlay.className = 'shortcuts-overlay';
const currentVoiceKeybinds = loadVoiceKeybinds();
shortcutsOverlay.innerHTML =
  '<div class="shortcuts-card">' +
    '<div class="shortcuts-title">Keyboard Shortcuts</div>' +
    '<div class="shortcuts-row"><span class="shortcuts-key">Space</span><span>Jump to search</span></div>' +
    '<div class="shortcuts-row"><span class="shortcuts-key">Shift</span><span>Open Current Raid</span></div>' +
    '<div class="shortcuts-row"><span class="shortcuts-key">'+currentVoiceKeybinds.add.toUpperCase()+'</span><span>Voice: add to Current Raid</span></div>' +
    '<div class="shortcuts-row"><span class="shortcuts-key">'+currentVoiceKeybinds.price.toUpperCase()+'</span><span>Voice: check a price</span></div>' +
    '<div class="shortcuts-row"><span class="shortcuts-key">Esc</span><span>Close open panels</span></div>' +
    '<div class="shortcuts-row"><span class="shortcuts-key">?</span><span>Show this list</span></div>' +
    '<div class="shortcuts-hint">Click anywhere to close. Change keybinds on the Settings page.</div>' +
  '</div>';
document.body.appendChild(shortcutsOverlay);
shortcutsOverlay.addEventListener('click', () => shortcutsOverlay.classList.remove('open'));

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement.tagName;
  const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable;

  if(e.key === ' ' && !isTyping){
    e.preventDefault();
    searchInput.focus();
  }

  if(e.key === 'Escape'){
    raidTrayEl.classList.remove('open');
    searchResults.classList.remove('open');
    shortcutsOverlay.classList.remove('open');
    if(isTyping) document.activeElement.blur();
  }

  if(e.key === 'Shift' && document.activeElement === document.body){
    raidTrayEl.classList.add('open');
  }

  if(e.key === '?' && !isTyping){
    e.preventDefault();
    shortcutsOverlay.classList.toggle('open');
  }

  const voiceKeybinds = loadVoiceKeybinds();
  const keyLower = e.key.toLowerCase();

  if(keyLower === voiceKeybinds.add && !isTyping){
    e.preventDefault();
    startVoiceCapture('add');
  }

  if(keyLower === voiceKeybinds.price && !isTyping){
    e.preventDefault();
    startVoiceCapture('price');
  }
});
