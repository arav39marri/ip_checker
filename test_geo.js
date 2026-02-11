const { buildMetrics } = require('./lib/metrics');

async function run() {
  console.log('Test with ::1 (local IPv6)');
  const reqLocal = {
    headers: {
      'user-agent': 'node-test',
      'accept-language': 'en-US'
    },
    socket: { remoteAddress: '::1' }
  };

  try {
    const resLocal = await buildMetrics(reqLocal);
    console.log(JSON.stringify(resLocal, null, 2));
  } catch (err) {
    console.error('Error local:', err);
  }

  console.log('\nTest with public IPv4 103.172.179.24');
  const reqPublic = {
    headers: {
      'user-agent': 'node-test',
      'accept-language': 'en-US'
    },
    socket: { remoteAddress: '103.172.179.24' }
  };

  try {
    const resPub = await buildMetrics(reqPublic);
    console.log(JSON.stringify(resPub, null, 2));
  } catch (err) {
    console.error('Error public:', err);
  }
}

run();
