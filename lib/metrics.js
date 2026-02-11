const nodeFetch = require('node-fetch');

const GEO_CACHE_TTL_MS = 1 * 60 * 1000;
const geoCache = new Map();

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

function getCachedGeo(key) {
  const entry = geoCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    geoCache.delete(key);
    return null;
  }
  return entry.value;
}

function looksLikeIp(val) {
  if (!val || typeof val !== 'string') return false;
  // simple IPv4 check
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(val)) return true;
  // presence of colon for IPv6
  if (val.includes(':')) return true;
  return false;
}

function setCachedGeo(key, value) {
  geoCache.set(key, {
    value,
    expiresAt: Date.now() + GEO_CACHE_TTL_MS
  });
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
    const cacheKey = `ip:${lookupIp}`;
    geo = getCachedGeo(cacheKey);
    if (!geo) {
      geo = await safeGeoLookup(`https://ipapi.co/${lookupIp}/json/`);
      // If ipapi failed for this specific IP, try ipwho.is as a fallback
      if (geo && geo.error) {
        const who = await safeGeoLookup(`https://ipwho.is/${lookupIp}`);
        if (who && !who.error && looksLikeIp(who.ip)) {
          geo = who;
        }
      }
      if (geo && !geo.error) setCachedGeo(cacheKey, geo);
    }
  } else {
    const baseKey = 'ip:public';
    let baseGeo = getCachedGeo(baseKey);
    if (!baseGeo) {
      baseGeo = await safeGeoLookup('https://ipapi.co/json/');
      // If ipapi.co is rate-limited or returned an error, try a lightweight fallback to get public IP
      if (baseGeo && baseGeo.error) {
        const ipify = await safeGeoLookup('https://api.ipify.org?format=json');
        if (ipify && !ipify.error && ipify.ip) {
          const fallbackGeo = await safeGeoLookup(`https://ipapi.co/${encodeURIComponent(ipify.ip)}/json/`);
          if (fallbackGeo && !fallbackGeo.error) {
            baseGeo = fallbackGeo;
          }
        }
        // if still error, try ipwho.is for caller info
        if (baseGeo && baseGeo.error) {
          const whoJson = await safeGeoLookup('https://ipwho.is/');
          if (whoJson && !whoJson.error && looksLikeIp(whoJson.ip)) {
            baseGeo = whoJson;
          }
        }
      }
      if (baseGeo && !baseGeo.error) setCachedGeo(baseKey, baseGeo);
    }
    if (baseGeo && baseGeo.ip && looksLikeIp(baseGeo.ip)) {
      effectiveIp = baseGeo.ip;
      const lookupIp = encodeURIComponent(baseGeo.ip);
      const cacheKey = `ip:${lookupIp}`;
      let ipGeo = getCachedGeo(cacheKey);
      if (!ipGeo) {
        ipGeo = await safeGeoLookup(`https://ipapi.co/${lookupIp}/json/`);
        if (ipGeo && !ipGeo.error) setCachedGeo(cacheKey, ipGeo);
      }
      geo = ipGeo && !ipGeo.error ? ipGeo : baseGeo;
    } else {
      geo = baseGeo;
    }
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
