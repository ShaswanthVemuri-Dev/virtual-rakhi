import { useEffect, useMemo, useRef, useState } from 'react';
import type { FaceAnchor, NormalizedHand, Phase1Frame, WristAnchor } from '../types/vision';
import { VisionManager } from '../vision/visionManager';
import { FaceRetention, WristRetention } from '../vision/trackingRetention';
import { fitCanvasToVideo } from '../ar/canvas';
import { CeremonyRenderer } from '../ar/ceremonyRenderer';
import { RakhiTyingMachine, type RakhiTyingState } from '../rakhi/tyingStateMachine';
import { deriveNetworkVisionFeatures, parseCallDurationSeconds, type ActiveRitual, type CeremonyRole } from './ceremonyState';
import { preloadCeremonyAssets } from './assets';
import { acquireCameraThenMicrophone, describeMediaError } from '../media/acquireMedia';
import { PeerSession, type ConnectionState } from '../rtc/peerSession';
import { compactHands, PROTOCOL_VERSION, type CeremonyMessage } from '../rtc/messages';
import { createRoomCode, normalizeRoomCode } from '../rtc/room';
import Timer from '../components/Timer';
import CeremonyControls from '../components/CeremonyControls';
import CeremonyGuide from '../components/CeremonyGuide';
import BlessingBurst from '../components/BlessingBurst';
import WristPoseGuide from '../components/WristPoseGuide';
import type { Rakhi3DRenderer } from '../ar/rakhi3dRenderer';

const EMPTY_FRAME: Phase1Frame = {
  timestamp: 0,
  faceAnchor: null,
  wristAnchor: null,
  faceLandmarks: [],
  poseLandmarks: [],
  hands: [],
  normalizedHands: [],
  stats: { faceFps: 0, wristFps: 0, handFps: 0, renderFps: 0 },
};

type SessionState = 'LOBBY' | 'PREPARING' | 'WAITING' | 'ACTIVE' | 'ENDED';
type TilakFlow = 'IDLE' | 'WAIT_FACE' | 'ANIMATING' | 'DONE';

const oppositeRole = (role: CeremonyRole): CeremonyRole => role === 'GIVER' ? 'RECEIVER' : 'GIVER';

