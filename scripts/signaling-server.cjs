const { PeerServer } = require('peer');

const port = Number(process.env.RAKHI_SIGNALING_PORT || 9000);
PeerServer({ port, path: '/peerjs', proxied: false, allow_discovery: false });
console.log(`[signaling] Local PeerServer ready on http://127.0.0.1:${port}/peerjs`);
