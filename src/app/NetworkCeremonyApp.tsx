import { useEffect, useMemo, useRef, useState } from 'react';
import type { FaceAnchor, NormalizedHand, Phase1Frame, WristAnchor } from '../types/vision';
import { VisionManager } from '../vision/visionManager';
import { FaceRetention, WristRetention } from '../vision/trackingRetention';
import { fitCanvasToVideo } from '../ar/canvas';
import { drawHandShadow } from '../ar/handShadowRenderer';
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
import { fuseWristAnchors } from '../vision/wristPose';
import { mirrorHandsForCanvas } from '../rakhi/handRetargeting';
import { Microphone01 } from '@untitledui/icons/Microphone01';
import { MicrophoneOff01 } from '@untitledui/icons/MicrophoneOff01';
import { Camera01 } from '@untitledui/icons/Camera01';
import { CameraOff } from '@untitledui/icons/CameraOff';
import { Columns02 } from '@untitledui/icons/Columns02';
import { Maximize01 } from '@untitledui/icons/Maximize01';
import { Copy01 } from '@untitledui/icons/Copy01';
import { PhoneCall02 } from '@untitledui/icons/PhoneCall02';

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
const AARTI_DURATION_MS = 13_500;
const TILAK_DURATION_MS = 3_200;

export default function NetworkCeremonyApp() {
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const pipCanvasRef = useRef<HTMLCanvasElement>(null);
  const trackingVideoRef = useRef<HTMLVideoElement>(null);
  const wristTrackingVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const broadcastOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const broadcastCanvasRef = useRef<HTMLCanvasElement>(null);
  const rakhi3dCanvasRef = useRef<HTMLCanvasElement>(null);
  const rakhi3dRef = useRef<Rakhi3DRenderer | null>(null);
  const vtoStartRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const managerRef = useRef(new VisionManager());
  const rendererRef = useRef(new CeremonyRenderer());
  const broadcastRendererRef = useRef(new CeremonyRenderer());
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
  const retainedTilakFaceRef = useRef<FaceAnchor | null>(null);
  const remoteWristRef = useRef<WristAnchor | null>(null);
  const remoteHandsRef = useRef<NormalizedHand[]>([]);
  const aartiStartRef = useRef<number | null>(null);
  const tilakStartRef = useRef<number | null>(null);
  const faceStableSinceRef = useRef<number | null>(null);
  const sessionStartAtRef = useRef(0);
  const sessionDurationRef = useRef(20 * 60);
  const lastUiRef = useRef(0);
  const lastAnchorSendRef = useRef(0);
  const lastStateSendRef = useRef(0);
  const lastTimerSyncRef = useRef(-1);
  const blessingTimerRef = useRef<number | null>(null);
  const handFadeStartRef = useRef<number | null>(null);
  const compositeStreamRef = useRef<MediaStream | null>(null);
  const compositeSendingRef = useRef(false);
  const compositeReplacePendingRef = useRef(false);
  const lastCompositeAttemptRef = useRef(-Infinity);
  const messageHandlerRef = useRef<(message: CeremonyMessage) => void>(() => undefined);
  const connectionHandlerRef = useRef<(state: ConnectionState) => void>(() => undefined);

  const [role, setRoleState] = useState<CeremonyRole>('GIVER');
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState>('LOBBY');
  const [connectionState, setConnectionState] = useState<ConnectionState>('OFF');
  const [frame, setFrame] = useState<Phase1Frame>(EMPTY_FRAME);
  const [remaining, setRemaining] = useState(() => parseCallDurationSeconds());
  const [activeRitual, setActiveRitualState] = useState<ActiveRitual>(null);
  const [aartiComplete, setAartiComplete] = useState(false);
  const [tilakApplied, setTilakAppliedState] = useState(false);
  const [tilakFlow, setTilakFlowState] = useState<TilakFlow>('IDLE');
  const [rakhiAttached, setRakhiAttachedState] = useState(false);
  const [rakhiState, setRakhiStateState] = useState<RakhiTyingState>('IDLE');
  const [rakhiInstruction, setRakhiInstruction] = useState('Ready to begin Rakhi tying.');
  const [rakhiProgress, setRakhiProgress] = useState(0);
  const [faceActivated, setFaceActivated] = useState(false);
  const [giverHandsActive, setGiverHandsActive] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Create a private room or enter a room code to join.');
  const [microphoneWarning, setMicrophoneWarning] = useState<string | null>(null);
  const [blessingBurst, setBlessingBurst] = useState(0);
  const [blessingTarget, setBlessingTarget] = useState<CeremonyRole | null>(null);
  const [assetsReady, setAssetsReady] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const [roleModal, setRoleModal] = useState(false);
  const [pendingHosting, setPendingHosting] = useState<boolean | null>(null);
  const [roleConflict, setRoleConflict] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [wristTrackerReady, setWristTrackerReady] = useState(false);

  const totalDuration = useMemo(() => parseCallDurationSeconds(), []);
  const computedFeatures = useMemo(() => deriveNetworkVisionFeatures(role, {
    faceActivated, giverHandsActive, rakhiState,
  }), [role, faceActivated, giverHandsActive, rakhiState]);
  const receiverFocus = role === 'RECEIVER' && (activeRitual !== null || tilakApplied || rakhiAttached);
  const localIsMain = blessingTarget ? role === blessingTarget : receiverFocus;

  const setRole = (value: CeremonyRole) => { roleRef.current = value; setRoleState(value); };
  const setActiveRitual = (value: ActiveRitual) => { activeRitualRef.current = value; setActiveRitualState(value); };
  const setTilakFlow = (value: TilakFlow) => { tilakFlowRef.current = value; setTilakFlowState(value); };
  const setTilakApplied = (value: boolean) => { tilakAppliedRef.current = value; setTilakAppliedState(value); };
  const setRakhiAttached = (value: boolean) => { rakhiAttachedRef.current = value; setRakhiAttachedState(value); };
  const setRakhiState = (value: RakhiTyingState) => { rakhiStateRef.current = value; setRakhiStateState(value); };
  const send = (message: CeremonyMessage) => peerRef.current?.send(message);

  useEffect(() => {
    const canvas = rakhi3dCanvasRef.current;
    if (!canvas || sessionState !== 'ACTIVE' || role !== 'RECEIVER') return;
    let renderer: Rakhi3DRenderer | null = null;
    let cancelled = false;
    void import('../ar/rakhi3dRenderer').then(({ Rakhi3DRenderer: Renderer }) => {
      if (cancelled) return;
      renderer = new Renderer(canvas);
      rakhi3dRef.current = renderer;
    });
    return () => { cancelled = true; renderer?.dispose(); rakhi3dRef.current = null; };
  }, [sessionState, role]);

  useEffect(() => {
    preloadCeremonyAssets().then(() => setAssetsReady(true)).catch(() => setError('Call assets could not be loaded. Re-extract the complete ZIP and retry.'));
  }, []);

  const attachVideo = async (video: HTMLVideoElement | null, stream: MediaStream | null) => {
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    if (stream) await video.play().catch(() => undefined);
  };

  useEffect(() => {
    if (sessionState !== 'ACTIVE' && sessionState !== 'WAITING') return;
    void attachVideo(trackingVideoRef.current, localStreamRef.current);
    void attachVideo(
      wristTrackingVideoRef.current,
      role === 'RECEIVER' ? localStreamRef.current : remoteStreamRef.current,
    );
    // Streams never swap elements: remote is always left/main and local is
    // always right/PiP. CSS changes their geometry, preventing srcObject flicker.
    void attachVideo(mainVideoRef.current, remoteStreamRef.current);
    void attachVideo(pipVideoRef.current, localStreamRef.current);
  }, [sessionState, remoteReady, role]);

  const releaseAll = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    managerRef.current.stop();
    peerRef.current?.destroy();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    [mainVideoRef.current, pipVideoRef.current, trackingVideoRef.current, wristTrackingVideoRef.current].forEach((video) => { if (video) video.srcObject = null; });
    faceRetentionRef.current.reset();
    wristRetentionRef.current.reset();
    compositeStreamRef.current?.getVideoTracks().forEach((track) => track.stop());
    compositeStreamRef.current = null;
    compositeSendingRef.current = false;
    compositeReplacePendingRef.current = false;
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
    setGiverHandsActive(false);
    remoteFaceRef.current = null;
    retainedTilakFaceRef.current = null;
    remoteWristRef.current = null;
    remoteHandsRef.current = [];
    vtoStartRef.current = false;
    setWristTrackerReady(false);
    aartiStartRef.current = null;
    tilakStartRef.current = null;
    faceStableSinceRef.current = null;
    handFadeStartRef.current = null;
    if (blessingTimerRef.current !== null) window.clearTimeout(blessingTimerRef.current);
    blessingTimerRef.current = null;
    setBlessingTarget(null);
  };

  const showBlessing = (target: CeremonyRole) => {
    if (blessingTimerRef.current !== null) window.clearTimeout(blessingTimerRef.current);
    setBlessingTarget(target);
    setBlessingBurst(Date.now());
    blessingTimerRef.current = window.setTimeout(() => {
      setBlessingTarget(null);
      blessingTimerRef.current = null;
    }, 5800);
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
      if (hostRef.current) setNotice('Waiting for your sibling to confirm their role…');
      else { send({ type: 'ROLE_SELECTED', role: roleRef.current }); setNotice('Confirming your role…'); }
    } else if (state === 'DISCONNECTED' && sessionState === 'ACTIVE') {
      setNotice('Participant disconnected. Your camera remains local; end the call or return to the lobby to reconnect.');
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
    remoteHandsRef.current = [];
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
          setNotice('Your sibling needs to choose the other role.');
          break;
        }
        const startAt = Date.now() + 1000;
        sessionStartAtRef.current = startAt;
        send({ type: 'SESSION_INIT', role: message.role, startAt, duration: totalDuration, version: PROTOCOL_VERSION });
        setSessionState('ACTIVE');
        setNotice('Call ready. Begin with Aarti when you are ready.');
        break;
      }
      case 'ROLE_CONFLICT':
        setRoleConflict(true); setPendingHosting(false); setRoleModal(true);
        setNotice(`Please choose ${message.requiredRole === 'GIVER' ? 'Female' : 'Male'} so the call has one giver and one receiver.`);
        break;
      case 'SESSION_INIT':
        if (message.version !== PROTOCOL_VERSION) return setError('The two participants are using incompatible app versions. Refresh both from the same deployment.');
        setRole(message.role);
        sessionStartAtRef.current = message.startAt;
        sessionDurationRef.current = message.duration;
        setRemaining(message.duration);
        setSessionState('ACTIVE');
        setNotice(`Call ready. Talk normally or wait for the giver to begin.`);
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
      case 'RAKHI_STATE':
        setRakhiState(message.state); setRakhiInstruction(message.instruction); setRakhiProgress(message.progress);
        if (message.state === 'WAIT_FOR_RECEIVER_WRIST' || message.state === 'WAIT_FOR_GIVER_HANDS') remoteHandsRef.current = [];
        if (roleRef.current === 'GIVER') setNotice(message.instruction);
        break;
      case 'RAKHI_ATTACHED':
        setRakhiAttached(true); setRakhiState('RAKHI_ATTACHED'); setRakhiProgress(1); setActiveRitual(null);
        handFadeStartRef.current = performance.now();
        setRakhiInstruction('Rakhi attached.');
        setNotice('Rakhi attached.');
        break;
      case 'BLESSING': showBlessing(message.target); setNotice('A blessing arrived.'); break;
      case 'MEDIA_STATE': break;
      case 'TIMER_SYNC': setRemaining((current) => Math.abs(current - message.remaining) > 1 ? message.remaining : current); break;
      case 'CALL_END': finishFromRemote(message.reason === 'TIMER' ? 'The 20-minute call ended.' : 'The other participant ended the call.'); break;
      case 'PING': send({ type: 'PONG', timestamp: message.timestamp }); break;
      default: break;
    }
  };

  useEffect(() => {
    if (sessionState !== 'ACTIVE') return;
    let cancelled = false;
    managerRef.current.setFeatures(computedFeatures).then(() => {
      if (cancelled) return;
      if (roleRef.current === 'GIVER') return managerRef.current.preloadHands();
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
      const wristTrackingVideo = wristTrackingVideoRef.current;
      const mainVideo = mainVideoRef.current;
      const canvas = canvasRef.current;
      if (!trackingVideo || !wristTrackingVideo || !mainVideo || !canvas) { rafRef.current = requestAnimationFrame(loop); return; }
      fitCanvasToVideo(canvas, roleRef.current === 'RECEIVER' ? trackingVideo : mainVideo);
      const now = performance.now();
      const local = await managerRef.current.process(trackingVideo, now);
      const giverHands = roleRef.current === 'GIVER' ? mirrorHandsForCanvas(local.hands) : [];
      if (roleRef.current === 'RECEIVER' && local.faceAnchor) retainedTilakFaceRef.current = local.faceAnchor;

      const vto = rakhi3dRef.current;
      if (roleRef.current === 'RECEIVER' && tilakFlowRef.current !== 'IDLE' && vto && !vtoStartRef.current && wristTrackingVideo.readyState >= 2) {
        vtoStartRef.current = true;
        void vto.start(wristTrackingVideo).then(() => setWristTrackerReady(true)).catch((cause) => {
          console.error(cause);
          vtoStartRef.current = false;
          setError('Right-wrist tracking could not start. Keep the camera on and refresh the call.');
        });
      }
      const landmarkWrist = roleRef.current === 'RECEIVER' ? local.wristAnchor : remoteWristRef.current;
      // Only the receiver smooths/retains the local landmark. Applying another
      // retention pass after transmission made the sister's attachment test lag.
      const positionHeld = roleRef.current === 'RECEIVER'
        ? wristRetentionRef.current.update(landmarkWrist, now)
        : { value: landmarkWrist, alpha: landmarkWrist ? 1 : 0, state: landmarkWrist ? 'LIVE' as const : 'HIDDEN' as const };
      if (roleRef.current === 'RECEIVER') vto?.setPositionAnchor(positionHeld.value);
      const vtoWrist = vto?.getAnchor() ?? null;
      const localWrist = roleRef.current === 'RECEIVER'
        ? fuseWristAnchors(positionHeld.value, vtoWrist)
        : positionHeld.value;
      const trackedWrist = localWrist;
      const wristHeld = { ...positionHeld, value: trackedWrist };
      const handAlpha = handFadeStartRef.current === null
        ? 1
        : Math.max(0, 1 - (now - handFadeStartRef.current) / 520);
      if (handFadeStartRef.current !== null && handAlpha <= 0) {
        handFadeStartRef.current = null;
        remoteHandsRef.current = [];
        if (giverHandsActive) setGiverHandsActive(false);
      }

      const pipCanvas = pipCanvasRef.current;
      const pipVideo = pipVideoRef.current;
      if (pipCanvas && pipVideo) {
        fitCanvasToVideo(pipCanvas, pipVideo);
        const pipContext = pipCanvas.getContext('2d');
        pipContext?.clearRect(0, 0, pipCanvas.width, pipCanvas.height);
        if (pipContext && roleRef.current === 'GIVER' && giverHandsActive) {
          local.hands.forEach((hand) => drawHandShadow(pipContext, hand.landmarks, { mirror: true, alpha: .58 * handAlpha }));
        }
      }

      if (now - lastAnchorSendRef.current >= 65) {
        lastAnchorSendRef.current = now;
        if (roleRef.current === 'RECEIVER') {
          if (faceActivated) send({ type: 'FACE_ANCHOR', payload: local.faceAnchor });
          if (activeRitualRef.current === 'RAKHI') send({ type: 'WRIST_ANCHOR', payload: localWrist });
        } else if (giverHandsActive) {
          send({ type: 'GIVER_HANDS', payload: compactHands(giverHands) });
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

      if (activeRitualRef.current === 'AARTI' && aartiStartRef.current !== null && now - aartiStartRef.current >= AARTI_DURATION_MS) {
        aartiStartRef.current = null;
        setAartiComplete(true);
        setActiveRitual(null);
        if (roleRef.current === 'GIVER') send({ type: 'AARTI_COMPLETE', timestamp: Date.now() });
      }

      if (activeRitualRef.current === 'TILAK' && tilakFlowRef.current === 'ANIMATING' && tilakStartRef.current !== null && now - tilakStartRef.current >= TILAK_DURATION_MS) {
        if (roleRef.current === 'RECEIVER') send({ type: 'TILAK_APPLIED', timestamp: Date.now() });
        setTilakApplied(true);
        setTilakFlow('DONE');
        setActiveRitual(null);
      }

      if (roleRef.current === 'GIVER' && activeRitualRef.current === 'RAKHI') {
        const update = machineRef.current.update(now, trackedWrist, giverHands, true);
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
          handFadeStartRef.current = now;
          setActiveRitual(null);
          send({ type: 'RAKHI_ATTACHED', timestamp: Date.now() });
        }
      }

      const composed: Phase1Frame = roleRef.current === 'GIVER'
        ? { ...local, faceAnchor: remoteFaceRef.current, wristAnchor: trackedWrist, normalizedHands: giverHands, faceLandmarks: [], poseLandmarks: [] }
        : {
          ...local,
          faceAnchor: local.faceAnchor ?? (tilakAppliedRef.current ? retainedTilakFaceRef.current : null),
          wristAnchor: trackedWrist,
          normalizedHands: remoteHandsRef.current,
          hands: [],
        };
      const faceHeld = faceRetentionRef.current.update(composed.faceAnchor, now);
      const aartiProgress = activeRitualRef.current === 'AARTI' && aartiStartRef.current !== null
        ? Math.min(1, (now - aartiStartRef.current) / AARTI_DURATION_MS)
        : null;
      const tilakProgress = activeRitualRef.current === 'TILAK' && tilakStartRef.current !== null
        ? Math.min(1, (now - tilakStartRef.current) / TILAK_DURATION_MS)
        : null;
      const renderOptions = {
        tilakApplied: tilakAppliedRef.current,
        rakhiAttached: rakhiAttachedRef.current,
        aartiProgress,
        tilakProgress,
        frozenWrist: null,
        rakhiState: rakhiStateRef.current,
        handAlpha: handFadeStartRef.current === null ? undefined : handAlpha,
      };

      if (roleRef.current === 'RECEIVER') {
        rendererRef.current.draw(canvas, composed, faceHeld, wristHeld, {
          ...renderOptions,
          mirrored: true,
          handMirrored: true,
        });
        rakhi3dRef.current?.draw(composed.normalizedHands, rakhiStateRef.current, true);

        const broadcastOverlay = broadcastOverlayCanvasRef.current;
        const broadcastCanvas = broadcastCanvasRef.current;
        const rakhiCanvas = rakhi3dCanvasRef.current;
        if (broadcastOverlay && broadcastCanvas && rakhiCanvas && trackingVideo.readyState >= 2) {
          fitCanvasToVideo(broadcastOverlay, trackingVideo);
          broadcastRendererRef.current.draw(broadcastOverlay, composed, faceHeld, wristHeld, {
            ...renderOptions,
            mirrored: false,
            handMirrored: false,
          });
          fitCanvasToVideo(broadcastCanvas, trackingVideo);
          const output = broadcastCanvas.getContext('2d');
          if (output) {
            output.clearRect(0, 0, broadcastCanvas.width, broadcastCanvas.height);
            output.drawImage(trackingVideo, 0, 0, broadcastCanvas.width, broadcastCanvas.height);
            output.drawImage(broadcastOverlay, 0, 0, broadcastCanvas.width, broadcastCanvas.height);
            output.drawImage(rakhiCanvas, 0, 0, broadcastCanvas.width, broadcastCanvas.height);
          }

          if (!compositeStreamRef.current && typeof broadcastCanvas.captureStream === 'function') {
            const captured = broadcastCanvas.captureStream(30);
            const videoTrack = captured.getVideoTracks()[0];
            if (videoTrack) {
              compositeStreamRef.current = new MediaStream([
                videoTrack,
                ...(localStreamRef.current?.getAudioTracks() ?? []),
              ]);
            }
          }
          if (compositeStreamRef.current && !compositeSendingRef.current && !compositeReplacePendingRef.current && now - lastCompositeAttemptRef.current >= 500) {
            lastCompositeAttemptRef.current = now;
            compositeReplacePendingRef.current = true;
            void peerRef.current?.replaceStream(compositeStreamRef.current).then((replaced) => {
              compositeSendingRef.current = replaced;
            }).catch((cause) => {
              console.error(cause);
              setError('The composed ceremony video could not be sent. End and recreate the room.');
            }).finally(() => {
              compositeReplacePendingRef.current = false;
            });
          }
        }
      } else {
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      }
      if (now - lastUiRef.current >= 120) {
        lastUiRef.current = now;
        setFrame({ ...composed, stats: { ...composed.stats } });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    void loop();
    return () => { cancelled = true; if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); rafRef.current = null; };
  }, [sessionState, faceActivated, giverHandsActive]);

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
        finishFromRemote('Time expired. The call ended and camera, microphone, tracking, and animation resources were released.');
      }
    }, 500);
    return () => clearInterval(tick);
  }, [sessionState]);

  const startAarti = () => { beginRemoteAarti(); send({ type: 'AARTI_START', timestamp: Date.now() }); };
  const startTilak = () => { beginRemoteTilak(); send({ type: 'TILAK_START', timestamp: Date.now() }); };
  const startRakhi = () => { beginRemoteRakhi(); send({ type: 'RAKHI_START', timestamp: Date.now() }); };
  const giveBlessing = () => {
    const target = oppositeRole(roleRef.current);
    showBlessing(target);
    send({ type: 'BLESSING', timestamp: Date.now(), target });
    setNotice('Blessing sent.');
  };
  const endSession = () => { send({ type: 'CALL_END', timestamp: Date.now(), reason: 'MANUAL' }); finishFromRemote('Call ended. Camera, microphone, tracking, and animation resources were released.'); };
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
          <div className="eyebrow">A PRIVATE RAKSHA BANDHAN CALL</div>
          <h2>Celebrate together, wherever you are</h2>
          <p>Create a room and say the code to your sibling, or enter the code they shared with you. The call is peer-to-peer and no camera frames are stored.</p>
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
          <small>Works on current desktop browsers and iPad Safari · Two people · Up to 20 minutes</small>
        </div>
        {roleModal && <div className="role-modal" role="dialog" aria-modal="true" aria-labelledby="role-title"><div className="role-dialog">
          <button className="modal-close" aria-label="Close" onClick={() => setRoleModal(false)}>×</button>
          <div className="eyebrow">PERSONALISE YOUR CALL</div><h2 id="role-title">Who are you?</h2>
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
    return <section className="ended-card"><div className="eyebrow">CALL ENDED</div><h2>Call closed</h2><p>{notice}</p><button onClick={returnToLobby}>Return to room lobby</button></section>;
  }

  if (sessionState === 'WAITING') {
    return (
      <section className="ceremony-lobby"><div className="lobby-copy waiting-room">
        <div className="eyebrow">{isHost ? 'ROOM READY' : 'JOINING ROOM'}</div><h2>{roomCode}</h2><p>{notice}</p>
        <div className="connection-pulse"><i /><strong>{connectionState.replaceAll('_', ' ')}</strong></div>
        {isHost && <button onClick={() => void navigator.clipboard.writeText(roomCode).then(() => setNotice('Meeting code copied.'))}><Copy01 size={18} aria-hidden="true" /> Copy meeting code</button>}
        {microphoneWarning && <div className="warning-banner"><strong>Video-only mode</strong>{microphoneWarning}<br />Enable microphone permission and restart this room to add audio.</div>}
        {error && <div className="error-banner">{error}</div>}
        <button className="secondary" onClick={returnToLobby}>Cancel</button>
      </div>
      {roleModal && <div className="role-modal" role="dialog" aria-modal="true" aria-labelledby="role-retry-title"><div className="role-dialog">
        <div className="eyebrow">ONE QUICK CHANGE</div><h2 id="role-retry-title">Choose the other role</h2><p>Your sibling selected the same role. This call needs one sister and one brother.</p>
        <div className="role-options"><button onClick={() => { setRole('GIVER'); setRoleModal(false); setRoleConflict(false); send({ type: 'ROLE_SELECTED', role: 'GIVER' }); }}><strong>Female</strong><span>I will tie the Rakhi</span></button><button onClick={() => { setRole('RECEIVER'); setRoleModal(false); setRoleConflict(false); send({ type: 'ROLE_SELECTED', role: 'RECEIVER' }); }}><strong>Male</strong><span>I will receive the Rakhi</span></button></div>
      </div></div>}
      </section>
    );
  }

  const guideStatus = activeRitual === 'RAKHI'
    ? frame.wristAnchor
      ? 'Right wrist ready'
      : role === 'GIVER'
        ? 'Waiting for his right wrist'
        : !wristTrackerReady ? 'Preparing wrist tracking…' : 'Show your right wrist'
    : '';
  const receiverOverlayVisible = role === 'RECEIVER' && (splitView || localIsMain);

  return (
    <section className="ceremony-session">
      <video ref={trackingVideoRef} className="tracking-video" playsInline muted />
      <video ref={wristTrackingVideoRef} className="tracking-video" playsInline muted />
      <canvas ref={broadcastOverlayCanvasRef} className="tracking-video" aria-hidden="true" />
      <canvas ref={broadcastCanvasRef} className="tracking-video" aria-hidden="true" />
      <div className="session-bar">
        <div><div className="room-code-chip"><span>Meeting code</span><strong>{roomCode}</strong><button className="icon-button compact" aria-label="Copy meeting code" title="Copy meeting code" onClick={() => void navigator.clipboard.writeText(roomCode)}><Copy01 size={17} aria-hidden="true" /></button></div><small className="role-label">{role === 'GIVER' ? 'Sister · tying Rakhi' : 'Brother · receiving Rakhi'}</small></div>
        <div className="session-actions"><Timer remaining={remaining} /><button className="icon-button hang-up" aria-label="End call" title="End call" onClick={endSession}><PhoneCall02 size={21} aria-hidden="true" /></button></div>
      </div>
      {microphoneWarning && <div className="warning-banner compact-warning"><strong>Video-only:</strong> {microphoneWarning}</div>}
      {error && <div className="error-banner">{error}</div>}
      <div className={`ceremony-grid ${splitView ? 'split-view' : ''}`}>
          <div className={`ceremony-stage-card ${activeRitual === 'RAKHI' ? 'rakhi-priority' : ''}`}>
          <div className="stage-heading"><span>{splitView ? 'YOUR SIBLING · LEFT  |  YOU · RIGHT' : localIsMain ? 'YOUR CAMERA · MIRRORED' : 'YOUR SIBLING · LIVE'}</span></div>
          <div className={`video-stage ceremony-video-stage remote-main ${!splitView ? localIsMain ? 'local-focus' : 'remote-focus' : ''}`}>
            <video ref={mainVideoRef} playsInline />
            <canvas ref={canvasRef} className={`overlay-canvas ${splitView ? 'split-overlay-right' : ''} ${receiverOverlayVisible ? '' : 'overlay-hidden'}`} />
            <canvas ref={rakhi3dCanvasRef} className={`rakhi-3d-canvas ${splitView ? 'split-overlay-right' : ''} ${receiverOverlayVisible ? '' : 'overlay-hidden'}`} aria-hidden="true" />
            <BlessingBurst burstId={blessingBurst} split={splitView} splitSide={role === blessingTarget ? 'right' : 'left'} />
            {!remoteReady && role === 'GIVER' && <div className="camera-placeholder"><strong>Waiting for receiver video…</strong><span>The data channel may connect a moment before media.</span></div>}
            <div className="self-pip"><video ref={pipVideoRef} playsInline muted /><canvas ref={pipCanvasRef} className="pip-hand-canvas" aria-hidden="true" /><span>YOU</span></div>
            <div className="video-controls" aria-label="Call controls">
              <button className={`icon-button ${audioEnabled ? '' : 'off'}`} aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'} title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'} aria-pressed={!audioEnabled} onClick={() => toggleMedia('audio')}>{audioEnabled ? <Microphone01 size={21} aria-hidden="true" /> : <MicrophoneOff01 size={21} aria-hidden="true" />}</button>
              <button className={`icon-button ${videoEnabled ? '' : 'off'}`} aria-label={videoEnabled ? 'Turn camera off' : 'Turn camera on'} title={videoEnabled ? 'Turn camera off' : 'Turn camera on'} aria-pressed={!videoEnabled} onClick={() => toggleMedia('video')}>{videoEnabled ? <Camera01 size={21} aria-hidden="true" /> : <CameraOff size={21} aria-hidden="true" />}</button>
              <button className="icon-button" aria-label={splitView ? 'Use focus view' : 'Use split view'} title={splitView ? 'Use focus view' : 'Use split view'} onClick={() => setSplitView((value) => !value)}>{splitView ? <Maximize01 size={21} aria-hidden="true" /> : <Columns02 size={21} aria-hidden="true" />}</button>
            </div>
          </div>
          <CeremonyControls role={role} activeRitual={activeRitual} tilakApplied={tilakApplied} rakhiAttached={rakhiAttached} aartiComplete={aartiComplete} disabled={connectionState !== 'CONNECTED'} onAarti={startAarti} onTilak={startTilak} onRakhi={startRakhi} onBlessing={giveBlessing} />
        </div>
        <aside className="ceremony-side">
          <div className="call-notice" role="status" key={notice}>{notice}</div>
          {activeRitual === 'RAKHI' && role === 'RECEIVER' && <WristPoseGuide />}
          <CeremonyGuide key={`${activeRitual}-${rakhiState}-${tilakFlow}`} activeRitual={activeRitual} rakhiState={rakhiState} instruction={activeRitual === 'AARTI' ? 'Aarti is moving in three gentle clockwise circles.' : activeRitual === 'TILAK' ? tilakFlow === 'WAIT_FACE' ? 'Look toward the camera and hold still for a moment.' : 'The Tilak is being applied.' : rakhiInstruction} progress={rakhiProgress} status={guideStatus} nextStep={!aartiComplete ? role === 'GIVER' ? 'Begin with Aarti.' : 'Your sister will begin with Aarti.' : !tilakApplied ? role === 'GIVER' ? 'Apply the Tilak.' : 'Look toward the camera for the Tilak.' : !rakhiAttached ? role === 'GIVER' ? 'Choose Rakhi and bring both hands into view.' : 'Raise your right fist with the knuckle side toward the camera.' : 'If you are the elder sibling, offer a blessing.'} />
          <div className="ceremony-rules"><div className="guide-kicker">CALL NOTES</div><ul><li>The Rakhi attaches only to the brother’s right wrist.</li><li>Keep the wrist visible after tying so the Rakhi can follow it.</li><li>The call ends after 20 minutes. No camera frames are stored.</li></ul></div>
        </aside>
      </div>
    </section>
  );
}
