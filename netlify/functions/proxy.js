// Netlify Function: CORS proxy for feed aggregation
// Called as /.netlify/functions/proxy?url=<encoded URL>
// Whitelisted to Substack API + Apple iTunes Lookup so we don't become an open proxy.

const ALLOW_HOSTS = new Set([
  'seanisdwelling.substack.com',
  'matthewkr.substack.com',
  'pexelab.substack.com',
  'itunes.apple.com'
]);

exports.handler = async (event) => {
  const target = event.queryStringParameters && event.queryStringParameters.url;
  if (!target) {
    return { statusCode: 400, body: 'Missing url parameter' };
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return { statusCode: 400, body: 'Invalid url' };
  }

  if (!ALLOW_HOSTS.has(parsed.hostname)) {
    return { statusCode: 403, body: `Host not allowed: ${parsed.hostname}` };
  }

  try {
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PEXELabFeed/1.0)',
        'Accept': 'application/json, */*'
      }
    });
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=600'
      },
      body
    };
  } catch (err) {
    return { statusCode: 502, body: `Upstream fetch failed: ${err.message}` };
  }
};
