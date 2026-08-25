interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

interface InviteRow {
  rota_name: string;
  role: string;
}

/**
 * Invite codes are the first 8 hex characters of a UUID (see create_invite).
 * Anything else cannot correspond to a real invite, so it is rejected at the
 * edge without touching Supabase.
 */
const INVITE_CODE = /^[0-9a-f]{8}$/;

/** Successful previews change only when the invite is consumed or expires. */
const CACHE_TTL_VALID = 300;
/** Misses are cached too, so enumeration cannot be used to hammer the database. */
const CACHE_TTL_INVALID = 60;

export async function onRequestGet({
  params,
  env,
  request,
  waitUntil,
}: {
  params: Record<string, string | string[]>;
  env: Env;
  request: Request;
  waitUntil: (promise: Promise<unknown>) => void;
}): Promise<Response> {
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const canonicalUrl = new URL(request.url).origin + `/invite/${code}`;

  // Every request used to become one Supabase RPC — one cheap HTTP call
  // amplified into database work on an unauthenticated, uncached path. Reject
  // malformed codes first, then serve from the edge cache where possible.
  if (typeof code !== 'string' || !INVITE_CODE.test(code)) {
    return new Response(invalidHtml(), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_TTL_INVALID}`,
      },
    });
  }

  const cache = caches.default;
  // Key on the normalised path alone; query strings must not fragment the cache.
  const cacheKey = new Request(`${new URL(request.url).origin}/invite/${code}`, {
    method: 'GET',
  });

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let invite: InviteRow | null = null;

  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/lookup_invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_code: code }),
      // Don't hold a worker open on a slow origin.
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const rows = (await res.json()) as InviteRow[];
      invite = rows[0] ?? null;
    }
  } catch {
    // fall through to invalid page
  }

  const html = invite ? validHtml(invite.rota_name, invite.role, code, canonicalUrl) : invalidHtml();
  const response = new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': `public, max-age=${invite ? CACHE_TTL_VALID : CACHE_TTL_INVALID}`,
    },
  });

  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

function validHtml(rotaName: string, role: string, code: string, canonicalUrl: string): string {
  const title = `You're invited to ${rotaName}`;
  const description = `Join as a ${role} on Rotini`;
  const ogImage = 'https://www.gorotini.com/og-invite.png';
  const escapedTitle = escapeHtml(title);
  const escapedDescription = escapeHtml(description);
  const escapedCode = encodeURIComponent(code);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle}</title>
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapedTitle}">
  <meta property="og:description" content="${escapedDescription}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapedTitle}">
  <meta name="twitter:description" content="${escapedDescription}">
  <meta name="twitter:image" content="${ogImage}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #fff; color: #111; min-height: 100svh;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 2rem; text-align: center;
    }
    h1 { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 0.75rem; }
    p { font-size: 1rem; color: #555; margin-bottom: 2rem; line-height: 1.5; }
    .badges { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
    .badge {
      display: inline-flex; align-items: center; gap: 0.5rem;
      background: #111; color: #fff; text-decoration: none;
      padding: 0.625rem 1.25rem; border-radius: 10px;
      font-size: 0.875rem; font-weight: 500; transition: opacity 0.15s;
    }
    .badge:hover { opacity: 0.8; }
    .badge-label { display: flex; flex-direction: column; text-align: left; }
    .badge-label small { font-size: 0.7rem; opacity: 0.75; }
  </style>
</head>
<body>
  <h1>${escapedTitle}</h1>
  <p id="msg">Opening the app&hellip;</p>
  <div class="badges" id="badges" style="display:none">
    <a class="badge" href="#">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
      <span class="badge-label"><small>Download on the</small>App Store</span>
    </a>
    <a class="badge" href="#">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.76c.3.17.64.22.99.15L14.6 12 10.82.09c-.35-.07-.69-.02-.99.15C9.23.63 8.82 1.4 8.82 2.27v19.46c0 .87.41 1.64 1.01 2.03h-.65zM.5 3.8C.19 4.18 0 4.72 0 5.36v13.28c0 .64.19 1.18.5 1.56l.08.08 7.44-7.44v-.17L.58 5.72.5 3.8zM20.12 10.2l-2.12-1.22-2.36 2.36 2.36 2.36 2.14-1.23c.61-.35.61-.92-.02-1.27zM3.18.24L14.6 12l-3.78 3.78L.18 3.8C.7 3.19 1.88 2.62 3.18.24z"/></svg>
      <span class="badge-label"><small>Get it on</small>Google Play</span>
    </a>
  </div>
  <script>
    (function () {
      var code = '${escapedCode}';
      var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
      var isAndroid = /Android/.test(navigator.userAgent);
      var isMobile = isIOS || isAndroid;
      function showFallback() {
        document.getElementById('msg').textContent = 'Get Rotini to accept this invite.';
        document.getElementById('badges').style.display = 'flex';
      }
      if (isMobile && code) {
        window.location.href = 'rotini://invite/' + code;
      }
      setTimeout(showFallback, 1500);
    })();
  </script>
</body>
</html>`;
}

function invalidHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invite no longer valid – Rotini</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #fff; color: #111; min-height: 100svh;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 2rem; text-align: center;
    }
    h1 { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 0.75rem; }
    p { font-size: 1rem; color: #555; margin-bottom: 2rem; line-height: 1.5; }
    .badges { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
    .badge {
      display: inline-flex; align-items: center; gap: 0.5rem;
      background: #111; color: #fff; text-decoration: none;
      padding: 0.625rem 1.25rem; border-radius: 10px;
      font-size: 0.875rem; font-weight: 500; transition: opacity 0.15s;
    }
    .badge:hover { opacity: 0.8; }
    .badge-label { display: flex; flex-direction: column; text-align: left; }
    .badge-label small { font-size: 0.7rem; opacity: 0.75; }
  </style>
</head>
<body>
  <h1>This invite is no longer valid</h1>
  <p>The link has expired or already been used. Ask the rota owner to send a new one.</p>
  <div class="badges">
    <a class="badge" href="#">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
      <span class="badge-label"><small>Download on the</small>App Store</span>
    </a>
    <a class="badge" href="#">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.76c.3.17.64.22.99.15L14.6 12 10.82.09c-.35-.07-.69-.02-.99.15C9.23.63 8.82 1.4 8.82 2.27v19.46c0 .87.41 1.64 1.01 2.03h-.65zM.5 3.8C.19 4.18 0 4.72 0 5.36v13.28c0 .64.19 1.18.5 1.56l.08.08 7.44-7.44v-.17L.58 5.72.5 3.8zM20.12 10.2l-2.12-1.22-2.36 2.36 2.36 2.36 2.14-1.23c.61-.35.61-.92-.02-1.27zM3.18.24L14.6 12l-3.78 3.78L.18 3.8C.7 3.19 1.88 2.62 3.18.24z"/></svg>
      <span class="badge-label"><small>Get it on</small>Google Play</span>
    </a>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
