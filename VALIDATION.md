# Validation Record

Validated on 2026-08-28.

## Automated checks

- TypeScript strict typecheck: pass
- Vitest: 11 files, 36 tests: pass
- Vite production build: pass
- Runtime integrity check: pass; SHA-256 verified 18 active assets, models, WASM and WebAR files
- Vite 8 production bundle: pass
- Full dependency audit: 0 known vulnerabilities
- Retired GLB/image assets and the retired 2D renderer were removed; the live Rakhi is procedural Three.js only

The unit coverage includes smoothing, landmark retention, aspect-correct hand geometry, conservative wrist scale, right-hand association, tying-state stability, room-code safety, role/state message authorization, strict two-person Peer-ID admission, and required camera-plus-microphone acquisition.

## Hardware checks still required

Automated testing cannot measure the exact cameras, lighting, wrist anatomy, echo, WebRTC delay or networks used by two participants. Before a public event, make one full call on two physical devices and check both creator role choices, automatic joiner role, third-device refusal, every ritual unlock, right/left hand rejection, wrist front/back rotation, horizontal/vertical scale, split/focus parity, camera/microphone toggles, blessing flowers and timer cleanup. Capture both screens from the same run for frame-by-frame comparison.

The free STUN-only default works on many home networks but cannot guarantee a direct WebRTC route through every corporate or carrier NAT. Add TURN for production reliability if signaling succeeds but remote media repeatedly does not.
