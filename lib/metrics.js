const nodeFetch = require('node-fetch');

function getFetch() {
  if (typeof fetch === 'function') return fetch;
  return nodeFetch;
}

function normalizeIp(raw) {
  if (!raw) return '';
  let ip = raw.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  return ip;
}

function isPrivateOrLocalIp(ip) {
  if (!ip) return true;
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
  if (ip === '127.0.0.1') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip.startsWith('169.254.')) return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) return true;
  return false;
}

async function safeGeoLookup(url) {
  const fetchImpl = getFetch();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    const body = await response.text();

    try {
      const parsed = JSON.parse(body);
      if (!response.ok) {
        return {
          error: 'Geo lookup failed',
          status: response.status,
          body: parsed
        };
      }
      return parsed;
    } catch {
      return {
        error: 'Geo lookup returned non-JSON response',
        status: response.status,
        body
      };
    }
  } catch (err) {
    return {
      error: 'Geo lookup fetch failed',
      message: err && err.message ? err.message : String(err)
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function buildMetrics(req) {
  const rawIp =
    req.headers['x-forwarded-for'] ||
    (req.socket && req.socket.remoteAddress) ||
    (req.connection && req.connection.remoteAddress) ||
    '';

  const ip = normalizeIp(rawIp);
  const ipVersion = ip.includes(':') ? 'IPv6' : 'IPv4';
  let effectiveIp = ip;
  let geo;

  if (!isPrivateOrLocalIp(ip)) {
    const lookupIp = encodeURIComponent(ip);
    geo = await safeGeoLookup(`https://ipapi.co/${lookupIp}/json/`);
  } else {
    geo = await safeGeoLookup('https://ipapi.co/json/');
    if (geo && geo.ip) effectiveIp = geo.ip;
  }

  const headers = {
    'user-agent': req.headers['user-agent'] || '',
    'accept-language': req.headers['accept-language'] || ''
  };

  return {
    ip,
    effective_ip: effectiveIp,
    ip_version: ipVersion,
    geo,
    headers
  };
}

module.exports = {
  buildMetrics
};
