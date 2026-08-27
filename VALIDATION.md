# Validation Record

Validated on 2026-08-27.

## Automated checks

- TypeScript strict typecheck: pass
- Vitest: 7 files, 13 tests: pass
- Vite production build: pass
- Runtime integrity check: pass
- Three task models, four MediaPipe WASM/JS files and the 3D GLB are present
- Production dependency audit: 0 high-severity vulnerabilities

The unit coverage includes smoothing, landmark retention, hand retargeting, tying-state stability, room-code safety, RTC message filtering and the camera-survives-microphone-denial regression.

## Hardware checks still required

Automated testing cannot measure the exact cameras, lighting, wrist anatomy, echo or networks used by two participants. Before a public event, make one full call on two physical devices and check camera permission, both roles, every ritual unlock, wrist front/back rotation, split view, blessing flowers and timer cleanup.

The free STUN-only default works on many home networks but cannot guarantee a direct WebRTC route through every corporate or carrier NAT. Add TURN for production reliability if signaling succeeds but remote media repeatedly does not.
