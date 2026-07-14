const zoomOverlay = document.getElementById('zoomOverlay');
const zoomImg = document.getElementById('zoomImg');

function openZoom(dataUrl, altText){
  zoomImg.src = dataUrl;
  zoomImg.alt = altText || 'Zoomed screenshot';
  zoomOverlay.classList.add('open');
}

zoomOverlay.addEventListener('click', () => {
  zoomOverlay.classList.remove('open');
  zoomImg.src = '';
});

const grid = document.getElementById('slotGrid');
const MIN_SLOTS = 0;
let CURRENT_TASK_URL = '';

function updateDeleteButtons(){
  const slots = grid.querySelectorAll('.slot');
  slots.forEach((s, i) => {
    const btn = s.querySelector('.del-slot');
    btn.style.visibility = slots.length > MIN_SLOTS ? 'visible' : 'hidden';
    const upBtn = s.querySelector('.slot-move-btn[data-dir="up"]');
    const downBtn = s.querySelector('.slot-move-btn[data-dir="down"]');
    if(upBtn) upBtn.disabled = i === 0;
    if(downBtn) downBtn.disabled = i === slots.length - 1;
  });
}

async function persistSlotOrder(){
  const ids = Array.from(grid.querySelectorAll('.slot'))
    .map(s => s.dataset.slotId)
    .filter(Boolean);
  if(!ids.length) return;
  try{
    await fetch('/api/images', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: CURRENT_TASK_URL, reorder: ids })
    });
  }catch(err){}
}

