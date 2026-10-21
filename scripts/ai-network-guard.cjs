// Defense in depth for trusted local tests, not a hostile-code network sandbox.
const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options =
    typeof args[0] === 'object'
      ? args[0]
      : { host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  const host = options.host || 'localhost';
  if (options.path) return connect.apply(this, args); // local IPC only
  if (
    process.env.TERRALAB_TEST_NETWORK !== 'loopback' ||
    !['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)
  ) {
    throw new Error('Approved test network policy denied external connection');
  }
  return connect.apply(this, args);
};
