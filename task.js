const zoomOverlay = document.getElementById('zoomOverlay');
const zoomImg = document.getElementById('zoomImg');

// ---- Annotation canvas, drawn on top of the zoomed image ----
const zoomCanvas = document.createElement('canvas');
zoomCanvas.className = 'zoom-canvas';
zoomOverlay.appendChild(zoomCanvas);

const zoomToolbar = document.createElement('div');
zoomToolbar.className = 'zoom-toolbar';
zoomToolbar.innerHTML =
  '<button class="zoom-tool active" data-tool="marker" type="button">&#9998; Marker</button>' +
  '<button class="zoom-color active" data-color="#ff3b3b" type="button" title="Red" style="background:#ff3b3b;"></button>' +
  '<button class="zoom-color" data-color="#3ecf5f" type="button" title="Green" style="background:#3ecf5f;"></button>' +
  '<button class="zoom-color" data-color="#3b82f6" type="button" title="Blue" style="background:#3b82f6;"></button>' +
  '<button class="zoom-tool" data-tool="eraser" type="button">Eraser</button>' +
  '<button class="zoom-tool" data-action="clear" type="button">Clear</button>';
zoomOverlay.appendChild(zoomToolbar);

let zoomCtx = null;
let zoomDrawing = false;
let zoomTool = 'marker';
let zoomMarkerColor = '#ff3b3b';

function resizeZoomCanvas(){
  const rect = zoomImg.getBoundingClientRect();
  if(!rect.width || !rect.height) return;
  zoomCanvas.style.width = rect.width + 'px';
  zoomCanvas.style.height = rect.height + 'px';
  zoomCanvas.style.left = rect.left + 'px';
  zoomCanvas.style.top = rect.top + 'px';
  zoomCanvas.width = rect.width;
  zoomCanvas.height = rect.height;
  zoomCtx = zoomCanvas.getContext('2d');
  zoomCtx.lineCap = 'round';
  zoomCtx.lineJoin = 'round';
}

zoomImg.addEventListener('load', resizeZoomCanvas);
window.addEventListener('resize', () => { if(zoomOverlay.classList.contains('open')) resizeZoomCanvas(); });

function zoomPos(e){
  const rect = zoomCanvas.getBoundingClientRect();
  const t = e.touches && e.touches[0];
  return { x: (t ? t.clientX : e.clientX) - rect.left, y: (t ? t.clientY : e.clientY) - rect.top };
}

function zoomStartDraw(e){
  e.preventDefault();
  e.stopPropagation();
  if(!zoomCtx) return;
  zoomDrawing = true;
  const p = zoomPos(e);
  zoomCtx.beginPath();
  zoomCtx.moveTo(p.x, p.y);
}
function zoomDraw(e){
  if(!zoomDrawing || !zoomCtx) return;
  e.preventDefault();
  e.stopPropagation();
  const p = zoomPos(e);
  if(zoomTool === 'marker'){
    zoomCtx.globalCompositeOperation = 'source-over';
    zoomCtx.strokeStyle = zoomMarkerColor;
    zoomCtx.lineWidth = 4;
  }else{
    zoomCtx.globalCompositeOperation = 'destination-out';
    zoomCtx.lineWidth = 26;
  }
  zoomCtx.lineTo(p.x, p.y);
  zoomCtx.stroke();
}
function zoomStopDraw(e){
  if(e) e.stopPropagation();
  zoomDrawing = false;
}

zoomCanvas.addEventListener('mousedown', zoomStartDraw);
zoomCanvas.addEventListener('mousemove', zoomDraw);
zoomCanvas.addEventListener('mouseup', zoomStopDraw);
zoomCanvas.addEventListener('mouseleave', zoomStopDraw);
zoomCanvas.addEventListener('click', (e) => e.stopPropagation());
zoomCanvas.addEventListener('touchstart', zoomStartDraw, { passive: false });
zoomCanvas.addEventListener('touchmove', zoomDraw, { passive: false });
zoomCanvas.addEventListener('touchend', zoomStopDraw);

