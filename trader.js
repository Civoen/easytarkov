// Sorts a trader's tasks by the level a player would naturally receive them.
// Multi-part quests (e.g. Farming - Part 1/2/3) should share a `chain` key and
// an ascending `chainOrder` in data.js so they stay grouped together and appear
// positioned by the chain's earliest level, rather than being split up if a
// later part happens to share a level with an unrelated task.
function sortTasksForTrader(tasks){
  const chains = {};
  tasks.forEach(t => {
    const key = t.chain || ('__solo__' + t.url);
    if(!chains[key]) chains[key] = [];
    chains[key].push(t);
  });
  const groups = Object.values(chains).map(group => {
    group.sort((a, b) => (a.chainOrder || 0) - (b.chainOrder || 0));
    const minLevel = Math.min(...group.map(t => t.level));
    return { minLevel, group };
  });
  groups.sort((a, b) => a.minLevel - b.minLevel);
  return groups.flatMap(g => g.group);
}

// Renders a checklist of items with per-item progress (localStorage-backed) and
// an overall progress bar that turns green at 100%. Optionally supports pinning
// items into the Raid Tray when each item has an href (i.e. task rows, not plain items).
//
// config = {
//   listElId: 'taskList',
//   storageKey: 'easytarkov-progress',
//   items: [{ key, name, sub, href (optional), pinnable (optional bool) }],
//   countLabel: 'complete' | 'found',
//   emptyMessage: 'No Kappa-required tasks added yet for X.'
// }
function initChecklist(config){
  const listEl = document.getElementById(config.listElId);
  const items = config.items;

  function loadProgress(){
    try{
      const raw = localStorage.getItem(config.storageKey);
      return raw ? JSON.parse(raw) : {};
    }catch(e){
      return {};
    }
  }

  function saveProgress(p){
    try{ localStorage.setItem(config.storageKey, JSON.stringify(p)); }catch(e){}
  }

  let progress = loadProgress();

  function updateProgressBar(){
    const total = items.length;
    const done = items.filter(i => progress[i.key]).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    document.getElementById('progressText').textContent = done + ' of ' + total + ' ' + config.countLabel;
    document.getElementById('progressPct').textContent = pct + '%';
    const fill = document.getElementById('progressFill');
    fill.style.width = pct + '%';
    fill.style.background = pct >= 100 ? '#3cbf2d' : '';
  }

  window.updatePinButtons = function(){
    listEl.querySelectorAll('.task-pin').forEach(btn => {
      const href = btn.getAttribute('data-href');
      const pinned = raidTray.includes(href);
      btn.textContent = pinned ? '\u2713 Pinned' : '+ Pin';
      btn.classList.toggle('pinned', pinned);
    });
  };

  listEl.innerHTML = items.length
    ? items.map(item => {
        const linkTag = item.href ? 'a' : 'span';
        const linkAttrs = item.href ? ' href="'+item.href+'"' : '';
        return '<div class="task-row" data-key="'+item.key+'">' +
          '<label class="task-check"><input type="checkbox" data-key="'+item.key+'"></label>' +
          '<'+linkTag+' class="task-link"'+linkAttrs+'>' +
            '<span><span class="task-name">'+item.name+'</span><br><span class="task-level">'+item.sub+'</span></span>' +
            (item.href ? '<span class="task-arrow">&rarr;</span>' : '') +
          '</'+linkTag+'>' +
          (item.pinnable ? '<button class="task-pin" data-href="'+item.href+'" type="button">+ Pin</button>' : '') +
        '</div>';
      }).join('')
    : '<div class="empty-note">'+(config.emptyMessage || 'Nothing added here yet.')+'</div>';

  listEl.querySelectorAll('.task-check input').forEach(box => {
    const key = box.getAttribute('data-key');
    box.checked = !!progress[key];
    if(box.checked) box.closest('.task-row').classList.add('done');
    box.addEventListener('change', () => {
      progress[key] = box.checked;
      saveProgress(progress);
      box.closest('.task-row').classList.toggle('done', box.checked);
      updateProgressBar();
    });
  });

  listEl.querySelectorAll('.task-pin').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePin(btn.getAttribute('data-href'));
      updatePinButtons();
    });
  });

  updatePinButtons();
  updateProgressBar();

  const filterInput = document.getElementById('taskFilter');
  const filterEmpty = document.getElementById('taskFilterEmpty');
  if(filterInput){
    filterInput.addEventListener('input', () => {
      const q = filterInput.value.trim().toLowerCase();
      let visibleCount = 0;
      listEl.querySelectorAll('.task-row').forEach(row => {
        const name = row.querySelector('.task-name').textContent.toLowerCase();
        const match = name.includes(q);
        row.style.display = match ? '' : 'none';
        if(match) visibleCount++;
      });
      if(filterEmpty) filterEmpty.style.display = visibleCount === 0 ? 'block' : 'none';
    });
  }
}
