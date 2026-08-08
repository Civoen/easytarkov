// ---- Service Worker registration (offline support) ----
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}

// ---- Shared localStorage helpers ----
function loadJSON(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch(e){
    return fallback;
  }
}
function saveJSON(key, value){
  try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){}
}

// ---- Current Raid: two independent columns, Tasks and Items ----
// Both columns work identically - separate lists purely so "what am I doing"
// (Tasks) and "what do I need to grab" (Items) don't have to share one list.
const RAID_COLUMNS = {
  tasks: {
    orderKey: 'easytarkov-raid-tasks', entriesKey: 'easytarkov-raid-tasks-entries',
    starKey: 'easytarkov-raid-tasks-starred', dotKey: 'easytarkov-raid-tasks-dots',
    label: 'Tasks', addLabel: '+ Task', placeholder: 'Add task...', mic: true
  },
  items: {
    orderKey: 'easytarkov-raid-items', entriesKey: 'easytarkov-raid-items-entries',
    starKey: 'easytarkov-raid-items-starred', dotKey: 'easytarkov-raid-items-dots',
    label: 'Items', addLabel: '+ Item', placeholder: 'Add item...', mic: false
  }
};

const raidState = {};
Object.keys(RAID_COLUMNS).forEach(col => {
  const cfg = RAID_COLUMNS[col];
  raidState[col] = {
    order: loadJSON(cfg.orderKey, []),
    entries: loadJSON(cfg.entriesKey, {}),
    starred: loadJSON(cfg.starKey, []),
    dots: loadJSON(cfg.dotKey, {})
  };
});

function saveColumn(col){
  const cfg = RAID_COLUMNS[col];
  const state = raidState[col];
  saveJSON(cfg.orderKey, state.order);
  saveJSON(cfg.entriesKey, state.entries);
  saveJSON(cfg.starKey, state.starred);
  saveJSON(cfg.dotKey, state.dots);
}

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

// ---- Flea market price lookup (tarkov.dev via same-origin proxy) ----
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

function totalRaidCount(){
  return raidState.tasks.order.length + raidState.items.order.length;
}

function applyInfilSizing(){
  if(!raidTrayEl.classList.contains('infil')) return;
  const header = document.querySelector('header');
  const barHeight = raidTrayEl.querySelector('.raid-tray-bar').getBoundingClientRect().height;
  const maxPanelHeight = window.innerHeight - barHeight - 8;
  let panelHeight = header
    ? window.innerHeight - header.getBoundingClientRect().top - barHeight
    : window.innerHeight - barHeight - 40;
  panelHeight = Math.max(200, panelHeight);
  panelHeight = Math.min(panelHeight, maxPanelHeight);
  raidTrayPanel.style.height = panelHeight + 'px';

  const budget = panelHeight / Math.max(1, totalRaidCount());
  raidTrayEl.classList.remove('infil-lg', 'infil-md', 'infil-sm');
  raidTrayEl.classList.add(budget >= 140 ? 'infil-lg' : budget >= 80 ? 'infil-md' : 'infil-sm');
}