zoomToolbar.addEventListener('click', (e) => {
  e.stopPropagation();
  const colorBtn = e.target.closest('.zoom-color');
  if(colorBtn){
    zoomMarkerColor = colorBtn.getAttribute('data-color');
    zoomTool = 'marker';
    zoomToolbar.querySelectorAll('.zoom-color').forEach(b => b.classList.remove('active'));
    colorBtn.classList.add('active');
    zoomToolbar.querySelectorAll('.zoom-tool[data-tool]').forEach(b => b.classList.toggle('active', b.getAttribute('data-tool') === 'marker'));
    return;
  }
  const toolBtn = e.target.closest('.zoom-tool[data-tool]');
  if(toolBtn){
    zoomTool = toolBtn.getAttribute('data-tool');
    zoomToolbar.querySelectorAll('.zoom-tool[data-tool]').forEach(b => b.classList.remove('active'));
    toolBtn.classList.add('active');
    return;
  }
  const actionBtn = e.target.closest('.zoom-tool[data-action]');
  if(!actionBtn) return;
  const action = actionBtn.getAttribute('data-action');
  if(action === 'clear'){
    if(zoomCtx) zoomCtx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
  }
});

function openZoom(dataUrl, altText){
  zoomImg.src = dataUrl;
  zoomImg.alt = altText || 'Zoomed screenshot';
  zoomOverlay.classList.add('open');
  zoomTool = 'marker';
  zoomToolbar.querySelectorAll('.zoom-tool[data-tool]').forEach(b => b.classList.toggle('active', b.getAttribute('data-tool') === 'marker'));
}

zoomOverlay.addEventListener('click', () => {
  zoomOverlay.classList.remove('open');
  zoomImg.src = '';
  if(zoomCtx) zoomCtx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
});

const grid = document.getElementById('slotGrid');
let draggedSlot = null;
const MIN_SLOTS = 0;
let CURRENT_TASK_URL = '';

