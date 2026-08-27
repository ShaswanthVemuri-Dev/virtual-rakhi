import type { QualityLabel } from '../types/vision';
import { clamp } from './math';

export const confidenceToPercent = (confidence: number) => Math.round(clamp(confidence, 0, 1) * 100);

export const confidenceLabel = (confidence: number): QualityLabel => {
  const percent = confidenceToPercent(confidence);
  if (percent >= 90) return 'READY';
  if (percent >= 70) return 'GOOD - HOLD STEADY';
  if (percent >= 50) return 'ADJUST POSITION';
  return 'TRACKING LOST';
};
