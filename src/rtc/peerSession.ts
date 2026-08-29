import Peer, { type DataConnection, type MediaConnection, type PeerOptions } from 'peerjs';
import type { CeremonyMessage } from './messages';
import { isCeremonyMessage } from './messages';
import { hostPeerId } from './room';

export type ConnectionState = 'OFF' | 'SIGNALING' | 'WAITING' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export interface PeerSessionEvents {
  onState: (state: ConnectionState) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onMessage: (message: CeremonyMessage) => void;
  onError: (message: string) => void;
}

const peerOptions = (): PeerOptions => {
  const host = import.meta.env.VITE_PEER_HOST as string | undefined;
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const iceServers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl,
      username: import.meta.env.VITE_TURN_USERNAME as string | undefined,
      credential: import.meta.env.VITE_TURN_CREDENTIAL as string | undefined,
    });
  }
  const options: PeerOptions = { debug: 1, config: { iceServers } };
  if (host) {
    options.host = host;
    options.port = Number(import.meta.env.VITE_PEER_PORT ?? 9000);
    options.path = (import.meta.env.VITE_PEER_PATH as string | undefined) ?? '/peerjs';
    options.secure = String(import.meta.env.VITE_PEER_SECURE ?? 'false') === 'true';
  }
  return options;
};

export const acceptsParticipant = (acceptedPeer: string | null, incomingPeer: string) =>
  acceptedPeer === null || acceptedPeer === incomingPeer;

export class PeerSession {
  private peer: Peer | null = null;
  private data: DataConnection | null = null;
  private call: MediaConnection | null = null;
  private destroyed = false;
  private acceptedPeer: string | null = null;
  private dataOpen = false;
  private mediaReady = false;
  private connected = false;
  private messageWindowStarted = 0;
  private messageCount = 0;

  constructor(private readonly events: PeerSessionEvents) {}

  async host(room: string, stream: MediaStream) {
    this.destroy();
    this.destroyed = false;
    this.events.onState('SIGNALING');
    const peer = new Peer(hostPeerId(room), peerOptions());
    this.peer = peer;
    this.bindPeer(peer, stream, true);
    await this.waitForOpen(peer);
    this.events.onState('WAITING');
  }

  async join(room: string, stream: MediaStream) {
    this.destroy();
    this.destroyed = false;
    this.events.onState('SIGNALING');
    const peer = new Peer(peerOptions());
    this.peer = peer;
    this.bindPeer(peer, stream, false);
    await this.waitForOpen(peer);
    this.events.onState('CONNECTING');
    this.bindData(peer.connect(hostPeerId(room), { reliable: true, serialization: 'json' }));
    this.bindCall(peer.call(hostPeerId(room), stream));
  }

  send(message: CeremonyMessage) {
    if (this.data?.open) this.data.send(message);
  }

  async replaceStream(stream: MediaStream) {
    const connection = this.call?.peerConnection;
    if (!connection) return false;
    const tracks = stream.getTracks();
    let videoReplaced = false;
    await Promise.all(connection.getSenders().map(async (sender) => {
      const replacement = tracks.find((track) => track.kind === sender.track?.kind);
      if (replacement) {
        await sender.replaceTrack(replacement);
        if (replacement.kind === 'video') videoReplaced = true;
      }
    }));
    return videoReplaced;
  }

  destroy() {
    this.destroyed = true;
    this.data?.close();
    this.call?.close();
    this.peer?.destroy();
    this.data = null;
    this.call = null;
    this.peer = null;
    this.acceptedPeer = null;
    this.dataOpen = this.mediaReady = this.connected = false;
    this.messageWindowStarted = this.messageCount = 0;
  }

  private accepts(peerId: string) {
    if (!acceptsParticipant(this.acceptedPeer, peerId)) return false;
    this.acceptedPeer = peerId;
    return true;
  }

  private updateConnected() {
    if (!this.connected && this.dataOpen && this.mediaReady) {
      this.connected = true;
      this.events.onState('CONNECTED');
    }
  }

  private bindPeer(peer: Peer, stream: MediaStream, hosting: boolean) {
    peer.on('connection', (connection) => {
      if (!hosting || this.data || !this.accepts(connection.peer)) return connection.close();
      this.bindData(connection);
    });
    peer.on('call', (call) => {
      if (!hosting || this.call || !this.accepts(call.peer)) return call.close();
      this.bindCall(call);
      call.answer(stream);
    });
    peer.on('disconnected', () => {
      if (!this.destroyed) {
        this.events.onState('CONNECTING');
        try { peer.reconnect(); } catch { this.events.onState('DISCONNECTED'); }
      }
    });
    peer.on('error', (error) => {
      if (this.destroyed) return;
      const message = error.type === 'unavailable-id'
        ? 'That room code is already in use. Create a different room.'
        : error.type === 'peer-unavailable'
          ? 'Room not found yet. Confirm the code and make sure the host is waiting.'
          : `Connection error: ${error.message}`;
      this.events.onState('ERROR');
      this.events.onError(message);
    });
  }

  private bindData(connection: DataConnection) {
    this.data = connection;
    connection.on('open', () => { this.dataOpen = true; this.updateConnected(); });
    connection.on('data', (value) => {
      const now = Date.now();
      if (now - this.messageWindowStarted >= 1_000) { this.messageWindowStarted = now; this.messageCount = 0; }
      this.messageCount += 1;
      if (this.messageCount <= 60 && isCeremonyMessage(value)) this.events.onMessage(value);
    });
    connection.on('close', () => {
      this.dataOpen = false;
      this.connected = false;
      if (!this.destroyed) this.events.onState('DISCONNECTED');
    });
    connection.on('error', (error) => this.events.onError(`Data channel error: ${error.message}`));
  }

  private bindCall(call: MediaConnection) {
    this.call = call;
    call.on('stream', (stream) => { this.mediaReady = true; this.events.onRemoteStream(stream); this.updateConnected(); });
    call.on('close', () => {
      this.mediaReady = false;
      this.connected = false;
      if (!this.destroyed) this.events.onState('DISCONNECTED');
    });
    call.on('error', (error) => this.events.onError(`Media connection error: ${error.message}`));
  }

  private waitForOpen(peer: Peer) {
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Signaling timed out. Check the internet connection and retry.')), 12_000);
      peer.once('open', () => {
        window.clearTimeout(timeout);
        resolve();
      });
      peer.once('error', (error) => {
        window.clearTimeout(timeout);
        reject(error);
      });
    });
  }
}