// Resizes to a max 1600px edge and re-encodes as WebP before upload.
// This is the single biggest lever for image performance: a raw phone/game
// screenshot can be several MB; compressed WebP is typically 100-400KB.
function compressImage(file){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      const MAX_EDGE = 1600;
      let { width, height } = img;
      if(width > height && width > MAX_EDGE){
        height = Math.round(height * (MAX_EDGE / width));
        width = MAX_EDGE;
      }else if(height > MAX_EDGE){
        width = Math.round(width * (MAX_EDGE / height));
        height = MAX_EDGE;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Compression failed')),
        'image/webp',
        0.82
      );
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function addSlot(label, existing){
  const slot = document.createElement('div');
  slot.className = 'slot';
  slot.innerHTML =
    '<button class="del-slot" title="Remove this box">&times;</button>' +
    '<div class="slot-head" contenteditable="true" data-placeholder="Label this location"></div>' +
    '<div class="drop" tabindex="0">' +
      '<div class="drop-empty"><span class="icon">&#9635;</span>No image yet<br>click to select, then paste &mdash; or drag, or double-click to browse</div>' +
      '<div class="slot-move">' +
        '<button class="slot-move-btn" data-dir="up" title="Move left" type="button">&uarr;</button>' +
        '<button class="slot-move-btn" data-dir="down" title="Move right" type="button">&darr;</button>' +
      '</div>' +
    '</div>' +
    '<div class="slot-foot"><span class="uploader"></span><span class="clear-wrap"></span></div>' +
    '<input type="file" accept="image/*" hidden>';

  slot.querySelector('.slot-head').textContent = existing ? existing.label : label;
  let slotId = existing ? existing.id : null;
  if(slotId) slot.dataset.slotId = slotId;

  const drop = slot.querySelector('.drop');
  const input = slot.querySelector('input[type=file]');
  const uploaderTag = slot.querySelector('.uploader');
  const clearWrap = slot.querySelector('.clear-wrap');

  function renderFilled(url, uploadedLabel){
    const altText = (uploadedLabel || slot.querySelector('.slot-head').textContent.trim()) + ' screenshot';
    drop.innerHTML = '<img src="'+url+'" alt="'+altText.replace(/"/g, '&quot;')+'">';
    let stamp = slot.querySelector('.stamp');
    if(!stamp){
      stamp = document.createElement('div');
      stamp.className = 'stamp';
      stamp.textContent = 'CONFIRMED';
      drop.appendChild(stamp);
    }
    slot.classList.add('filled');
    uploaderTag.textContent = '';
    clearWrap.innerHTML = '';

    const actions = document.createElement('div');
    actions.className = 'img-actions';

    const replaceBtn = document.createElement('button');
    replaceBtn.className = 'img-btn';
    replaceBtn.textContent = 'Replace';
    replaceBtn.onclick = (e) => {
      e.stopPropagation();
      input.click();
    };

    actions.appendChild(replaceBtn);
    clearWrap.appendChild(actions);
  }

  async function uploadFile(file){
    const previousSlotId = slotId;
    uploaderTag.textContent = 'Uploading\u2026';
    try{
      const compressed = await compressImage(file);
      const label = slot.querySelector('.slot-head').textContent.trim();
      const form = new FormData();
      form.append('task', CURRENT_TASK_URL);
      form.append('label', label);
      form.append('file', compressed, 'screenshot.webp');

      const res = await fetch('/api/images', { method: 'POST', body: form });
      if(!res.ok) throw new Error('Upload failed');
      const savedSlot = await res.json();
      slotId = savedSlot.id;
      slot.dataset.slotId = slotId;
      renderFilled(savedSlot.url, savedSlot.label);

      if(previousSlotId && previousSlotId !== slotId){
        try{
          await fetch('/api/images?task='+encodeURIComponent(CURRENT_TASK_URL)+'&id='+encodeURIComponent(previousSlotId), { method: 'DELETE' });
        }catch(err){}
      }
    }catch(err){
      uploaderTag.textContent = '';
      alert('Upload failed. Please try again.');
    }
  }

  drop.addEventListener('click', () => {
    const img = drop.querySelector('img');
    if(img) openZoom(img.src, img.alt);
    // If empty, clicking simply focuses the box (native behavior via tabindex)
    // so it's armed and ready for a paste - no file picker on single click.
  });
  drop.addEventListener('dblclick', () => {
    if(!drop.querySelector('img')) input.click();
  });
  input.addEventListener('change', (e) => { if(e.target.files[0]) uploadFile(e.target.files[0]); });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    if(e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
  });
  drop.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if(!items) return;
    for(const item of items){
      if(item.type.startsWith('image/')){
        e.preventDefault();
        const file = item.getAsFile();
        if(file) uploadFile(file);
        break;
      }
    }
  });

  slot.querySelector('.slot-head').addEventListener('blur', async () => {
    if(!slotId) return;
    const newLabel = slot.querySelector('.slot-head').textContent.trim();
    try{
      await fetch('/api/images', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: CURRENT_TASK_URL, id: slotId, label: newLabel })
      });
    }catch(err){}
  });

  slot.querySelector('.del-slot').addEventListener('click', async () => {
    if(grid.querySelectorAll('.slot').length <= MIN_SLOTS) return;
    if(slotId){
      try{
        await fetch('/api/images?task='+encodeURIComponent(CURRENT_TASK_URL)+'&id='+encodeURIComponent(slotId), { method: 'DELETE' });
      }catch(err){}
    }
    slot.remove();
    updateDeleteButtons();
    persistSlotOrder();
  });

  slot.querySelectorAll('.slot-move-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dir = btn.getAttribute('data-dir');
      if(dir === 'up' && slot.previousElementSibling){
        grid.insertBefore(slot, slot.previousElementSibling);
      }else if(dir === 'down' && slot.nextElementSibling){
        grid.insertBefore(slot.nextElementSibling, slot);
      }
      updateDeleteButtons();
      persistSlotOrder();
    });
  });

  grid.appendChild(slot);
  updateDeleteButtons();

  if(existing) renderFilled(existing.url, existing.label);
}

document.getElementById('newImageBtn').addEventListener('click', () => addSlot(''));

