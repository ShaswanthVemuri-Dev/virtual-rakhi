import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { canRetainRightPose, fitHybridWristScale, translatePoseMatrix } from '../src/ar/rakhi3dRenderer';

describe('hybrid Google + VTO wrist transform', () => {
  it('fits Google screen width exactly and snaps out of oversized VTO solves', () => {
    expect(fitHybridWristScale(.05, .2, 1, false)).toBe(4);
    expect(fitHybridWristScale(.2, .05, 1, false)).toBe(.25);
    expect(fitHybridWristScale(.1, .12, 1, true)).toBeCloseTo(1.08, 5);
    expect(fitHybridWristScale(.8, .08, 1, true)).toBeCloseTo(.1, 5);
  });

  it('holds only a previously proven right-hand pose during a brief VTO miss', () => {
    expect(canRetainRightPose(true, .8, 600)).toBe(true);
    expect(canRetainRightPose(false, .8, 600)).toBe(false);
    expect(canRetainRightPose(true, .3, 600)).toBe(false);
    expect(canRetainRightPose(true, .8, 1_300)).toBe(false);
  });

  it('corrects translation without changing VTO rotation or scale', () => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(2, 3, 4),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(.4, -.7, 1.1)),
      new THREE.Vector3(1.2, .9, 1.1),
    );
    const before = matrix.elements.slice(0, 12);
    translatePoseMatrix(matrix, new THREE.Vector3(.25, -.5, .1));
    expect(matrix.elements.slice(0, 12)).toEqual(before);
    expect(matrix.elements[12]).toBeCloseTo(2.25);
    expect(matrix.elements[13]).toBeCloseTo(2.5);
    expect(matrix.elements[14]).toBeCloseTo(4.1);
  });
});
