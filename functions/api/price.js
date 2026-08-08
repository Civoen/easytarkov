// Cloudflare Pages Function — proxies flea price lookups to tarkov.dev server-side.
// Deployed automatically at: /api/price
//
// This exists specifically to avoid browser CORS issues entirely. A request made
// from this Function to tarkov.dev is server-to-server - CORS is a browser-only
// restriction, so it never applies here. The browser only ever talks to this same
// site's own /api/price endpoint, which is always same-origin.
//
// API:
//   GET /api/price?name=X   -> { items: [{ name, shortName, avg24hPrice, basePrice, iconLink, wikiLink, sellFor }] }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const name = url.searchParams.get('name');

  if (!name) return json({ error: 'Missing name parameter.' }, 400);

  // Inline the name directly rather than using GraphQL variables - tarkov.dev's
  // own documentation examples always inline values this way and never
  // demonstrate variables, suggesting their server has incomplete support for
  // the variables mechanism even though it's normally part of the GraphQL spec.
  const escapedName = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const query = '{ itemsByName(name: "' + escapedName + '") { name shortName avg24hPrice basePrice iconLink wikiLink sellFor { price source } } }';

  let res;
  try {
    res = await fetch('https://api.tarkov.dev/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
  } catch (err) {
    return json({ error: 'Could not reach the price service.' }, 502);
  }

  if (!res.ok) return json({ error: 'Price service returned HTTP ' + res.status }, 502);

  let data;
  try {
    data = await res.json();
  } catch (err) {
    return json({ error: 'Price service returned an invalid response.' }, 502);
  }

  if (data.errors && data.errors.length) {
    return json({ error: data.errors[0].message || 'Price service returned an error.' }, 502);
  }

  return json({ items: (data.data && data.data.itemsByName) || [] });
}
