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

function taskLookup(url){
  return TASKS.find(t => t.url === url) || { name: url, trader: '', level: '' };
}

function applyInfilSizing(){
  if(!raidTrayEl.classList.contains('infil')) return;
  const header = document.querySelector('header');
  const barHeight = raidTrayEl.querySelector('.raid-tray-bar').getBoundingClientRect().height;
  const panelHeight = header
    ? Math.max(200, window.innerHeight - header.getBoundingClientRect().top - barHeight)
    : Math.max(200, window.innerHeight - barHeight - 40);
  raidTrayPanel.style.height = panelHeight + 'px';

  const budget = panelHeight / Math.max(1, raidTray.length);
  raidTrayEl.classList.remove('infil-lg', 'infil-md', 'infil-sm');
  raidTrayEl.classList.add(budget >= 140 ? 'infil-lg' : budget >= 80 ? 'infil-md' : 'infil-sm');
}

const raidTrayImages = {};

function renderTray(){
  applyInfilSizing();
  const autoExpand = raidTrayEl.classList.contains('infil') && !raidTrayEl.classList.contains('infil-sm');

  raidTrayCount.textContent = raidTray.length;
  raidTrayPanel.innerHTML = raidTray.length
    ? raidTray.map((url, i) => {
        const t = taskLookup(url);
        const d = TASK_DETAILS[url];
        const imgs = raidTrayImages[url] || [null, null];
        const imageBoxes = '<div class="raid-tray-images">' +
          [0, 1].map(slot =>
            '<div class="raid-tray-img-box" data-url="'+url+'" data-slot="'+slot+'">' +
              (imgs[slot]
                ? '<img src="'+imgs[slot]+'" alt="Raid screenshot"><button class="rt-img-remove" data-url="'+url+'" data-slot="'+slot+'" type="button" aria-label="Remove image">&times;</button>'
                : '<span class="rt-img-plus">+</span>') +
            '</div>'
          ).join('') +
        '</div>';
        const detail = (d
          ? '<div class="rt-row"><b>Location:</b> '+d.location+'</div>' +
            '<div class="rt-row"><b>Items:</b> '+d.items.join(';<br>')+'</div>' +
            '<div class="rt-row"><a href="'+url+'" style="color:var(--amber)">Open full page &rarr;</a></div>'
          : '<div class="rt-row"><a href="'+url+'" style="color:var(--amber)">Open full page &rarr;</a></div>') + imageBoxes;
        const isFirst = i === 0;
        const isLast = i === raidTray.length - 1;
        return '<div class="raid-tray-item'+(autoExpand ? ' expanded' : '')+'" data-url="'+url+'" draggable="true">' +
          '<div class="raid-tray-item-head">' +
            '<span><span class="raid-tray-item-name">'+t.name+'</span><br><span class="raid-tray-item-sub">'+t.trader+(t.level ? ' &middot; Level '+t.level : '')+'</span></span>' +
            '<span class="raid-tray-item-actions">' +
              '<button class="raid-tray-remove" data-url="'+url+'" type="button">Remove</button>' +
            '</span>' +
          '</div>' +
          '<div class="raid-tray-detail">'+detail+'</div>' +
        '</div>';
      }).join('')
    : '<div class="raid-tray-empty">No tasks pinned yet. Pin tasks you\'re running together this raid.</div>';
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
}

raidTrayPanel.addEventListener('click', (e) => {
  const removeImgBtn = e.target.closest('.rt-img-remove');
  if(removeImgBtn){
    e.stopPropagation();
    const url = removeImgBtn.getAttribute('data-url');
    const slot = parseInt(removeImgBtn.getAttribute('data-slot'), 10);
    if(raidTrayImages[url]) raidTrayImages[url][slot] = null;
    renderTray();
    return;
  }
  const imgBox = e.target.closest('.raid-tray-img-box');
  if(imgBox){
    const url = imgBox.getAttribute('data-url');
    const slot = parseInt(imgBox.getAttribute('data-slot'), 10);
    const existing = (raidTrayImages[url] || [])[slot];
    if(existing){
      raidImgZoomImg.src = existing;
      raidImgZoomOverlay.classList.add('open');
    }else{
      pendingImgUpload = { url, slot };
      raidImgFileInput.click();
    }
    return;
  }
  const removeBtn = e.target.closest('.raid-tray-remove');
  if(removeBtn){
    const url = removeBtn.getAttribute('data-url');
    raidTray = raidTray.filter(u => u !== url);
    saveTray(raidTray);
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

  const fromIdx = raidTray.indexOf(draggedRaidUrl);
  let toIdx = raidTray.indexOf(targetUrl);
  if(fromIdx === -1 || toIdx === -1) return;

  raidTray.splice(fromIdx, 1);
  toIdx = raidTray.indexOf(targetUrl);
  const rect = item.getBoundingClientRect();
  const insertAfter = (e.clientY - rect.top) > rect.height / 2;
  raidTray.splice(insertAfter ? toIdx + 1 : toIdx, 0, draggedRaidUrl);

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
    { name: 'Recent', url: 'recent.html' },
    { name: 'Manage Data', url: 'import.html' }
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

// ---- Current Raid image boxes: zoom overlay + upload handling ----
const raidImgZoomOverlay = document.createElement('div');
raidImgZoomOverlay.className = 'zoom-overlay';
raidImgZoomOverlay.innerHTML = '<img id="raidImgZoomImg" alt="Zoomed raid screenshot">';
document.body.appendChild(raidImgZoomOverlay);
const raidImgZoomImg = document.getElementById('raidImgZoomImg');
raidImgZoomOverlay.addEventListener('click', () => {
  raidImgZoomOverlay.classList.remove('open');
  raidImgZoomImg.src = '';
});

const raidImgFileInput = document.createElement('input');
raidImgFileInput.type = 'file';
raidImgFileInput.accept = 'image/*';
raidImgFileInput.style.display = 'none';
document.body.appendChild(raidImgFileInput);
let pendingImgUpload = null;

raidImgFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file || !pendingImgUpload) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const { url, slot } = pendingImgUpload;
    if(!raidTrayImages[url]) raidTrayImages[url] = [null, null];
    raidTrayImages[url][slot] = ev.target.result;
    pendingImgUpload = null;
    renderTray();
  };
  reader.readAsDataURL(file);
  raidImgFileInput.value = '';
});

// ---- Keyboard shortcuts help overlay ----
const shortcutsOverlay = document.createElement('div');
shortcutsOverlay.className = 'shortcuts-overlay';
shortcutsOverlay.innerHTML =
  '<div class="shortcuts-card">' +
    '<div class="shortcuts-title">Keyboard Shortcuts</div>' +
    '<div class="shortcuts-row"><span class="shortcuts-key">Space</span><span>Jump to search</span></div>' +
    '<div class="shortcuts-row"><span class="shortcuts-key">Shift</span><span>Open Current Raid</span></div>' +
    '<div class="shortcuts-row"><span class="shortcuts-key">Esc</span><span>Close open panels</span></div>' +
    '<div class="shortcuts-row"><span class="shortcuts-key">?</span><span>Show this list</span></div>' +
    '<div class="shortcuts-hint">Click anywhere to close</div>' +
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
});
