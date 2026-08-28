import type { CSSProperties } from 'react';
import { publicUrl } from '../app/baseUrl';

const flowers = ['assets/flower_01.png', 'assets/flower_02.png', 'assets/flower_03.png'].map(publicUrl);
const rand = (seed: number) => {
  const x = Math.sin(seed * 9283.113) * 43758.5453;
  return x - Math.floor(x);
};

export default function BlessingBurst({ burstId, split = false, splitSide = 'left' }: { burstId: number; split?: boolean; splitSide?: 'left' | 'right' }) {
  if (!burstId) return null;
  return (
    <div className={`blessing-layer ${split ? `split-blessing split-${splitSide}` : ''}`} key={burstId} aria-hidden="true">
      {Array.from({ length: 38 }, (_, index) => {
        const style = {
          '--x': `${3 + rand(burstId * 100 + index) * 94}%`,
          '--delay': `${rand(burstId * 200 + index) * 0.8}s`,
          '--duration': `${3.1 + rand(burstId * 300 + index) * 2.4}s`,
          '--sway': `${-60 + rand(burstId * 400 + index) * 120}px`,
          '--rotation': `${-240 + rand(burstId * 500 + index) * 480}deg`,
          '--size': `${22 + rand(burstId * 600 + index) * 30}px`,
        } as CSSProperties;
        return <img key={index} src={flowers[index % flowers.length]} alt="" style={style} />;
      })}
    </div>
  );
}