// ---- Local reference images: compressed client-side, stored directly with the
// entry (base64) since these are freeform items with no backend of their own ----
function compressImageFile(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxEdge = 500;
        let w = img.width, h = img.height;
        if(w > maxEdge || h > maxEdge){
          if(w > h){ h = Math.round(h * maxEdge / w); w = maxEdge; }
          else{ w = Math.round(w * maxEdge / h); h = maxEdge; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function resortColumnByPriority(col){
  const state = raidState[col];
  state.order = state.order.slice().sort((a, b) => {
    const aStar = state.starred.indexOf(a) !== -1 ? 1 : 0;
    const bStar = state.starred.indexOf(b) !== -1 ? 1 : 0;
    if(aStar !== bStar) return bStar - aStar;
    const aCount = state.dots[a] || 0;
    const bCount = state.dots[b] || 0;
    return bCount - aCount;
  });
  saveColumn(col);
}

function renderColumn(col){
  const state = raidState[col];
  const listEl = document.getElementById('raidCol-' + col + '-list');
  if(!listEl) return;
  const countEl = document.getElementById('raidCol-' + col + '-count');
  if(countEl) countEl.textContent = state.order.length;

  const firstRects = {};
  listEl.querySelectorAll('.raid-tray-item').forEach(el => {
    firstRects[el.getAttribute('data-id')] = el.getBoundingClientRect();
  });

  const autoExpand = raidTrayEl.classList.contains('infil') && !raidTrayEl.classList.contains('infil-sm');

  listEl.innerHTML = state.order.length
    ? state.order.map(id => {
        const entry = state.entries[id] || { name: 'Untitled', note: '', images: [null, null] };
        const isStarred = state.starred.indexOf(id) !== -1;
        const count = state.dots[id] || 0;
        const images = entry.images || [null, null];

        const imageBoxes = '<div class="raid-tray-images">' +
          [0, 1].map(i => images[i]
            ? '<div class="rt-local-img-box" data-col="'+col+'" data-id="'+id+'" data-slot="'+i+'"><img src="'+images[i]+'" alt="Reference image"><button class="rt-local-img-remove" data-col="'+col+'" data-id="'+id+'" data-slot="'+i+'" type="button">&times;</button></div>'
            : '<div class="rt-local-img-box empty" data-col="'+col+'" data-id="'+id+'" data-slot="'+i+'"><span class="rt-local-img-plus">+</span></div>'
          ).join('') +
        '</div>';

        const detail = '<div class="rt-row">'+(entry.note ? entry.note.replace(/</g,'&lt;') : '<em>No note added.</em>')+'</div>' +
          imageBoxes +
          '<div class="rt-price-result" id="rtPrice-'+col+'-'+btoa(unescape(encodeURIComponent(id))).replace(/=/g, '')+'"></div>';

        const dots = '<span class="raid-tray-team" data-col="'+col+'" data-id="'+id+'" title="How many of your squad are doing this">' +
          [1,2,3,4,5].map(n => '<button class="rt-dot'+(n <= count ? ' filled' : '')+'" data-col="'+col+'" data-id="'+id+'" data-n="'+n+'" type="button"></button>').join('') +
        '</span>';

        return '<div class="raid-tray-item'+(autoExpand ? ' expanded' : '')+(isStarred ? ' starred' : '')+'" data-col="'+col+'" data-id="'+id+'" draggable="true">' +
          '<div class="raid-tray-item-head">' +
            '<span class="raid-tray-item-title">' +
              '<button class="raid-tray-star'+(isStarred ? ' active' : '')+'" data-col="'+col+'" data-id="'+id+'" type="button" title="Pin to top">&#9733;</button>' +
              '<span class="raid-tray-item-name">'+entry.name.replace(/</g,'&lt;')+'</span>' +
            '</span>' +
            '<span class="raid-tray-item-actions">' +
              dots +
              '<button class="raid-tray-price" data-col="'+col+'" data-id="'+id+'" type="button">Price</button>' +
              '<button class="raid-tray-remove" data-col="'+col+'" data-id="'+id+'" type="button">Remove</button>' +
            '</span>' +
          '</div>' +
          '<div class="raid-tray-detail">'+detail+'</div>' +
        '</div>';
      }).join('')
    : '<div class="raid-tray-empty">Nothing here yet.</div>';

  listEl.querySelectorAll('.raid-tray-item').forEach(el => {
    const id = el.getAttribute('data-id');
    const first = firstRects[id];
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

function renderTray(){
  applyInfilSizing();
  raidTrayCount.textContent = totalRaidCount();
  renderColumn('tasks');
  renderColumn('items');
}

// ---- Build the two-column layout once ----
raidTrayPanel.innerHTML = Object.keys(RAID_COLUMNS).map(col => {
  const cfg = RAID_COLUMNS[col];
  return '<div class="raid-col" data-col="'+col+'">' +
    '<div class="raid-col-header">'+cfg.label+' <span class="raid-col-count" id="raidCol-'+col+'-count">0</span></div>' +
    '<div class="raid-col-add" id="raidCol-'+col+'-add"></div>' +
    '<div class="raid-col-list" id="raidCol-'+col+'-list"></div>' +
  '</div>';
}).join('');

Object.keys(RAID_COLUMNS).forEach(col => {
  const cfg = RAID_COLUMNS[col];
  const wrap = document.createElement('div');
  wrap.className = 'rt-quick-add-wrap';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rt-quick-add';
  input.placeholder = cfg.placeholder;
  input.maxLength = 80;
  wrap.appendChild(input);

  if(cfg.mic){
    const mic = document.createElement('button');
    mic.className = 'rt-mic-btn';
    mic.type = 'button';
    mic.title = 'Add by voice (or press ' + loadVoiceKeybinds().add.toUpperCase() + ' anywhere)';
    mic.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
    mic.addEventListener('click', (e) => {
      e.stopPropagation();
      startVoiceCapture('add');
    });
    wrap.appendChild(mic);
  }

  const btn = document.createElement('button');
  btn.className = 'rt-quick-add-btn';
  btn.type = 'button';
  btn.textContent = cfg.addLabel;
  wrap.appendChild(btn);

  function findSimilar(name){
    const target = name.toLowerCase();
    const state = raidState[col];
    for(const id of state.order){
      const existing = ((state.entries[id] && state.entries[id].name) || '').toLowerCase();
      if(existing === target || existing.indexOf(target) !== -1 || target.indexOf(existing) !== -1) return state.entries[id].name;
    }
    return null;
  }

  function submit(){
    const name = input.value.trim();
    if(!name) return;
    const similar = findSimilar(name);
    if(similar && !confirm('This looks similar to "'+similar+'", already in your list. Add anyway?')) return;
    const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    raidState[col].entries[id] = { name, note: '', images: [null, null] };
    raidState[col].order.push(id);
    saveColumn(col);
    input.value = '';
    renderTray();
  }

  btn.addEventListener('click', (e) => { e.stopPropagation(); submit(); });
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); submit(); }
  });

  document.getElementById('raidCol-' + col + '-add').appendChild(wrap);
});

raidTrayToggle.addEventListener('click', () => raidTrayEl.classList.toggle('open'));
raidTrayToggle.addEventListener('keydown', (e) => {
  if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); raidTrayEl.classList.toggle('open'); }
});

