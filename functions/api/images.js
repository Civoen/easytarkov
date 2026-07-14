// Cloudflare Pages Function — handles real screenshot storage in R2.
// Deployed automatically by Cloudflare Pages at: /api/images
// Requires an R2 bucket bound to this Pages project as "IMAGES_BUCKET"
// (Pages dashboard -> Settings -> Functions -> R2 bucket bindings).
//
// Storage layout in the bucket:
//   tasks/{taskUrl}/manifest.json      <- list of current image slots for that task
//   tasks/{taskUrl}/{uuid}.webp        <- the actual image files
//
// API:
//   GET    /api/images?task=X                       -> { slots: [{id, label, url, uploadedAt}] }
//   POST   /api/images   (multipart: task, label, file) -> the new slot record
//   PATCH  /api/images   (json: task, id, label)     -> { ok: true }
//   DELETE /api/images?task=X&id=Y                   -> { ok: true }

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB safety cap (client already compresses to WebP)
const ALLOWED_TASK_RE = /^[a-z0-9_]+\.html$/; // must match an actual task filename pattern

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

function manifestKey(task) {
  return `tasks/${task}/manifest.json`;
}

async function readManifest(bucket, task) {
  const obj = await bucket.get(manifestKey(task));
  if (!obj) return { slots: [] };
  try {
    return await obj.json();
  } catch (e) {
    return { slots: [] };
  }
}

async function writeManifest(bucket, task, manifest) {
  await bucket.put(manifestKey(task), JSON.stringify(manifest), {
    httpMetadata: { contentType: 'application/json' },
  });
}

function validTask(task) {
  return typeof task === 'string' && ALLOWED_TASK_RE.test(task);
}

// Public base URL images are served from (R2 public bucket / custom domain).
// Set this to your actual public bucket URL once configured — see deployment guide.
function publicUrlFor(env, key) {
  return `${env.IMAGES_PUBLIC_BASE_URL}/${key}`;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const task = url.searchParams.get('task');

  if (!validTask(task)) return badRequest('Missing or invalid task parameter.');

  const manifest = await readManifest(env.IMAGES_BUCKET, task);
  return json(manifest);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return badRequest('Expected multipart/form-data.');
  }

  const task = form.get('task');
  const label = (form.get('label') || '').toString().slice(0, 120);
  const file = form.get('file');

  if (!validTask(task)) return badRequest('Missing or invalid task parameter.');
  if (!(file instanceof File)) return badRequest('Missing file.');
  if (!file.type.startsWith('image/')) return badRequest('File must be an image.');
  if (file.size > MAX_FILE_BYTES) return badRequest('Image is too large (max 5MB).');

  const id = crypto.randomUUID();
  const key = `tasks/${task}/${id}.webp`;

  await env.IMAGES_BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const manifest = await readManifest(env.IMAGES_BUCKET, task);
  const slot = {
    id,
    label,
    url: publicUrlFor(env, key),
    uploadedAt: new Date().toISOString(),
  };
  manifest.slots.push(slot);
  await writeManifest(env.IMAGES_BUCKET, task, manifest);

  return json(slot, 201);
}

export async function onRequestPatch(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return badRequest('Expected JSON body.');
  }

  const { task, id, label, reorder } = body;
  if (!validTask(task)) return badRequest('Missing or invalid task parameter.');

  const manifest = await readManifest(env.IMAGES_BUCKET, task);

  if (Array.isArray(reorder)) {
    const byId = new Map(manifest.slots.map(s => [s.id, s]));
    const reordered = reorder.map(rid => byId.get(rid)).filter(Boolean);
    // Keep any slots not mentioned (shouldn't normally happen) appended at the end,
    // so nothing is ever silently dropped by a reorder request.
    const mentioned = new Set(reorder);
    manifest.slots = reordered.concat(manifest.slots.filter(s => !mentioned.has(s.id)));
    await writeManifest(env.IMAGES_BUCKET, task, manifest);
    return json({ ok: true });
  }

  if (!id) return badRequest('Missing id.');
  const slot = manifest.slots.find(s => s.id === id);
  if (!slot) return badRequest('Slot not found.');

  slot.label = (label || '').toString().slice(0, 120);
  await writeManifest(env.IMAGES_BUCKET, task, manifest);

  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const task = url.searchParams.get('task');
  const id = url.searchParams.get('id');

  if (!validTask(task)) return badRequest('Missing or invalid task parameter.');
  if (!id) return badRequest('Missing id.');

  const manifest = await readManifest(env.IMAGES_BUCKET, task);
  const idx = manifest.slots.findIndex(s => s.id === id);
  if (idx === -1) return badRequest('Slot not found.');

  await env.IMAGES_BUCKET.delete(`tasks/${task}/${id}.webp`);
  manifest.slots.splice(idx, 1);
  await writeManifest(env.IMAGES_BUCKET, task, manifest);

  return json({ ok: true });
}
