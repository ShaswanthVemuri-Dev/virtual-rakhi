import { publicUrl } from './baseUrl';

export const REQUIRED_ASSETS = [
  'assets/tilak.png',
  'assets/wrist_pose_guide.png',
  'assets/flower_01.png',
  'assets/flower_02.png',
  'assets/flower_03.png',
] as const;

const loadImage = (src: string) => new Promise<void>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve();
  image.onerror = () => reject(new Error(`Unable to load ${src}`));
  image.src = publicUrl(src);
});

export const preloadCeremonyAssets = () => Promise.all(REQUIRED_ASSETS.map(loadImage)).then(() => undefined);