raidTrayCount.addEventListener('click', (e) => {
  e.stopPropagation();
  if(!totalRaidCount()) return;
  if(!confirm('Clear everything from both Tasks and Items?')) return;
  Object.keys(RAID_COLUMNS).forEach(col => {
    raidState[col].order = [];
    raidState[col].entries = {};
    raidState[col].starred = [];
    raidState[col].dots = {};
    saveColumn(col);
  });
  renderTray();
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
}

// ---- Pending image upload target, for the hidden file input below ----
let pendingImageTarget = null;
const raidImageFileInput = document.createElement('input');
raidImageFileInput.type = 'file';
raidImageFileInput.accept = 'image/*';
raidImageFileInput.style.display = 'none';
document.body.appendChild(raidImageFileInput);
raidImageFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  raidImageFileInput.value = '';
  if(!file || !pendingImageTarget) return;
  const { col, id, slot } = pendingImageTarget;
  pendingImageTarget = null;
  try{
    const dataUrl = await compressImageFile(file);
    const entry = raidState[col].entries[id];
    if(!entry) return;
    if(!entry.images) entry.images = [null, null];
    entry.images[slot] = dataUrl;
    saveColumn(col);
    renderTray();
  }catch(err){
    alert('Could not add that image. Try a different file.');
  }
});