// Call this from each task page's own small inline script:
// initTaskPage('this_page.html', ['Initial slot label 1', 'Initial slot label 2']);
async function initTaskPage(taskUrl){
  CURRENT_TASK_URL = taskUrl;

  try{
    const res = await fetch('/api/images?task='+encodeURIComponent(taskUrl));
    const data = res.ok ? await res.json() : { slots: [] };
    if(data.slots && data.slots.length){
      data.slots.forEach(s => addSlot('', s));
    }
    // Otherwise: start with zero boxes. Not every task needs images -
    // "+ New image" adds the first box, and each click after that adds another.
  }catch(err){
    // Backend unreachable (e.g. local testing without Cloudflare Pages) -
    // start empty rather than guessing.
  }

  // ---- Dismissible Field Intel notes ----
  const DISMISSED_KEY = 'easytarkov-dismissed-notes';
  let dismissed = [];
  try{ dismissed = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'); }catch(e){}

  const noteEls = document.querySelectorAll('.field-intel-note');
  const emptyEl = document.querySelector('.field-intel-empty');

  function refreshEmptyState(){
    if(!emptyEl) return;
    const anyVisible = Array.from(noteEls).some(n => !n.classList.contains('dismissed'));
    emptyEl.style.display = anyVisible ? 'none' : 'block';
  }

  noteEls.forEach(note => {
    const id = note.getAttribute('data-note-id');
    if(dismissed.includes(id)){
      note.classList.add('dismissed');
      note.style.display = 'none';
    }
    const removeBtn = note.querySelector('.field-intel-remove');
    if(removeBtn){
      removeBtn.addEventListener('click', () => {
        note.classList.add('dismissed');
        note.style.display = 'none';
        try{
          dismissed = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
        }catch(e){ dismissed = []; }
        if(!dismissed.includes(id)) dismissed.push(id);
        try{ localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed)); }catch(e){}
        refreshEmptyState();
      });
    }
  });
  refreshEmptyState();

  // ---- Mark complete ----
  const PROGRESS_KEY = 'easytarkov-progress';
  const completeBtn = document.getElementById('completeBtn');
  if(completeBtn){
    function updateCompleteBtn(isDone){
      completeBtn.textContent = isDone ? '\u2713 Completed' : 'Mark Complete';
      completeBtn.classList.toggle('completed', isDone);
    }
    let progress = {};
    try{ progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); }catch(e){}
    updateCompleteBtn(!!progress[taskUrl]);
    completeBtn.addEventListener('click', () => {
      try{
        progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
      }catch(e){ progress = {}; }
      const nowDone = !progress[taskUrl];
      progress[taskUrl] = nowDone;
      try{ localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); }catch(e){}
      updateCompleteBtn(nowDone);
    });
  }

  // ---- Recently viewed tracking ----
  try{
    const RECENT_KEY = 'easytarkov-recent';
    const task = TASKS.find(t => t.url === taskUrl);
    if(task){
      let recent = [];
      try{ recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }catch(e){ recent = []; }
      recent = recent.filter(r => r.url !== taskUrl);
      recent.unshift({ name: task.name, trader: task.trader, url: task.url });
      recent = recent.slice(0, 10);
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    }
  }catch(e){}

  const pinBtn = document.getElementById('pinBtn');
  if(pinBtn){
    window.updatePinBtn = function(){
      const pinned = raidTray.includes(taskUrl);
      pinBtn.textContent = pinned ? '\u2713 Pinned to Current Raid' : '+ Pin to Current Raid';
      pinBtn.classList.toggle('pinned', pinned);
    };

    pinBtn.addEventListener('click', () => {
      togglePin(taskUrl);
      updatePinBtn();
    });

    updatePinBtn();
  }

  const copyLinkBtn = document.getElementById('copyLinkBtn');
  if(copyLinkBtn){
    copyLinkBtn.addEventListener('click', () => {
      const url = window.location.href;
      const showCopied = () => {
        const original = 'Copy Link';
        copyLinkBtn.textContent = 'Copied!';
        copyLinkBtn.classList.add('copied');
        setTimeout(() => {
          copyLinkBtn.textContent = original;
          copyLinkBtn.classList.remove('copied');
        }, 1500);
      };
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(url).then(showCopied).catch(() => {
          copyLinkBtn.textContent = 'Copy failed';
          setTimeout(() => { copyLinkBtn.textContent = 'Copy Link'; }, 1500);
        });
      }else{
        copyLinkBtn.textContent = 'Copy failed';
        setTimeout(() => { copyLinkBtn.textContent = 'Copy Link'; }, 1500);
      }
    });
  }
}
