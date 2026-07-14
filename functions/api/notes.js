// Cloudflare Pages Function — handles dynamically-added Field Intel notes in R2.
// Deployed automatically by Cloudflare Pages at: /api/notes
// Uses the same R2 bucket as images ("IMAGES_BUCKET" binding).
//
// Storage layout in the bucket:
//   tasks/{taskUrl}/notes.json   <- list of dynamically-added notes for that task
//
// This is separate from each task page's hand-written static notes, which stay
// baked directly into the page's HTML and are untouched by this system.
//
// API:
//   GET    /api/notes?task=X                  -> { notes: [{id, text, addedAt}] }
//   POST   /api/notes   (json: task, text)     -> the new note record
//   DELETE /api/notes?task=X&id=Y              -> { ok: true }

const MAX_NOTE_LENGTH = 500;
const ALLOWED_TASK_RE = /^[a-z0-9_]+\.html$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

function badRequest(message) {
  return json({ error: message }, 400);
}

function notesKey(task) {
  return `tasks/${task}/notes.json`;
}

async function readNotes(bucket, task) {
  const obj = await bucket.get(notesKey(task));
  if (!obj) return { notes: [] };
  try {
    return await obj.json();
  } catch (e) {
    return { notes: [] };
  }
}

async function writeNotes(bucket, task, data) {
  await bucket.put(notesKey(task), JSON.stringify(data), {
    httpMetadata: { contentType: 'application/json' },
  });
}

function validTask(task) {
  return typeof task === 'string' && ALLOWED_TASK_RE.test(task);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const task = url.searchParams.get('task');

  if (!validTask(task)) return badRequest('Missing or invalid task parameter.');

  const data = await readNotes(env.IMAGES_BUCKET, task);
  return json(data);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return badRequest('Expected JSON body.');
  }

  const { task, text } = body;
  if (!validTask(task)) return badRequest('Missing or invalid task parameter.');

  const trimmed = (text || '').toString().trim();
  if (!trimmed) return badRequest('Note text is required.');
  if (trimmed.length > MAX_NOTE_LENGTH) return badRequest('Note is too long (max 500 characters).');

  const data = await readNotes(env.IMAGES_BUCKET, task);
  const note = {
    id: crypto.randomUUID(),
    text: trimmed,
    addedAt: new Date().toISOString(),
  };
  data.notes.push(note);
  await writeNotes(env.IMAGES_BUCKET, task, data);

  return json(note, 201);
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const task = url.searchParams.get('task');
  const id = url.searchParams.get('id');

  if (!validTask(task)) return badRequest('Missing or invalid task parameter.');
  if (!id) return badRequest('Missing id.');

  const data = await readNotes(env.IMAGES_BUCKET, task);
  const idx = data.notes.findIndex(n => n.id === id);
  if (idx === -1) return badRequest('Note not found.');

  data.notes.splice(idx, 1);
  await writeNotes(env.IMAGES_BUCKET, task, data);

  return json({ ok: true });
}
