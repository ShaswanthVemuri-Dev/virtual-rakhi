import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { canRetainRightPose, medianWristScale, translatePoseMatrix, wristScaleSample } from '../src/ar/rakhi3dRenderer';

describe('hybrid Google + VTO wrist transform', () => {
  it('rejects foreshortened scale solves and freezes a bounded median', () => {
    expect(wristScaleSample(.006, .1, .95)).toBeNull();
    expect(wristScaleSample(.04, .1, .95)).toBeNull();
    expect(wristScaleSample(.1, .1, .4)).toBeNull();
    expect(wristScaleSample(.1, .108, .9)).toBeCloseTo(1.08, 5);
    expect(medianWristScale([1.03, 1.08, 7, 1.05, 1.04])).toBeCloseTo(1.05, 5);
    expect(medianWristScale([1, 1, 1, 1])).toBeNull();
  });

  it('cannot turn an edge-on wrist projection into an oversized Rakhi', () => {
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, .1, 1000);
    const wrist = new THREE.Object3D();
    wrist.position.z = -20;
    wrist.rotation.y = THREE.MathUtils.degToRad(89);
    wrist.updateMatrixWorld(true);
    const project = (x: number) => new THREE.Vector3(x, 0, 0).applyMatrix4(wrist.matrixWorld).project(camera);
    const left = project(-4.22);
    const right = project(4.22);
    const diameter = Math.hypot(right.x - left.x, right.y - left.y);
    expect(wristScaleSample(diameter, .1, .95)).toBeNull();
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