export default function NetworkCeremonyApp() {
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const trackingVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rakhi3dCanvasRef = useRef<HTMLCanvasElement>(null);
  const rakhi3dRef = useRef<Rakhi3DRenderer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const managerRef = useRef(new VisionManager());
  const rendererRef = useRef(new CeremonyRenderer());
  const faceRetentionRef = useRef(new FaceRetention());
  const wristRetentionRef = useRef(new WristRetention());
  const machineRef = useRef(new RakhiTyingMachine());
  const peerRef = useRef<PeerSession | null>(null);
  const rafRef = useRef<number | null>(null);
  const roleRef = useRef<CeremonyRole>('GIVER');
  const hostRef = useRef(false);
  const connectedRef = useRef(false);
  const activeRitualRef = useRef<ActiveRitual>(null);
  const tilakFlowRef = useRef<TilakFlow>('IDLE');
  const tilakAppliedRef = useRef(false);
  const rakhiAttachedRef = useRef(false);
  const rakhiStateRef = useRef<RakhiTyingState>('IDLE');
  const remoteFaceRef = useRef<FaceAnchor | null>(null);
  const remoteWristRef = useRef<WristAnchor | null>(null);
  const remoteHandsRef = useRef<NormalizedHand[]>([]);
  const aartiStartRef = useRef<number | null>(null);
  const tilakStartRef = useRef<number | null>(null);
  const faceStableSinceRef = useRef<number | null>(null);
  const sessionStartAtRef = useRef(0);
  const sessionDurationRef = useRef(30 * 60);
  const lastUiRef = useRef(0);
  const lastAnchorSendRef = useRef(0);
  const lastStateSendRef = useRef(0);
  const lastTimerSyncRef = useRef(-1);
  const messageHandlerRef = useRef<(message: CeremonyMessage) => void>(() => undefined);
  const connectionHandlerRef = useRef<(state: ConnectionState) => void>(() => undefined);

  const [role, setRoleState] = useState<CeremonyRole>('GIVER');
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState>('LOBBY');
  const [connectionState, setConnectionState] = useState<ConnectionState>('OFF');
  const [frame, setFrame] = useState<Phase1Frame>(EMPTY_FRAME);
  const [remaining, setRemaining] = useState(() => parseCallDurationSeconds());
  const [sessionDuration, setSessionDuration] = useState(() => parseCallDurationSeconds());
  const [activeRitual, setActiveRitualState] = useState<ActiveRitual>(null);
  const [aartiComplete, setAartiComplete] = useState(false);
  const [tilakApplied, setTilakAppliedState] = useState(false);
  const [tilakFlow, setTilakFlowState] = useState<TilakFlow>('IDLE');
  const [rakhiAttached, setRakhiAttachedState] = useState(false);
  const [rakhiState, setRakhiStateState] = useState<RakhiTyingState>('IDLE');
  const [rakhiInstruction, setRakhiInstruction] = useState('Ready to begin Rakhi tying.');
  const [rakhiProgress, setRakhiProgress] = useState(0);
  const [faceActivated, setFaceActivated] = useState(false);
  const [wristActivated, setWristActivated] = useState(false);
  const [giverHandsActive, setGiverHandsActive] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Create a private room or enter a room code to join.');
  const [microphoneWarning, setMicrophoneWarning] = useState<string | null>(null);
  const [blessingBurst, setBlessingBurst] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const [roleModal, setRoleModal] = useState(false);
  const [pendingHosting, setPendingHosting] = useState<boolean | null>(null);
  const [roleConflict, setRoleConflict] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [remoteMedia, setRemoteMedia] = useState({ audio: true, video: true });

  const totalDuration = useMemo(() => parseCallDurationSeconds(), []);
  const computedFeatures = useMemo(() => deriveNetworkVisionFeatures(role, {
    faceActivated, wristActivated, giverHandsActive, rakhiState,
  }), [role, faceActivated, wristActivated, giverHandsActive, rakhiState]);
  const receiverFocus = role === 'RECEIVER' && (activeRitual !== null || tilakApplied || rakhiAttached);

  const setRole = (value: CeremonyRole) => { roleRef.current = value; setRoleState(value); };
  const setActiveRitual = (value: ActiveRitual) => { activeRitualRef.current = value; setActiveRitualState(value); };
  const setTilakFlow = (value: TilakFlow) => { tilakFlowRef.current = value; setTilakFlowState(value); };
  const setTilakApplied = (value: boolean) => { tilakAppliedRef.current = value; setTilakAppliedState(value); };
  const setRakhiAttached = (value: boolean) => { rakhiAttachedRef.current = value; setRakhiAttachedState(value); };
  const setRakhiState = (value: RakhiTyingState) => { rakhiStateRef.current = value; setRakhiStateState(value); };
  const send = (message: CeremonyMessage) => peerRef.current?.send(message);

  useEffect(() => {
    const canvas = rakhi3dCanvasRef.current;
    if (!canvas || sessionState !== 'ACTIVE') return;
    let renderer: Rakhi3DRenderer | null = null;
    let cancelled = false;
    void import('../ar/rakhi3dRenderer').then(({ Rakhi3DRenderer: Renderer }) => {
      if (cancelled) return;
      renderer = new Renderer(canvas);
      rakhi3dRef.current = renderer;
    });
    return () => { cancelled = true; renderer?.dispose(); rakhi3dRef.current = null; };
  }, [sessionState]);
  useEffect(() => {
    preloadCeremonyAssets().then(() => setAssetsReady(true)).catch(() => setError('Ceremony artwork could not be loaded. Re-extract the complete ZIP and retry.'));
  }, []);

  const attachVideo = async (video: HTMLVideoElement | null, stream: MediaStream | null) => {
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    if (stream) await video.play().catch(() => undefined);
  };

  useEffect(() => {
    if (sessionState !== 'ACTIVE' && sessionState !== 'WAITING') return;
    void attachVideo(trackingVideoRef.current, localStreamRef.current);
    if (role === 'GIVER' || !receiverFocus) {
      void attachVideo(mainVideoRef.current, remoteStreamRef.current);
      void attachVideo(pipVideoRef.current, localStreamRef.current);
    } else {
      void attachVideo(mainVideoRef.current, localStreamRef.current);
      void attachVideo(pipVideoRef.current, remoteStreamRef.current);
    }
  }, [role, sessionState, remoteReady, receiverFocus]);

  const releaseAll = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    managerRef.current.stop();
    peerRef.current?.destroy();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    [mainVideoRef.current, pipVideoRef.current, trackingVideoRef.current].forEach((video) => { if (video) video.srcObject = null; });
    faceRetentionRef.current.reset();
    wristRetentionRef.current.reset();
    connectedRef.current = false;
  };

  useEffect(() => () => releaseAll(), []);

  const resetCeremony = () => {
    machineRef.current.reset();
    setActiveRitual(null);
    setAartiComplete(false);
    setTilakApplied(false);
    setTilakFlow('IDLE');
    setRakhiAttached(false);
    setRakhiState('IDLE');
    setRakhiInstruction('Ready to begin Rakhi tying.');
    setRakhiProgress(0);
    setFaceActivated(false);
    setWristActivated(false);
    setGiverHandsActive(false);
    remoteFaceRef.current = null;
    remoteWristRef.current = null;
    remoteHandsRef.current = [];
    aartiStartRef.current = null;
    tilakStartRef.current = null;
    faceStableSinceRef.current = null;
  };

  const setupPeer = () => {
    if (peerRef.current) return peerRef.current;
    peerRef.current = new PeerSession({
      onState: (state) => connectionHandlerRef.current(state),
      onRemoteStream: (stream) => {
        remoteStreamRef.current = stream;
        setRemoteReady(true);
      },
      onMessage: (message) => messageHandlerRef.current(message),
      onError: (message) => setError(message),
    });
    return peerRef.current;
  };

  const prepare = async (hosting: boolean) => {
    setError('');
    setMicrophoneWarning(null);
    setSessionState('PREPARING');
    resetCeremony();
    const code = hosting ? createRoomCode() : normalizeRoomCode(roomCode);
    if (!hosting && code.length < 5) {
      setSessionState('LOBBY');
      setError('Enter the 5–8 character room code shown by the host.');
      return;
    }
    let mediaStarted = false;
    try {
      setNotice('Starting camera first, then microphone…');
      const media = await acquireCameraThenMicrophone();
      mediaStarted = true;
      localStreamRef.current = media.stream;
      setAudioEnabled(media.stream.getAudioTracks().some((track) => track.enabled));
      setVideoEnabled(media.stream.getVideoTracks().some((track) => track.enabled));
      setMicrophoneWarning(media.microphoneError);
      hostRef.current = hosting;
      setIsHost(hosting);
      setRoomCode(code);
      sessionDurationRef.current = totalDuration;
      setSessionDuration(totalDuration);
      window.history.replaceState(null, '', window.location.pathname);
      const peer = setupPeer();
      if (hosting) {
        setNotice('Room created. Share the code and keep this page open.');
        setSessionState('WAITING');
        await peer.host(code, media.stream);
      } else {
        setNotice('Connecting to the host…');
        setSessionState('WAITING');
        await peer.join(code, media.stream);
      }
    } catch (cause) {
      releaseAll();
      setSessionState('LOBBY');
      setError(mediaStarted
        ? `Could not create the room connection: ${cause instanceof Error ? cause.message : 'signaling failed'}`
        : describeMediaError(cause, 'camera'));
    }
  };

  connectionHandlerRef.current = (state) => {
    setConnectionState(state);
    if (state === 'CONNECTED') {
      connectedRef.current = true;
      send({
        type: 'MEDIA_STATE',
        audio: localStreamRef.current?.getAudioTracks().some((track) => track.enabled) ?? false,
        video: localStreamRef.current?.getVideoTracks().some((track) => track.enabled) ?? false,
      });
      if (hostRef.current) setNotice('Connected. Waiting for your sibling to confirm their role…');
      else { send({ type: 'ROLE_SELECTED', role: roleRef.current }); setNotice('Connected. Confirming your ceremony role…'); }
    } else if (state === 'DISCONNECTED' && sessionState === 'ACTIVE') {
      setNotice('Participant disconnected. Your camera remains local; end the session or return to the lobby to reconnect.');
    }
  };

  const beginRemoteAarti = () => {
    aartiStartRef.current = performance.now();
    setActiveRitual('AARTI');
    setNotice('Aarti is running automatically on both screens.');
  };

  const beginRemoteTilak = () => {
    setFaceActivated(true);
    setTilakFlow('WAIT_FACE');
    setActiveRitual('TILAK');
    faceStableSinceRef.current = null;
    setNotice(roleRef.current === 'RECEIVER' ? 'Look toward the camera and hold steady for face lock.' : 'Waiting for the receiver face to lock…');
  };

  const beginRemoteRakhi = () => {
    setWristActivated(true);
    setGiverHandsActive(false);
    setActiveRitual('RAKHI');
    if (roleRef.current === 'GIVER') {
      const update = machineRef.current.start();
      setRakhiState(update.state);
      setRakhiInstruction(update.instruction);
      setRakhiProgress(update.progress);
    } else {
      setRakhiState('WAIT_FOR_RECEIVER_WRIST');
      setRakhiInstruction('Raise your right forearm with the back/knuckle side of the hand facing the camera.');
      setRakhiProgress(0.08);
    }
    setNotice(roleRef.current === 'RECEIVER' ? 'Expose the right wrist in either approved pose.' : 'Waiting for a stable receiver wrist, then show both hands.');
  };

  const finishFromRemote = (reason: string) => {
    releaseAll();
    setConnectionState('OFF');
    setSessionState('ENDED');
    setNotice(reason);
  };

  messageHandlerRef.current = (message) => {
    switch (message.type) {
      case 'ROLE_SELECTED': {
        if (!hostRef.current) break;
        if (message.role === roleRef.current) {
          send({ type: 'ROLE_CONFLICT', requiredRole: oppositeRole(roleRef.current) });
          setNotice('Your sibling needs to choose the other ceremony role.');
          break;
        }
        const startAt = Date.now() + 1000;
        sessionStartAtRef.current = startAt;
        send({ type: 'SESSION_INIT', role: message.role, startAt, duration: totalDuration, version: PROTOCOL_VERSION });
        setSessionState('ACTIVE');
        setNotice('Connected. Begin with Aarti when you are ready.');
        break;
      }
      case 'ROLE_CONFLICT':
        setRoleConflict(true); setPendingHosting(false); setRoleModal(true);
        setNotice(`Please choose ${message.requiredRole === 'GIVER' ? 'Female' : 'Male'} so the ceremony has one giver and one receiver.`);
        break;
      case 'SESSION_INIT':
        if (message.version !== PROTOCOL_VERSION) return setError('The two participants are using incompatible app versions. Refresh both from the same deployment.');
        setRole(message.role);
        sessionStartAtRef.current = message.startAt;
        sessionDurationRef.current = message.duration;
        setSessionDuration(message.duration);
        setRemaining(message.duration);
        setSessionState('ACTIVE');
        setNotice(`Connected as ${message.role.toLowerCase()}. Talk normally or wait for the giver to begin a ritual.`);
        break;
      case 'AARTI_START': beginRemoteAarti(); break;
      case 'AARTI_COMPLETE': setAartiComplete(true); setActiveRitual(null); setNotice('Aarti complete.'); break;
      case 'TILAK_START': beginRemoteTilak(); break;
      case 'TILAK_ANIMATE': tilakStartRef.current = performance.now(); setTilakFlow('ANIMATING'); setNotice('Face locked. Applying Tilak automatically…'); break;
      case 'TILAK_APPLIED': setTilakApplied(true); setTilakFlow('DONE'); setActiveRitual(null); setNotice('Tilak applied and anchored to the receiver forehead.'); break;
      case 'FACE_ANCHOR': remoteFaceRef.current = message.payload; break;
      case 'RAKHI_START': beginRemoteRakhi(); break;
      case 'WRIST_ANCHOR': remoteWristRef.current = message.payload; break;
      case 'GIVER_HANDS': remoteHandsRef.current = message.payload; break;
      case 'RAKHI_STATE': setRakhiState(message.state); setRakhiInstruction(message.instruction); setRakhiProgress(message.progress); break;
      case 'RAKHI_ATTACHED':
        setRakhiAttached(true); setGiverHandsActive(false); setRakhiState('RAKHI_ATTACHED'); setRakhiProgress(1); setActiveRitual(null);
        remoteHandsRef.current = [];
        setRakhiInstruction('Rakhi tied. Keep the right wrist visible so the wrapped Rakhi follows it.');
        setNotice('Rakhi tied. Giver hand tracking has stopped; receiver wrist tracking remains active.');
        break;
      case 'BLESSING': setBlessingBurst(Date.now()); setNotice('A blessing arrived.'); break;
      case 'MEDIA_STATE': setRemoteMedia({ audio: message.audio, video: message.video }); break;
      case 'TIMER_SYNC': setRemaining((current) => Math.abs(current - message.remaining) > 1 ? message.remaining : current); break;
      case 'CALL_END': finishFromRemote(message.reason === 'TIMER' ? 'The synchronized 30-minute session ended.' : 'The other participant ended the call.'); break;
      case 'PING': send({ type: 'PONG', timestamp: message.timestamp }); break;
      default: break;
    }
  };

  useEffect(() => {
    if (sessionState !== 'ACTIVE') return;
    let cancelled = false;
    managerRef.current.setFeatures(computedFeatures).then(() => {
      if (cancelled) return;
    }).catch((cause) => {
      console.error(cause);
      if (!cancelled) setError('A local vision model could not load. Refresh and confirm the camera is available.');
    });
    return () => { cancelled = true; };
  }, [sessionState, computedFeatures]);

  useEffect(() => {
    if (sessionState !== 'ACTIVE') return;
    let cancelled = false;
    const loop = async () => {
      if (cancelled) return;
      const trackingVideo = trackingVideoRef.current;
      const mainVideo = mainVideoRef.current;
      const canvas = canvasRef.current;
      if (!trackingVideo || !mainVideo || !canvas) { rafRef.current = requestAnimationFrame(loop); return; }
      fitCanvasToVideo(canvas, mainVideo);
      const now = performance.now();
      const local = await managerRef.current.process(trackingVideo, now);

      if (now - lastAnchorSendRef.current >= 65) {
        lastAnchorSendRef.current = now;
        if (roleRef.current === 'RECEIVER') {
          if (faceActivated) send({ type: 'FACE_ANCHOR', payload: local.faceAnchor });
          if (wristActivated) send({ type: 'WRIST_ANCHOR', payload: local.wristAnchor });
        } else if (giverHandsActive) {
          send({ type: 'GIVER_HANDS', payload: compactHands(local.normalizedHands) });
        }
      }

      if (roleRef.current === 'RECEIVER' && activeRitualRef.current === 'TILAK' && tilakFlowRef.current === 'WAIT_FACE') {
        if (local.faceAnchor && local.faceAnchor.confidence >= 0.7) {
          if (faceStableSinceRef.current === null) faceStableSinceRef.current = now;
          if (now - faceStableSinceRef.current >= 320) {
            tilakStartRef.current = now;
            setTilakFlow('ANIMATING');
            send({ type: 'TILAK_ANIMATE', timestamp: Date.now() });
          }
        } else faceStableSinceRef.current = null;
      }

      if (activeRitualRef.current === 'AARTI' && aartiStartRef.current !== null && now - aartiStartRef.current >= 4800) {
        aartiStartRef.current = null;
        setAartiComplete(true);
        setActiveRitual(null);
        if (roleRef.current === 'GIVER') send({ type: 'AARTI_COMPLETE', timestamp: Date.now() });
      }

      if (activeRitualRef.current === 'TILAK' && tilakFlowRef.current === 'ANIMATING' && tilakStartRef.current !== null && now - tilakStartRef.current >= 2000) {
        if (roleRef.current === 'RECEIVER') send({ type: 'TILAK_APPLIED', timestamp: Date.now() });
        setTilakApplied(true);
        setTilakFlow('DONE');
        setActiveRitual(null);
      }

      if (roleRef.current === 'GIVER' && activeRitualRef.current === 'RAKHI') {
        const update = machineRef.current.update(now, remoteWristRef.current, local.normalizedHands, true);
        if (update.state === 'WAIT_FOR_GIVER_HANDS' && !giverHandsActive) setGiverHandsActive(true);
        if (update.state === 'WAIT_FOR_RECEIVER_WRIST' && giverHandsActive) setGiverHandsActive(false);
        if (update.state !== rakhiStateRef.current) setRakhiState(update.state);
        setRakhiInstruction(update.instruction);
        setRakhiProgress(update.progress);
        if (now - lastStateSendRef.current >= 100 || update.attachedNow) {
          lastStateSendRef.current = now;
          send({ type: 'RAKHI_STATE', state: update.state, instruction: update.instruction, progress: update.progress });
        }
        if (update.attachedNow) {
          setRakhiAttached(true);
          setGiverHandsActive(false);
          remoteHandsRef.current = [];
          setWristActivated(true);
          setActiveRitual(null);
          send({ type: 'RAKHI_ATTACHED', timestamp: Date.now() });
        }
      }

      const composed: Phase1Frame = roleRef.current === 'GIVER'
        ? { ...local, faceAnchor: remoteFaceRef.current, wristAnchor: remoteWristRef.current, faceLandmarks: [], poseLandmarks: [] }
        : { ...local, normalizedHands: remoteHandsRef.current, hands: [] };
      const faceHeld = faceRetentionRef.current.update(composed.faceAnchor, now);
      const wristHeld = wristRetentionRef.current.update(composed.wristAnchor, now);
      rendererRef.current.draw(canvas, composed, faceHeld, wristHeld, {
        tilakApplied: tilakAppliedRef.current,
        rakhiAttached: rakhiAttachedRef.current,
        aartiProgress: activeRitualRef.current === 'AARTI' && aartiStartRef.current !== null ? Math.min(1, (now - aartiStartRef.current) / 4800) : null,
        tilakProgress: activeRitualRef.current === 'TILAK' && tilakStartRef.current !== null ? Math.min(1, (now - tilakStartRef.current) / 2000) : null,
        frozenWrist: null,
        rakhiState: rakhiStateRef.current,
        mirrored: roleRef.current === 'RECEIVER',
      });
      rakhi3dRef.current?.draw(wristHeld.value, composed.normalizedHands, rakhiStateRef.current, roleRef.current === 'RECEIVER');
      if (now - lastUiRef.current >= 120) {
        lastUiRef.current = now;
        setFrame({ ...composed, stats: { ...composed.stats } });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    void loop();
    return () => { cancelled = true; if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); rafRef.current = null; };
  }, [sessionState, faceActivated, wristActivated, giverHandsActive]);

  useEffect(() => {
    if (sessionState !== 'ACTIVE') return;
    const tick = window.setInterval(() => {
      const duration = sessionDurationRef.current;
      const next = Math.min(duration, Math.max(0, duration - Math.floor((Date.now() - sessionStartAtRef.current) / 1000)));
      setRemaining(next);
      if (hostRef.current && next % 5 === 0 && next !== lastTimerSyncRef.current) {
        lastTimerSyncRef.current = next;
        send({ type: 'TIMER_SYNC', remaining: next, timestamp: Date.now() });
      }
      if (next <= 0 && hostRef.current) {
        send({ type: 'CALL_END', timestamp: Date.now(), reason: 'TIMER' });
        finishFromRemote('The synchronized session timer reached zero. All media, RTC, CV, and animation resources were released.');
      }
    }, 500);
    return () => clearInterval(tick);
  }, [sessionState]);

  const startAarti = () => { beginRemoteAarti(); send({ type: 'AARTI_START', timestamp: Date.now() }); };
  const startTilak = () => { beginRemoteTilak(); send({ type: 'TILAK_START', timestamp: Date.now() }); };
  const startRakhi = () => { beginRemoteRakhi(); send({ type: 'RAKHI_START', timestamp: Date.now() }); };
  const giveBlessing = () => { send({ type: 'BLESSING', timestamp: Date.now() }); setNotice('Blessing sent.'); };
  const endSession = () => { send({ type: 'CALL_END', timestamp: Date.now(), reason: 'MANUAL' }); finishFromRemote('Session ended cleanly. Camera, microphone, WebRTC, data channel, CV models, and animation loops were released.'); };
  const toggleMedia = (kind: 'audio' | 'video') => {
    const tracks = kind === 'audio' ? localStreamRef.current?.getAudioTracks() : localStreamRef.current?.getVideoTracks();
    if (!tracks?.length) return;
    const next = !tracks.some((track) => track.enabled);
    tracks.forEach((track) => { track.enabled = next; });
    if (kind === 'audio') { setAudioEnabled(next); send({ type: 'MEDIA_STATE', audio: next, video: videoEnabled }); }
    else { setVideoEnabled(next); send({ type: 'MEDIA_STATE', audio: audioEnabled, video: next }); }
  };

  const returnToLobby = () => {
    releaseAll();
    resetCeremony();
    peerRef.current = null;
    setSessionState('LOBBY');
    setConnectionState('OFF');
    setRemoteReady(false);
    setError('');
    setNotice('Create a private room or enter a room code to join.');
    window.history.replaceState(null, '', window.location.pathname);
  };

  if (sessionState === 'LOBBY' || sessionState === 'PREPARING') {
    return (
      <section className="ceremony-lobby">
        <div className="lobby-copy phase3-lobby">
          <div className="eyebrow">A PRIVATE RAKSHA BANDHAN CEREMONY</div>
          <h2>Celebrate together, wherever you are</h2>
          <p>Create a room and say the code to your sibling, or enter the code they shared with you. Your camera stays peer-to-peer and is never stored.</p>
          <button className="start-ceremony" disabled={!assetsReady || sessionState === 'PREPARING'} onClick={() => { setPendingHosting(true); setRoleModal(true); }}>{sessionState === 'PREPARING' ? 'Preparing camera…' : 'Create a meeting'}</button>
          <div className="join-divider"><span>OR JOIN AN EXISTING ROOM</span></div>
          <div className="join-row">
            <input aria-label="Room code" value={roomCode} onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))} placeholder="ROOM CODE" maxLength={8} />
            <button disabled={!assetsReady || sessionState === 'PREPARING'} onClick={() => {
              if (normalizeRoomCode(roomCode).length < 5) return setError('Enter the 5–8 character meeting code.');
              setPendingHosting(false); setRoleModal(true);
            }}>Join meeting</button>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <small>Works on current desktop browsers and iPad Safari · Two people · Up to 30 minutes</small>
        </div>
        {roleModal && <div className="role-modal" role="dialog" aria-modal="true" aria-labelledby="role-title"><div className="role-dialog">
          <button className="modal-close" aria-label="Close" onClick={() => setRoleModal(false)}>×</button>
          <div className="eyebrow">PERSONALISE YOUR CEREMONY</div><h2 id="role-title">Who are you?</h2>
          <p>The sister’s screen guides the tying, while the brother’s screen prepares and tracks the wrist.</p>
          {roleConflict && <div className="warning-banner">Your sibling chose the same role. Please choose the other one.</div>}
          <div className="role-options">
            <button onClick={() => { setRole('GIVER'); setRoleModal(false); setRoleConflict(false); if (connectionState === 'CONNECTED') send({ type: 'ROLE_SELECTED', role: 'GIVER' }); else if (pendingHosting !== null) void prepare(pendingHosting); }}><strong>Female</strong><span>I will tie the Rakhi</span></button>
            <button onClick={() => { setRole('RECEIVER'); setRoleModal(false); setRoleConflict(false); if (connectionState === 'CONNECTED') send({ type: 'ROLE_SELECTED', role: 'RECEIVER' }); else if (pendingHosting !== null) void prepare(pendingHosting); }}><strong>Male</strong><span>I will receive the Rakhi</span></button>
          </div>
        </div></div>}
      </section>
    );
  }

  if (sessionState === 'ENDED') {
    return <section className="ended-card"><div className="eyebrow">SESSION ENDED</div><h2>Resources released</h2><p>{notice}</p><button onClick={returnToLobby}>Return to room lobby</button></section>;
  }

  if (sessionState === 'WAITING') {
    return (
      <section className="ceremony-lobby"><div className="lobby-copy waiting-room">
        <div className="eyebrow">{isHost ? 'ROOM READY' : 'JOINING ROOM'}</div><h2>{roomCode}</h2><p>{notice}</p>
        <div className="connection-pulse"><i /><strong>{connectionState.replaceAll('_', ' ')}</strong></div>
        {isHost && <button onClick={() => void navigator.clipboard.writeText(roomCode).then(() => setNotice('Meeting code copied.'))}>Copy meeting code</button>}
        {microphoneWarning && <div className="warning-banner"><strong>Video-only mode</strong>{microphoneWarning}<br />Enable microphone permission and restart this room to add audio.</div>}
        {error && <div className="error-banner">{error}</div>}
        <button className="secondary" onClick={returnToLobby}>Cancel</button>
      </div>
      {roleModal && <div className="role-modal" role="dialog" aria-modal="true" aria-labelledby="role-retry-title"><div className="role-dialog">
        <div className="eyebrow">ONE QUICK CHANGE</div><h2 id="role-retry-title">Choose the other role</h2><p>Your sibling selected the same role. A ceremony needs one sister and one brother.</p>
        <div className="role-options"><button onClick={() => { setRole('GIVER'); setRoleModal(false); setRoleConflict(false); send({ type: 'ROLE_SELECTED', role: 'GIVER' }); }}><strong>Female</strong><span>I will tie the Rakhi</span></button><button onClick={() => { setRole('RECEIVER'); setRoleModal(false); setRoleConflict(false); send({ type: 'ROLE_SELECTED', role: 'RECEIVER' }); }}><strong>Male</strong><span>I will receive the Rakhi</span></button></div>
      </div></div>}
      </section>
    );
  }

  const guideStatus = activeRitual === 'RAKHI'
    ? role === 'RECEIVER' ? `Wrist ${Math.round((frame.wristAnchor?.confidence ?? 0) * 100)}%` : `Hands ${frame.normalizedHands.length}/2 · Wrist ${Math.round((remoteWristRef.current?.confidence ?? 0) * 100)}%`
    : connectionState;

  return (
    <section className="ceremony-session">
      <video ref={trackingVideoRef} className="tracking-video" playsInline muted />
      <div className="session-bar">
        <div><div className="room-code-chip"><span>Meeting code</span><strong>{roomCode}</strong><button onClick={() => void navigator.clipboard.writeText(roomCode)}>Copy</button></div><small className="role-label">{role === 'GIVER' ? 'Sister · tying Rakhi' : 'Brother · receiving Rakhi'}</small><strong>{notice}</strong></div>
        <div className="session-actions"><span className={`connection-chip ${connectionState.toLowerCase()}`}>{connectionState}</span><button className={`media-button ${audioEnabled ? '' : 'off'}`} aria-pressed={!audioEnabled} onClick={() => toggleMedia('audio')}>{audioEnabled ? 'Mute' : 'Unmute'}</button><button className={`media-button ${videoEnabled ? '' : 'off'}`} aria-pressed={!videoEnabled} onClick={() => toggleMedia('video')}>{videoEnabled ? 'Camera off' : 'Camera on'}</button><button className="view-toggle" onClick={() => setSplitView((value) => !value)}>{splitView ? 'Focus view' : 'Split view'}</button><Timer remaining={remaining} total={sessionDuration} /><button className="secondary" onClick={endSession}>End</button></div>
      </div>
      {microphoneWarning && <div className="warning-banner compact-warning"><strong>Video-only:</strong> {microphoneWarning}</div>}
      {error && <div className="error-banner">{error}</div>}
      <div className={`ceremony-grid ${splitView ? 'split-view' : ''}`}>
          <div className={`ceremony-stage-card ${activeRitual === 'RAKHI' ? 'rakhi-priority' : ''}`}>
          <div className="stage-heading"><div><span className="status-dot" data-state={remoteReady ? 'ON' : 'STARTING'} />{receiverFocus ? 'Your ceremony view' : 'Your sibling'}</div><span>{receiverFocus ? 'YOUR CAMERA · MIRRORED' : 'REMOTE · LIVE'}</span></div>
          <div className={`video-stage ceremony-video-stage ${receiverFocus ? '' : 'remote-main'}`}>
            <video ref={mainVideoRef} playsInline muted={receiverFocus} />
            <canvas ref={canvasRef} className="overlay-canvas" />
            <canvas ref={rakhi3dCanvasRef} className="rakhi-3d-canvas" aria-hidden="true" />
            <BlessingBurst burstId={blessingBurst} />
            {!remoteReady && role === 'GIVER' && <div className="camera-placeholder"><strong>Waiting for receiver video…</strong><span>The data channel may connect a moment before media.</span></div>}
            <div className={`self-pip ${receiverFocus ? 'remote-pip' : ''}`}><video ref={pipVideoRef} playsInline muted={!receiverFocus} /><span>{receiverFocus ? 'YOUR SIBLING' : 'YOU'}</span></div>
            {activeRitual === 'RAKHI' && rakhiState !== 'RAKHI_ATTACHED' && role === 'GIVER' && <div className="hand-guide"><div className="center-guide">{rakhiState === 'WAIT_FOR_RECEIVER_WRIST' ? 'Waiting for him to show his wrist…' : rakhiState === 'WAIT_FOR_GIVER_HANDS' || rakhiState === 'POSITIONING' ? 'Show both palms and pinch thumb + index' : 'Move the 3D Rakhi toward his wrist'}</div></div>}
          </div>
          <CeremonyControls role={role} activeRitual={activeRitual} tilakApplied={tilakApplied} rakhiAttached={rakhiAttached} aartiComplete={aartiComplete} disabled={connectionState !== 'CONNECTED'} onAarti={startAarti} onTilak={startTilak} onRakhi={startRakhi} onBlessing={giveBlessing} />
        </div>
        <aside className="ceremony-side">
          {activeRitual === 'RAKHI' && role === 'RECEIVER' && <WristPoseGuide />}
          <CeremonyGuide activeRitual={activeRitual} rakhiState={rakhiState} instruction={activeRitual === 'AARTI' ? 'Aarti is moving in three gentle clockwise circles.' : activeRitual === 'TILAK' ? tilakFlow === 'WAIT_FACE' ? 'Look toward the camera and hold still for a moment.' : 'The Tilak is being applied.' : rakhiInstruction} progress={rakhiProgress} status={guideStatus} nextStep={!aartiComplete ? role === 'GIVER' ? 'Begin with Aarti.' : 'Your sister will begin with Aarti.' : !tilakApplied ? role === 'GIVER' ? 'Apply the Tilak.' : 'Look toward the camera for the Tilak.' : !rakhiAttached ? role === 'GIVER' ? 'Choose Rakhi and bring both hands into view.' : 'Raise your right fist with the knuckle side toward the camera.' : 'If you are the elder sibling, offer a blessing.'} />
          <div className="ceremony-checks"><div><span>WebRTC media</span><strong>{remoteReady ? 'LIVE' : 'CONNECTING'}</strong></div><div><span>Your microphone / camera</span><strong>{audioEnabled ? 'ON' : 'MUTED'} · {videoEnabled ? 'ON' : 'OFF'}</strong></div><div><span>Sibling microphone / camera</span><strong>{remoteMedia.audio ? 'ON' : 'MUTED'} · {remoteMedia.video ? 'ON' : 'OFF'}</strong></div><div><span>Tilak / Rakhi</span><strong>{tilakApplied ? 'TILAK ✓ ' : ''}{rakhiAttached ? 'RAKHI ✓' : ''}</strong></div></div>
        </aside>
      </div>
    </section>
  );
}
