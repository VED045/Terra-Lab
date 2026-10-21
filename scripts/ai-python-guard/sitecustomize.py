"""Best-effort trusted test guard; not an OS firewall or hostile-code sandbox."""
import os
import socket
_connect = socket.socket.connect
def connect(self, address):
    if isinstance(address, tuple) and (os.environ.get('TERRALAB_TEST_NETWORK') != 'loopback' or address[0] not in ('127.0.0.1','localhost','::1')):
        raise OSError('Approved test network policy denied external connection')
    return _connect(self, address)
socket.socket.connect = connect
