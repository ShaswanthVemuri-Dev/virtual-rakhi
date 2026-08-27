# Virtual Rakhi

A deployable two-person Raksha Bandhan ceremony built with React, WebRTC, MediaPipe and Three.js. It has one production flow: create or join a meeting, choose the sister/brother role, then complete Aarti, Tilak, Rakhi and Blessing in order.

## What is included

- Five-to-eight character meeting codes; no account, scheduling, database or invite-link flow.
- Peer-to-peer video/audio and synchronized ceremony state.
- Female/giver and male/receiver interfaces selected before camera access.
- Sequential controls: Aarti → Tilak → Rakhi → Blessing.
- A 30-minute synchronized call timer.
- Local-only MediaPipe tracking; frames are not uploaded or stored.
- Right-hand world landmarks fused with the forearm pose for wrist size, roll and orientation.
- A single purpose-built procedural 3D Rakhi with wrist-sized thread, flower pendant, roll-aware orientation, and depth-only wrist occlusion.
- Responsive focus/PIP and split views for desktop and current iPad Safari.
- Laila throughout, with a light cream/maroon two-tone interface and no gradients.

## Run locally

Use the current Node.js LTS release:

```bash
npm install
npm run setup
npm run dev
```

Open `http://127.0.0.1:5173`. Camera access works on localhost or HTTPS, not by opening `index.html` directly. Test a real call on two devices; one physical webcam usually cannot be opened by two browser windows at once.

## Deploy from GitHub to Vercel

1. Create an empty GitHub repository.
2. Upload this project’s contents to the repository root and commit them.
3. In Vercel, select **Add New → Project**, import that repository, and deploy.
4. Vercel uses the included `vercel.json`, runs the Vite build, and serves `dist` over HTTPS.
5. Open the Vercel URL on two devices. Create a meeting on one and join using only the displayed code on the other.

No environment variables are required for an MVP. A standalone Vercel project will normally be available at `your-project.vercel.app`; that is the cleanest free deployment. Link to it from the separate landing page.

If the landing site and app must share one domain path such as `example.com/app`, set this Vercel build variable:

```env
VITE_BASE_PATH=/app/
```

Then configure the landing deployment to rewrite `/app/*` to this deployment. A dedicated subdomain such as `app.example.com` is simpler and does not need `VITE_BASE_PATH`.

## Free MVP versus production reliability

The MVP can run without paid hosting:

- Vercel can host the static app on its free tier.
- PeerJS public signaling creates the connection.
- WebRTC normally carries encrypted media directly between the two devices.
- MediaPipe and 3D rendering run on-device, so there is no inference bill.

Some corporate, hotel or carrier networks block direct peer-to-peer media. For reliable public production, add a TURN relay; relayed video bandwidth can cost money. The app already accepts optional TURN settings:

```env
VITE_TURN_URL=turn:turn.example.com:3478
VITE_TURN_USERNAME=temporary-user
VITE_TURN_CREDENTIAL=temporary-credential
```

Use short-lived TURN credentials from a provider/backend, never permanent administrative credentials in Vite variables.

Optional self-hosted PeerServer settings are documented in `.env.example`.

## iPad support

Current iPad Safari supports the required WebRTC, WebAssembly and WebGL features. Use the Vercel HTTPS URL, allow camera/microphone, and keep the page in the foreground. Older iPads may reduce tracking frame rate or fall back to the procedural band if WebGL resources are unavailable. Landscape gives the best split-screen layout; portrait remains usable.

## Focused verification

```bash
npm run typecheck
npm test
npm run build
```

For a complete manual check, connect two physical devices and verify camera permission, role conflict handling, every ceremony unlock, wrist turn front/back, split view, blessing flowers, and timer cleanup.

## Privacy and limitations

- The room is temporary and accepts two participants.
- Webcam frames and landmarks are held only in memory during the call.
- There is intentionally no identity verification; share codes privately.
- Public PeerJS signaling and public STUN are appropriate for an MVP, not an uptime-guaranteed commercial service.
- Browser hand tracking estimates pose from a single camera; it is convincing AR, not millimetre-accurate depth scanning.
