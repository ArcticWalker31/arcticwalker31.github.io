// worker.js — Cloudflare Worker relay for the Campus app.
//
// Blacksburg Transit (ridebt.org + its BT4U web service) and the RecSports
// hours feed don't allow browser requests from other sites (no CORS
// headers). This tiny relay
// fetches them server-side and adds the header. It ONLY forwards to the
// allow-listed URLs below and only answers your own site, so it can't be
// used as an open proxy.
//
// Deploy: see campus/README.md ("Set up the bus relay").
// Usage:  https://<your-worker>.workers.dev/?url=<encoded target URL>

const ALLOWED_TARGETS = [
  'https://ridebt.org/index.php?option=com_ajax&module=bt_map&',
  'https://apps.students.vt.edu/rshours/Api/NonRestricted/',
  'https://www.bt4uclassic.org/webservices/bt4u_webservice.asmx/', // trip times & places (directions)
];

const ALLOWED_ORIGINS = [
  'https://arcticwalker31.github.io',
  'http://localhost:8000', // local testing
];

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Origin not allowed', { status: 403, headers: cors });
    }

    const target = new URL(request.url).searchParams.get('url');
    if (!target || !ALLOWED_TARGETS.some((prefix) => target.startsWith(prefix))) {
      return new Response('Target not allowed', { status: 403, headers: cors });
    }

    const init = { method: request.method === 'POST' ? 'POST' : 'GET', headers: {} };
    if (init.method === 'POST') {
      init.headers['Content-Type'] = request.headers.get('Content-Type') || 'application/x-www-form-urlencoded';
      init.body = await request.text();
    }

    let upstream;
    try {
      upstream = await fetch(target, init);
    } catch {
      return new Response('Upstream unreachable', { status: 502, headers: cors });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  },
};
