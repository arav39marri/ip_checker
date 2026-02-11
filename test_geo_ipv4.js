const { buildMetrics } = require('./lib/metrics');

async function run() {
  console.log('Test with public IPv4 103.172.179.24');
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