function updateDeleteButtons(){
  const slots = grid.querySelectorAll('.slot');
  slots.forEach((s, i) => {
    const btn = s.querySelector('.del-slot');
    btn.style.visibility = slots.length > MIN_SLOTS ? 'visible' : 'hidden';
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
    '<div class="slot-head" contenteditable="true" draggable="false" data-placeholder="Label this location"></div>' +
    '<div class="drop" tabindex="0">' +
      '<div class="drop-empty"><span class="icon">&#9635;</span>No image yet<br>click to select, then paste &mdash; or drag, or double-click to browse</div>' +
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
    drop.innerHTML = '<img src="'+url+'" alt="'+altText.replace(/"/g, '&quot;')+'" draggable="false">';
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

  slot.draggable = true;

  slot.addEventListener('dragstart', (e) => {
    draggedSlot = slot;
    slot.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  slot.addEventListener('dragend', () => {
    slot.classList.remove('dragging');
    grid.querySelectorAll('.slot').forEach(s => s.classList.remove('drag-over'));
    draggedSlot = null;
    updateDeleteButtons();
    persistSlotOrder();
  });

  slot.addEventListener('dragover', (e) => {
    e.preventDefault();
    if(!draggedSlot || draggedSlot === slot) return;
    slot.classList.add('drag-over');
  });

  slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));

  slot.addEventListener('drop', (e) => {
    e.preventDefault();
    slot.classList.remove('drag-over');
    if(!draggedSlot || draggedSlot === slot) return;
    const rect = slot.getBoundingClientRect();
    const insertAfter = (e.clientX - rect.left) > rect.width / 2;
    grid.insertBefore(draggedSlot, insertAfter ? slot.nextSibling : slot);
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

  // ---- Dismissible Field Intel notes (static, hand-written per page) ----
  const DISMISSED_KEY = 'easytarkov-dismissed-notes';
  let dismissed = [];
  try{ dismissed = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'); }catch(e){}

  const noteEls = document.querySelectorAll('.field-intel-note');
  const emptyEl = document.querySelector('.field-intel-empty');

  function refreshEmptyState(){
    if(!emptyEl) return;
    const anyStaticVisible = Array.from(document.querySelectorAll('.field-intel-note')).some(n => !n.classList.contains('dismissed'));
    emptyEl.style.display = anyStaticVisible ? 'none' : 'block';
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

  // ---- Dynamically-added Field Intel notes (owner-added, stored on the backend) ----
  // Temporary authoring tool: lets notes be added without editing code directly.
  // Separate from the static notes above - these are fetched fresh from R2 on every load.
  const fieldIntelSection = emptyEl ? emptyEl.closest('section') : document.querySelector('.field-intel-empty, .field-intel-list')?.closest('section');
  if(fieldIntelSection){
    function getOrCreateList(){
      let list = fieldIntelSection.querySelector('.field-intel-list');
      if(!list){
        list = document.createElement('div');
        list.className = 'field-intel-list';
        const hint = fieldIntelSection.querySelector('.section-hint');
        (hint || fieldIntelSection.querySelector('.section-label')).after(list);
      }
      return list;
    }

    function renderDynamicNote(note){
      const list = getOrCreateList();
      const el = document.createElement('div');
      el.className = 'field-intel-note';
      el.dataset.dynamicId = note.id;
      const removeBtn = document.createElement('button');
      removeBtn.className = 'field-intel-remove';
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label', 'Delete this note');
      removeBtn.textContent = '\u00d7';
      removeBtn.addEventListener('click', async () => {
        try{
          await fetch('/api/notes?task='+encodeURIComponent(CURRENT_TASK_URL)+'&id='+encodeURIComponent(note.id), { method: 'DELETE' });
        }catch(err){}
        el.remove();
        if(emptyEl) refreshEmptyState();
      });
      el.appendChild(removeBtn);
      el.appendChild(document.createTextNode(note.text));
      list.appendChild(el);
      if(emptyEl) emptyEl.style.display = 'none';
    }

    (async () => {
      try{
        const res = await fetch('/api/notes?task='+encodeURIComponent(CURRENT_TASK_URL));
        if(res.ok){
          const data = await res.json();
          (data.notes || []).forEach(renderDynamicNote);
        }
      }catch(err){}
    })();

    const newNoteBtn = document.createElement('button');
    newNoteBtn.className = 'trader-btn';
    newNoteBtn.type = 'button';
    newNoteBtn.textContent = '+ New Note';
    newNoteBtn.style.marginTop = '10px';
    fieldIntelSection.appendChild(newNoteBtn);

    newNoteBtn.addEventListener('click', () => {
      if(fieldIntelSection.querySelector('.new-note-form')) return;
      const form = document.createElement('div');
      form.className = 'new-note-form';
      form.innerHTML =
        '<textarea placeholder="Write a note for other PMCs..." maxlength="500"></textarea>' +
        '<div class="new-note-actions">' +
          '<button class="trader-btn" type="button" data-action="submit">Post Note</button>' +
          '<button class="trader-btn" type="button" data-action="cancel">Cancel</button>' +
        '</div>';
      fieldIntelSection.insertBefore(form, newNoteBtn);
      newNoteBtn.style.display = 'none';
      const textarea = form.querySelector('textarea');
      textarea.focus();

      form.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        form.remove();
        newNoteBtn.style.display = '';
      });

      form.querySelector('[data-action="submit"]').addEventListener('click', async () => {
        const text = textarea.value.trim();
        if(!text) return;
        try{
          const res = await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task: CURRENT_TASK_URL, text })
          });
          if(!res.ok) throw new Error('Failed');
          const note = await res.json();
          renderDynamicNote(note);
          form.remove();
          newNoteBtn.style.display = '';
        }catch(err){
          alert('Could not post note. Please try again.');
        }
      });
    });
  }

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
