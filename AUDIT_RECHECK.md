# Post-fix audit recheck

Rechecked on 2026-08-28 against the original audited revision `8cd6d65e3078649a9d03520a9ea9784640a1d380`.

## Code-proven findings closed

- A meeting now binds its first participant ID to both media and data and refuses all different peer IDs; media plus data must both be ready before connection.
- Only the creator selects Female/giver or Male/receiver. `SESSION_INIT` assigns the joiner the opposite role and the joiner has no role dialog.
- Protocol v7 validates bounded coordinates/scales, rate-limits messages, authorizes sender roles, enforces ritual order, rejects duplicate initialization, and requires blessing messages to target the receiving role.
- Rakhi cannot begin until the receiver confirms that the real 3D wrist tracker has started. Attachment advances only from the same fused Google/WebAR wrist pose used by the visible 3D renderer.
- A sole unassociated hand is no longer assumed to be the right hand.
- Hand, wrist, face, carried-Rakhi and projected-ring geometry is aspect-corrected.
- Wrist scale uses front-facing conservative samples, a five-sample median, a 0.8–1.2 correction bound, and locks before attachment.
- The 3D canvas stays in camera coordinates in focus and split view, so UI layout no longer changes the transmitted projection.
- The finishing state now reveals the torus around the tracked wrist over 650 ms instead of instantly switching on a closed ring.
- The giver's state machine uses longer wrist/alignment dwell times and pinch hysteresis.
- Camera-off disables the outgoing composite track and drawing; remote mute/camera state is visible.
- Required capability, camera, microphone, GPU model, WebAR, canvas capture and sender-replacement failures stop the single path with an explicit error. No application-level alternate renderer, CPU delegate, video-only call or simulated tracking mode remains.
- Tracking-loop exceptions are contained, model arrays/stat meters and unused pose points were removed, and 3D geometry/material cleanup is explicit.
- iPad portrait and short windows now scroll in a single-column layout. The role dialog moves/traps/restores focus and handles Escape.
- Active runtime files are SHA-256 verified. Retired GLB/images, duplicate downloader, local signaling server, dead renderer/helpers/states and unused code were removed.
- CSP/frame protections and CI were added. Vite/Vitest were upgraded and all dependency advisories were cleared.

## Automated evidence

- `npm run typecheck`: pass
- `npm test`: 11 files, 36 tests, pass
- `npm run check:runtime`: 18 hashes, pass
- `npm run build`: pass
- `npm audit --audit-level=high`: 0 vulnerabilities

## Physical validation still required

Static code cannot certify monocular-camera wrist circumference, camera latency, device thermals, network jitter, or Safari/Chromium capture behavior. The next test should record both participant screens from the same call and include:

1. Creator chooses Female, joiner receives Male automatically; repeat with creator Male.
2. A third device attempts the same code while the pair is connected and is refused.
3. Right wrist, left hand only, horizontal/vertical/diagonal right wrist, dorsal/palm/edge-on views, sleeve and existing watch/bangle.
4. Focus and split view while comparing the receiver's local Rakhi with the giver's received composite.
5. Camera/microphone toggles after the composed stream is active.
6. Full Aarti → Tilak → Rakhi → Blessing flow, including the 650 ms wrap reveal and timer/end cleanup.

The ring is now bounded and visually wrist-fitted, but a single RGB camera still cannot measure a physical wrist in millimetres or build a personalized sleeve/wrist mesh. Any remaining scale, occlusion or timing correction should be based on the paired recordings rather than another unmeasured heuristic.
