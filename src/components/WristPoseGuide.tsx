import { publicUrl } from '../app/baseUrl';

export default function WristPoseGuide() {
  return (
    <div className="wrist-pose-guide" aria-label="Right wrist pose guidance">
      <strong>Show the back/knuckle side of your RIGHT hand to the camera</strong>
      <img className="wrist-pose-image" src={publicUrl('assets/wrist_pose_guide.png')} alt="Right fist shown vertically and horizontally with the knuckle side facing the camera" />
      <div className="pose-labels"><small>Vertical</small><span>OR</span><small>Horizontal · right to left</small></div>
      <em>Do not show the palm side. Keep the wrist uncovered.</em>
    </div>
  );
}
