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

function renderTray(){
  applyInfilSizing();
  const autoExpand = raidTrayEl.classList.contains('infil') && !raidTrayEl.classList.contains('infil-sm');

  raidTrayCount.textContent = raidTray.length;
  raidTrayPanel.innerHTML = raidTray.length
    ? raidTray.map((url, i) => {
        const t = taskLookup(url);
        const d = TASK_DETAILS[url];
        const detail = d
          ? '<div class="rt-row"><b>Location:</b> '+d.location+'</div>' +
            '<div class="rt-row"><b>Items:</b> '+d.items.join(';<br>')+'</div>' +
            '<div class="rt-row"><a href="'+url+'" style="color:var(--amber)">Open full page &rarr;</a></div>'
          : '<div class="rt-row"><a href="'+url+'" style="color:var(--amber)">Open full page &rarr;</a></div>';
        const isFirst = i === 0;
        const isLast = i === raidTray.length - 1;
        return '<div class="raid-tray-item'+(autoExpand ? ' expanded' : '')+'" data-url="'+url+'">' +
          '<div class="raid-tray-item-head">' +
            '<span><span class="raid-tray-item-name">'+t.name+'</span><br><span class="raid-tray-item-sub">'+t.trader+(t.level ? ' &middot; Level '+t.level : '')+'</span></span>' +
            '<span class="raid-tray-item-actions">' +
              '<button class="raid-tray-move" data-url="'+url+'" data-dir="up" type="button" title="Move up"'+(isFirst ? ' disabled' : '')+'>&uarr;</button>' +
              '<button class="raid-tray-move" data-url="'+url+'" data-dir="down" type="button" title="Move down"'+(isLast ? ' disabled' : '')+'>&darr;</button>' +
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
    raidTrayCompact.textContent = 'Full';
    raidTrayCompact.classList.add('active');
  }
  raidTrayCompact.addEventListener('click', (e) => {
    e.stopPropagation();
    const active = raidTrayEl.classList.toggle('names-only');
    raidTrayCompact.textContent = active ? 'Full' : 'Compact';
    raidTrayCompact.classList.toggle('active', active);
    saveNamesOnly(active);
  });
}

raidTrayPanel.addEventListener('click', (e) => {
  const moveBtn = e.target.closest('.raid-tray-move');
  if(moveBtn){
    const url = moveBtn.getAttribute('data-url');
    const dir = moveBtn.getAttribute('data-dir');
    const idx = raidTray.indexOf(url);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if(idx !== -1 && swapIdx >= 0 && swapIdx < raidTray.length){
      const tmp = raidTray[idx];
      raidTray[idx] = raidTray[swapIdx];
      raidTray[swapIdx] = tmp;
      saveTray(raidTray);
      renderTray();
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

// ---- Trader dropdown ----
const traderBtn = document.getElementById('traderBtn');
const traderMenu = document.getElementById('traderMenu');

function renderTraderList(){
  traderMenu.innerHTML = TRADERS.map(t => '<div class="row" data-url="'+t.url+'">'+t.name+'</div>').join('');
}

traderBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = traderMenu.classList.contains('open');
  if(isOpen){
    traderMenu.classList.remove('open');
    return;
  }
  renderTraderList();
  traderMenu.classList.add('open');
});

traderMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  const row = e.target.closest('[data-url]');
  if(row) window.location.href = row.getAttribute('data-url');
});

document.addEventListener('click', (e) => {
  if(!e.target.closest('.trader-wrap')) traderMenu.classList.remove('open');
});
