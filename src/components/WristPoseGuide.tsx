export default function WristPoseGuide() {
  return (
    <div className="wrist-pose-guide" aria-label="Right wrist pose guidance">
      <strong>Show the back/knuckle side of your RIGHT hand to the camera</strong>
      <div className="pose-options">
        <div className="pose-option"><span className="pose-arm vertical"><i /></span><small>Fist or open hand<br />forearm straight up</small></div>
        <span className="pose-or">OR</span>
        <div className="pose-option"><span className="pose-arm horizontal"><i /></span><small>Punch toward your left<br />forearm right → left</small></div>
      </div>
      <em>Do not show the palm side. Keep the wrist uncovered.</em>
    </div>
  );
}
