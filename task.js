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
const MIN_SLOTS = 1;

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
    const slotLabel = slot.querySelector('.slot-head').textContent.trim();
    const altText = slotLabel ? slotLabel + ' screenshot' : 'Community-submitted task location screenshot';
    drop.innerHTML = '<img src="'+dataUrl+'" alt="'+altText.replace(/"/g, '&quot;')+'">';
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
      openZoom(dataUrl, altText);
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

  drop.addEventListener('click', () => {
    const img = drop.querySelector('img');
    if(img){
      openZoom(img.src, img.alt);
    }else{
      input.click();
    }
  });
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
