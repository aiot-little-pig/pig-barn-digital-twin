import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Color, Object3D } from 'three';
import { BARN, HEATMAP } from './config.js';
import { cellCenter, validateGrid } from './heatmapData.js';

export function riskColor(value, gamma = HEATMAP.gamma) {
  if (value === null) return new Color(HEATMAP.missingColor);
  const t = Math.pow(Math.min(1, Math.max(0, value)), gamma);
  const [low, mid, high] = HEATMAP.colors;
  return t <= 0.5
    ? new Color(low).lerp(new Color(mid), t * 2)
    : new Color(mid).lerp(new Color(high), (t - 0.5) * 2);
}

export default function HeatmapFloor({ values, visible = true }) {
  const meshRef = useRef(null);
  const invalidate = useThree(state => state.invalidate);
  const { rows, columns } = useMemo(() => validateGrid(values), [values]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    mesh.visible = visible;
    const cell = new Object3D();
    cell.rotation.x = -Math.PI / 2; // XY 평면 → XZ 바닥
    cell.scale.set(BARN.width / columns * (1 - HEATMAP.gap),
      BARN.length / rows * (1 - HEATMAP.gap), 1);
    values.forEach((row, r) => row.forEach((value, c) => {
      const [x, z] = cellCenter(r, c, rows, columns);
      cell.position.set(x, HEATMAP.elevation, z);
      cell.updateMatrix();
      const index = r * columns + c;
      mesh.setMatrixAt(index, cell.matrix);
      mesh.setColorAt(index, riskColor(value));
    }));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate(); // demand 렌더링에 새 프레임 요청
  }, [values, rows, columns, visible, invalidate]);

  return (
    <instancedMesh key={`${rows}-${columns}`} ref={meshRef} args={[null, null, rows * columns]}>
      <planeGeometry args={[1, 1]} />
      {/* 조명·톤매핑에 색상이 달라지지 않아 범례와 일치합니다. */}
      <meshBasicMaterial toneMapped={false} transparent opacity={HEATMAP.opacity} depthWrite={false} />
    </instancedMesh>
  );
}
