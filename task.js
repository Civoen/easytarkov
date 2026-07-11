const zoomOverlay = document.getElementById('zoomOverlay');
const zoomImg = document.getElementById('zoomImg');

function openZoom(dataUrl){
  zoomImg.src = dataUrl;
  zoomOverlay.classList.add('open');
}

zoomOverlay.addEventListener('click', () => {
  zoomOverlay.classList.remove('open');
  zoomImg.src = '';
});

const grid = document.getElementById('slotGrid');
const MIN_SLOTS = 1;

const notesList = document.getElementById('notesList');
const noteToggleBtn = document.getElementById('noteToggleBtn');
const noteForm = document.getElementById('noteForm');
const noteInput = document.getElementById('noteInput');
const noteSubmit = document.getElementById('noteSubmit');
let notes = [];

function renderNotes(){
  notesList.innerHTML = notes.length
    ? notes.map((n, i) =>
        '<div class="note-row">' +
          '<div class="note-head">' +
            '<span class="note-meta">PMC &middot; just now</span>' +
            '<button class="note-delete" data-index="'+i+'" type="button">Remove</button>' +
          '</div>' +
          '<div class="note-body"></div>' +
        '</div>'
      ).join('')
    : '<div class="notes-empty">No notes yet. Be the first to leave field intel.</div>';
  const bodies = notesList.querySelectorAll('.note-body');
  notes.forEach((n, i) => { bodies[i].textContent = n; });
}

notesList.addEventListener('click', (e) => {
  const btn = e.target.closest('.note-delete');
  if(!btn) return;
  const idx = parseInt(btn.getAttribute('data-index'), 10);
  notes.splice(idx, 1);
  renderNotes();
});

noteToggleBtn.addEventListener('click', () => {
  noteToggleBtn.style.display = 'none';
  noteForm.style.display = 'block';
  noteInput.focus();
});

noteSubmit.addEventListener('click', () => {
  const text = noteInput.value.trim();
  if(!text) return;
  notes.unshift(text);
  noteInput.value = '';
  noteForm.style.display = 'none';
  noteToggleBtn.style.display = 'block';
  renderNotes();
});

renderNotes();

function updateDeleteButtons(){
  const slots = grid.querySelectorAll('.slot');
  slots.forEach(s => {
    const btn = s.querySelector('.del-slot');
    btn.style.visibility = slots.length > MIN_SLOTS ? 'visible' : 'hidden';
  });
}

function addSlot(label){
  const slot = document.createElement('div');
  slot.className = 'slot';
  slot.innerHTML =
    '<button class="del-slot" title="Remove this box">&times;</button>' +
    '<div class="slot-head" contenteditable="true" data-placeholder="Label this location"></div>' +
    '<div class="drop"><div class="drop-empty"><span class="icon">&#9635;</span>No image yet<br>click or drag to upload</div></div>' +
    '<div class="slot-foot"><span class="uploader"></span><span class="clear-wrap"></span></div>' +
    '<input type="file" accept="image/*" hidden>';

  slot.querySelector('.slot-head').textContent = label;

  const drop = slot.querySelector('.drop');
  const input = slot.querySelector('input[type=file]');
  const uploaderTag = slot.querySelector('.uploader');
  const clearWrap = slot.querySelector('.clear-wrap');

  function setImage(dataUrl){
    drop.innerHTML = '<img src="'+dataUrl+'">';
    let stamp = slot.querySelector('.stamp');
    if(!stamp){
      stamp = document.createElement('div');
      stamp.className = 'stamp';
      stamp.textContent = 'CONFIRMED';
      slot.appendChild(stamp);
    }
    slot.classList.add('filled');
    uploaderTag.textContent = 'uploaded by you, just now';
    clearWrap.innerHTML = '';

    const actions = document.createElement('div');
    actions.className = 'img-actions';

    const zoomBtn = document.createElement('button');
    zoomBtn.className = 'img-btn';
    zoomBtn.textContent = 'Zoom';
    zoomBtn.onclick = (e) => {
      e.stopPropagation();
      openZoom(dataUrl);
    };

    const replaceBtn = document.createElement('button');
    replaceBtn.className = 'img-btn';
    replaceBtn.textContent = 'Replace';
    replaceBtn.onclick = (e) => {
      e.stopPropagation();
      input.click();
    };

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      slot.classList.remove('filled');
      const oldStamp = slot.querySelector('.stamp');
      if(oldStamp) oldStamp.remove();
      drop.innerHTML = '<div class="drop-empty"><span class="icon">&#9635;</span>No image yet<br>click or drag to upload</div>';
      uploaderTag.textContent = '';
      clearWrap.innerHTML = '';
    };

    actions.appendChild(zoomBtn);
    actions.appendChild(replaceBtn);
    actions.appendChild(removeBtn);
    clearWrap.appendChild(actions);
  }

  function handleFile(file){
    if(!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => setImage(e.target.result);
    reader.readAsDataURL(file);
  }

  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => handleFile(e.target.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    handleFile(e.dataTransfer.files[0]);
  });

  slot.querySelector('.del-slot').addEventListener('click', () => {
    if(grid.querySelectorAll('.slot').length <= MIN_SLOTS) return;
    slot.remove();
    updateDeleteButtons();
  });

  grid.appendChild(slot);
  updateDeleteButtons();
}

document.getElementById('newImageBtn').addEventListener('click', () => addSlot(''));

// Call this from each task page's own small inline script:
// initTaskPage('this_page.html', ['Initial slot label 1', 'Initial slot label 2']);
function initTaskPage(taskUrl, initialSlotLabels){
  initialSlotLabels.forEach(addSlot);

  // ---- Mark complete ----
  const PROGRESS_KEY = 'easytarkov-progress';
  const completeCheck = document.getElementById('completeCheck');
  if(completeCheck){
    let progress = {};
    try{ progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); }catch(e){}
    completeCheck.checked = !!progress[taskUrl];
    completeCheck.addEventListener('change', () => {
      try{
        progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
      }catch(e){ progress = {}; }
      progress[taskUrl] = completeCheck.checked;
      try{ localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); }catch(e){}
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