raidTrayPanel.addEventListener('click', (e) => {
  const localImgRemove = e.target.closest('.rt-local-img-remove');
  if(localImgRemove){
    e.stopPropagation();
    const col = localImgRemove.getAttribute('data-col');
    const id = localImgRemove.getAttribute('data-id');
    const slot = parseInt(localImgRemove.getAttribute('data-slot'), 10);
    const entry = raidState[col].entries[id];
    if(entry && entry.images){
      entry.images[slot] = null;
      saveColumn(col);
      renderTray();
    }
    return;
  }
  const localImgBox = e.target.closest('.rt-local-img-box');
  if(localImgBox){
    const col = localImgBox.getAttribute('data-col');
    const id = localImgBox.getAttribute('data-id');
    const slot = parseInt(localImgBox.getAttribute('data-slot'), 10);
    const entry = raidState[col].entries[id];
    const existing = entry && entry.images && entry.images[slot];
    if(existing){
      raidImgZoomImg.src = existing;
      raidImgZoomImg.alt = 'Reference image';
      raidImgZoomOverlay.classList.add('open');
    }else{
      pendingImageTarget = { col, id, slot };
      raidImageFileInput.click();
    }
    return;
  }
  const dotBtn = e.target.closest('.rt-dot');
  if(dotBtn){
    const col = dotBtn.getAttribute('data-col');
    const id = dotBtn.getAttribute('data-id');
    const n = parseInt(dotBtn.getAttribute('data-n'), 10);
    const current = raidState[col].dots[id] || 0;
    raidState[col].dots[id] = (current === n) ? 0 : n;
    saveColumn(col);
    resortColumnByPriority(col);
    renderTray();
    return;
  }
  const starBtn = e.target.closest('.raid-tray-star');
  if(starBtn){
    const col = starBtn.getAttribute('data-col');
    const id = starBtn.getAttribute('data-id');
    const idx = raidState[col].starred.indexOf(id);
    if(idx === -1) raidState[col].starred.push(id); else raidState[col].starred.splice(idx, 1);
    saveColumn(col);
    resortColumnByPriority(col);
    renderTray();
    return;
  }
  const priceBtn = e.target.closest('.raid-tray-price');
  if(priceBtn){
    const col = priceBtn.getAttribute('data-col');
    const id = priceBtn.getAttribute('data-id');
    const item = priceBtn.closest('.raid-tray-item');
    if(item && !item.classList.contains('expanded')) item.classList.add('expanded');
    const target = document.getElementById('rtPrice-' + col + '-' + btoa(unescape(encodeURIComponent(id))).replace(/=/g, ''));
    if(!target) return;
    const entry = raidState[col].entries[id];
    const name = entry ? entry.name : '';
    target.innerHTML = '<div class="rt-row">Checking price\u2026</div>';
    fetchTarkovPrice(name).then(items => {
      if(!items.length){
        target.innerHTML = '<div class="rt-row">No flea market match found for "'+name+'".</div>';
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
    const col = removeBtn.getAttribute('data-col');
    const id = removeBtn.getAttribute('data-id');
    const state = raidState[col];
    state.order = state.order.filter(x => x !== id);
    state.starred = state.starred.filter(x => x !== id);
    delete state.dots[id];
    delete state.entries[id];
    saveColumn(col);
    renderTray();
    return;
  }
  const head = e.target.closest('.raid-tray-item-head');
  if(head) head.closest('.raid-tray-item').classList.toggle('expanded');
});

let draggedRaid = null; // { col, id }

raidTrayPanel.addEventListener('dragstart', (e) => {
  const item = e.target.closest('.raid-tray-item');
  if(!item) return;
  draggedRaid = { col: item.getAttribute('data-col'), id: item.getAttribute('data-id') };
  item.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});

raidTrayPanel.addEventListener('dragend', (e) => {
  const item = e.target.closest('.raid-tray-item');
  if(item) item.classList.remove('dragging');
  raidTrayPanel.querySelectorAll('.raid-tray-item').forEach(el => el.classList.remove('drag-over'));
  draggedRaid = null;
});

raidTrayPanel.addEventListener('dragover', (e) => {
  const item = e.target.closest('.raid-tray-item');
  if(!item || !draggedRaid) return;
  const itemCol = item.getAttribute('data-col');
  if(itemCol !== draggedRaid.col) return; // dragging is scoped within a single column
  e.preventDefault();
  if(item.getAttribute('data-id') !== draggedRaid.id) item.classList.add('drag-over');
});

raidTrayPanel.addEventListener('dragleave', (e) => {
  const item = e.target.closest('.raid-tray-item');
  if(item) item.classList.remove('drag-over');
});

raidTrayPanel.addEventListener('drop', (e) => {
  const item = e.target.closest('.raid-tray-item');
  if(!item || !draggedRaid) return;
  const col = item.getAttribute('data-col');
  if(col !== draggedRaid.col) return;
  e.preventDefault();
  item.classList.remove('drag-over');
  const targetId = item.getAttribute('data-id');
  if(targetId === draggedRaid.id) return;

  const listEl = document.getElementById('raidCol-' + col + '-list');
  const currentOrder = Array.from(listEl.querySelectorAll('.raid-tray-item')).map(el => el.getAttribute('data-id'));
  const fromIdx = currentOrder.indexOf(draggedRaid.id);
  let toIdx = currentOrder.indexOf(targetId);
  if(fromIdx === -1 || toIdx === -1) return;

  currentOrder.splice(fromIdx, 1);
  toIdx = currentOrder.indexOf(targetId);
  const rect = item.getBoundingClientRect();
  const insertAfter = (e.clientY - rect.top) > rect.height / 2;
  currentOrder.splice(insertAfter ? toIdx + 1 : toIdx, 0, draggedRaid.id);

  raidState[col].order = currentOrder;
  saveColumn(col);
  renderTray();
});

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
    { name: 'Maps', url: 'maps.html' },
    { name: 'Kappa', url: 'kappa.html' },
    { name: 'Price', url: 'price.html' },
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
  const defaults = { add: 'r', price: 'p' };
  try{
    const raw = localStorage.getItem(KEYBIND_KEY);
    return raw ? Object.assign({}, defaults, JSON.parse(raw)) : defaults;
  }catch(e){
    return defaults;
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
      const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      raidState.tasks.entries[id] = { name: transcript, note: '', images: [null, null] };
      raidState.tasks.order.push(id);
      saveColumn('tasks');
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
