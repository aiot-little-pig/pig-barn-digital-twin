import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { BARN, STRUCTURE as S, DEVICE_POSITIONS as D } from './config.js';
import { deviceVisualState } from './sceneStyle.js';
import { FanHighlight, ScrubberHighlight } from './DeviceHighlight.jsx';

function Box({ position, size, color = '#bec7c4', opacity = 1, rotation }) {
  return <mesh position={position} rotation={rotation}>
    <boxGeometry args={size} />
    <meshStandardMaterial color={color} roughness={0.75} transparent={opacity < 1} opacity={opacity} depthWrite={opacity === 1} />
  </mesh>;
}
function Label({ position, children, portal }) {
  return <Html portal={portal} position={position} center style={{ pointerEvents: 'none' }}>
    <span className="scene-label">{children}</span>
  </Html>;
}
function Pipe({ start, end, radius = 0.035, color = '#718b99' }) {
  // 이 모형의 배관은 축과 평행한 구간들로 구성합니다.
  const delta = end.map((v, i) => v - start[i]);
  const length = Math.hypot(...delta);
  const rotation = Math.abs(delta[0]) > 0 ? [0, 0, Math.PI / 2]
    : Math.abs(delta[2]) > 0 ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return <mesh position={start.map((v, i) => (v + end[i]) / 2)} rotation={rotation}>
    <cylinderGeometry args={[radius, radius, length, 10]} />
    <meshStandardMaterial color={color} metalness={0.4} roughness={0.45} />
  </mesh>;
}
function Pig({ position, rotation = 0 }) {
  return <group position={position} rotation={[0, rotation, 0]}>
    <mesh position={[0, 0.49, 0]} scale={[0.36, 0.36, 0.66]}>
      <sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color="#e2b5aa" />
    </mesh>
    <mesh position={[0, 0.47, 0.64]} scale={[0.26, 0.25, 0.27]}>
      <sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color="#e8bdb1" />
    </mesh>
    <Box position={[0, 0.43, 0.89]} size={[0.25, 0.14, 0.1]} color="#c68d87" />
    {[-1, 1].map(side => <group key={side}>
      <Box position={[side * 0.22, 0.18, -0.36]} size={[0.12, 0.36, 0.13]} color="#c8978d" />
      <Box position={[side * 0.22, 0.18, 0.36]} size={[0.12, 0.36, 0.13]} color="#c8978d" />
      <mesh position={[side * 0.21, 0.72, 0.61]} rotation={[0, 0, -side * 0.4]}>
        <coneGeometry args={[0.13, 0.24, 3]} /><meshStandardMaterial color="#d39992" />
      </mesh>
    </group>)}
  </group>;
}
function Pen({ side, index, showPigs, showSensorFixtures = true }) {
  const { width: w, length: l, aisleWidth: a, pensPerSide: n, partitionHeight: ph } = BARN;
  const pw = (w - a) / 2, pl = l / n;
  const z = -l / 2 + (index + 0.5) * pl;
  const innerX = side * a / 2;
  const feederX = side * (a / 2 + 0.65);
  const drinkerX = side * (w / 2 - 0.3);
  // 통로측 패널과 독립 출입문. 문은 닫힌 상태의 금속 바로 표현합니다.
  const gateZ = z + pl / 2 - S.gateWidth / 2 - 0.2;
  const panelLength = pl - S.gateWidth - 0.2;
  return <group>
    <Box position={[innerX, ph / 2, z - (S.gateWidth + 0.2) / 2]} size={[0.06, ph, panelLength]} color="#cbd9dc" />
    <Box position={[innerX, ph / 2, z + pl / 2 - 0.1]} size={[0.06, ph, 0.2]} color="#cbd9dc" />
    {[0.15, 0.55, 0.95].map(y => <Box key={y} position={[innerX, y, gateZ]} size={[0.055, 0.055, S.gateWidth]} color="#74858e" />)}
    {[-0.5, 0, 0.5].map(k => <Box key={k} position={[innerX, ph / 2, gateZ + k * S.gateWidth]} size={[0.055, ph, 0.055]} color="#74858e" />)}
    <Box position={[innerX, 0.75, gateZ - S.gateWidth / 2]} size={[0.16, 0.06, 0.14]} color="#edac47" />
    {/* 자동 급이기: 호퍼, 급이 접시와 상부 이송/낙하관 */}
    <mesh position={[feederX, 0.94, z - 0.9]}>
      <cylinderGeometry args={[0.4, 0.25, 1.1, 14]} /><meshStandardMaterial color="#d9a24e" />
    </mesh>
    <mesh position={[feederX, 0.18, z - 0.9]}>
      <cylinderGeometry args={[0.55, 0.55, 0.22, 14]} /><meshStandardMaterial color="#73848e" />
    </mesh>
    <Pipe start={[feederX, 1.5, z - 0.9]} end={[feederX, 2.45, z - 0.9]} radius={0.065} color="#d0ae77" />
    {/* 외벽측 급수 배관과 볼형 급수기: 슬랫 위로 누수 배수 */}
    <Pipe start={[drinkerX, 0.6, z + 0.65]} end={[drinkerX, 2.2, z + 0.65]} color="#5685a4" />
    <mesh position={[side * (w / 2 - 0.48), 0.48, z + 0.65]} scale={[1, 0.5, 1]}>
      <sphereGeometry args={[0.24, 12, 8]} /><meshStandardMaterial color="#527590" />
    </mesh>
    {showPigs && Array.from({ length: S.pigsPerPen }, (_, i) => <Pig key={i}
      position={[side * (a / 2 + 1.6 + (i % 2) * 1.6), 0, z - 1 + Math.floor(i / 2) * 1.9]}
      rotation={side * (i % 2 ? 0.65 : -0.55)} />)}
    {/* 센서 위치는 검증되지 않은 설계 배치이며 측정값을 만들지 않습니다. */}
    {showSensorFixtures && <><Box position={[innerX, S.sensorHeight, z - 1.8]} size={[0.18, 0.24, 0.12]} color="#304f5a" />
    <Pipe start={[innerX, ph, z - 1.8]} end={[innerX, S.sensorHeight + 0.1, z - 1.8]} radius={0.025} /></>}
    <Pipe start={[side * (a / 2 + pw / 2), S.cameraHeight, z]} end={[side * (a / 2 + pw / 2), BARN.height, z]} radius={0.025} />
    <Box position={[side * (a / 2 + pw / 2), S.cameraHeight, z]} size={[0.32, 0.16, 0.26]} color="#e7eded" />
    <mesh position={[side * (a / 2 + pw / 2), S.cameraHeight - 0.12, z]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.07, 0.07, 0.1, 10]} /><meshStandardMaterial color="#243c49" />
    </mesh>
  </group>;
}
function FloorAndPit({ showEnvelope }) {
  const { width: w, length: l, aisleWidth: a } = BARN;
  const pw = (w - a) / 2, sw = pw * S.slattedRatio;
  const count = Math.ceil(l / S.slatPitch), pitch = l / count;
  return <group>
    <Box position={[0, -0.1, 0]} size={[a, 0.2, l]} color="#d9d7c9" />
    {[-1, 1].map(side => <group key={side}>
      <Box position={[side * (a / 2 + (pw - sw) / 2), -0.1, 0]} size={[pw - sw, 0.2, l]} color="#bdc4c0" />
      <Box position={[side * (w / 2 - sw / 2), -S.pitDepth, 0]} size={[sw, 0.18, l]} color="#657068" />
      <Box position={[side * (w / 2 - sw / 2), -S.pitDepth + 0.22, 0]} size={[sw - 0.1, 0.08, l - 0.1]} color="#655845" />
      {[-1, 1].map(edge => <Box key={edge} position={[side * (w / 2 - sw / 2) + edge * sw / 2, -S.pitDepth / 2, 0]} size={[0.12, S.pitDepth, l]} color="#929c98" />)}
      <Box position={[side * (w / 2 - sw / 2), -S.pitDepth / 2, -l / 2]} size={[sw, S.pitDepth, 0.12]} color="#929c98" />
      {/* 관찰자측 피트 벽을 반투명 처리한 단면 보기 */}
      <Box position={[side * (w / 2 - sw / 2), -S.pitDepth / 2, l / 2]} size={[sw, S.pitDepth, 0.12]} color="#929c98" opacity={showEnvelope ? 1 : 0.15} />
      {Array.from({ length: count }, (_, i) => <Box key={i}
        position={[side * (w / 2 - sw / 2), -0.09, -l / 2 + (i + 0.5) * pitch]}
        size={[sw, 0.18, pitch - S.slatGap]} color="#bbc1bc" />)}
      <Pipe start={[side * (w / 2 - sw / 2), -S.pitDepth + 0.12, -l / 2]}
        end={[side * (w / 2 - sw / 2), -S.pitDepth + 0.12, -l / 2 - 0.6]} radius={0.12} color="#596568" />
    </group>)}
  </group>;
}
function Envelope({ showEnvelope }) {
  const { width: w, length: l, height: h, aisleWidth: a, pensPerSide: n } = BARN;
  const bay = l / n, opening = 1.6, ih = 0.45, iy = S.inletHeight;
  return <group>
    {[-1, 1].map(side => <group key={side}>
      {Array.from({ length: n }, (_, i) => {
        const z = -l / 2 + (i + 0.5) * bay, opacity = showEnvelope ? 1 : 0.17;
        return <group key={i}>
          <Box position={[side * w / 2, (iy - ih / 2) / 2, z]} size={[0.16, iy - ih / 2, bay]} color="#e0e4dd" opacity={opacity} />
          <Box position={[side * w / 2, (h + iy + ih / 2) / 2, z]} size={[0.16, h - iy - ih / 2, bay]} color="#e0e4dd" opacity={opacity} />
          {[-1, 1].map(edge => <Box key={edge} position={[side * w / 2, iy, z + edge * (bay + opening) / 4]} size={[0.16, ih, (bay - opening) / 2]} color="#e0e4dd" opacity={opacity} />)}
          <Box position={[side * (w / 2 - 0.03), iy, z]} size={[0.18, ih, opening]} color="#355963" />
          <Box position={[side * (w / 2 - 0.18), iy - 0.12, z]} size={[0.4, 0.05, opening]} color="#65b7c4" rotation={[0, 0, side * 0.35]} />
          {/* 입기 경로를 나타내는 정적 화살표. 풍량이나 CFD 결과가 아닙니다. */}
          <mesh position={[side * (w / 2 - 0.85), iy, z]} rotation={[0, 0, side * Math.PI / 2]}>
            <coneGeometry args={[0.12, 0.4, 8]} /><meshBasicMaterial color="#348aa0" />
          </mesh>
        </group>;
      })}
      {/* 통로 끝 출입문은 닫힌 상태의 기밀 경계입니다. */}
      {[-1, 1].map(edge => <Box key={edge} position={[edge * (a / 2 + (w - a) / 4), h / 2, side * l / 2]} size={[(w - a) / 2, h, 0.16]} color="#d7dfd8" opacity={showEnvelope ? 1 : 0.13} />)}
      {side === 1 ? <>
        <Box position={[0, 1.1, l / 2]} size={[a, 2.2, 0.09]} color="#57737c" opacity={showEnvelope ? 1 : 0.18} />
        <Box position={[0, (h + 2.2) / 2, l / 2]} size={[a, h - 2.2, 0.16]} color="#d7dfd8" opacity={showEnvelope ? 1 : 0.13} />
      </> : <>
        <Box position={[0, (S.ductHeight - 0.25) / 2, -l / 2]} size={[a, S.ductHeight - 0.25, 0.16]} color="#d7dfd8" opacity={showEnvelope ? 1 : 0.13} />
        <Box position={[0, (h + S.ductHeight + 0.25) / 2, -l / 2]} size={[a, h - S.ductHeight - 0.25, 0.16]} color="#d7dfd8" opacity={showEnvelope ? 1 : 0.13} />
        {[-1, 1].map(edge => <Box key={edge} position={[edge * (a + 0.85) / 4, S.ductHeight, -l / 2]} size={[(a - 0.85) / 2, 0.5, 0.16]} color="#d7dfd8" opacity={showEnvelope ? 1 : 0.13} />)}
      </>}
      {[-1, 1].map(end => <Box key={end} position={[side * w / 2, h / 2, end * l / 2]} size={[0.14, h, 0.14]} color="#778c88" />)}
    </group>)}
    {/* 천장은 실내 기밀 경계이며 단면 보기에서는 숨깁니다. */}
    <Box position={[0, h + 0.05, 0]} size={[w, 0.1, l]} color="#dce2de" opacity={showEnvelope ? 1 : 0} />
    {showEnvelope && [-1, 1].map(side => <Box key={side}
      position={[side * w / 4, h + S.roofRise / 2 + 0.1, 0]}
      size={[Math.hypot(w / 2, S.roofRise), 0.1, l + 0.4]}
      rotation={[0, 0, -side * Math.atan2(S.roofRise, w / 2)]} color="#6b8083" />)}
  </group>;
}
function VentilationSystem({ frame, playing }) {
  const l = BARN.length, y = S.ductHeight;
  const visual = deviceVisualState(frame);
  const blades = useRef(null);
  useFrame((state, delta) => {
    if (playing && frame?.rpm > 0 && blades.current) {
      blades.current.rotation.z -= frame.rpm / 60 * Math.PI * 2 * Math.min(delta, 0.1) * 0.08;
      state.invalidate(); // 표시용 감속 회전. 모의 시간·농도 적분과 분리
    }
  });
  return <group>
    {/* 중앙 수집 덕트 → 팬 → 배기 세정기. 외부 확산장은 구현하지 않습니다. */}
    <Box position={[0, y, -0.25]} size={[0.85, 0.5, l + 0.5]} color="#94a7ac" opacity={0.4} />
    {Array.from({ length: BARN.pensPerSide }, (_, i) => <Box key={i}
      position={[0, y - 0.3, -l / 2 + (i + 0.5) * l / BARN.pensPerSide]} size={[0.65, 0.16, 0.55]} color="#405d66" />)}
    <group position={D.fan}>
      <FanHighlight active={visual.fanActive}/>
      <mesh><torusGeometry args={[0.4, 0.07, 10, 24]} /><meshStandardMaterial color="#35535d" /></mesh>
      <group ref={blades}>{[0, Math.PI / 2].map(angle => <group key={angle} rotation={[0, 0, angle]}><Box position={[0, 0, 0]} size={[0.65, 0.13, 0.1]} color="#526b76" /></group>)}</group>
    </group>
    {/* Porcus 단면 원리: 팬 → 압력 연결부 → 필터 아래 유입 → 수평층 상향 통과.
        치수는 개념 배치이며 제조사 제품의 실측 복제가 아닙니다. */}
    <Box position={[0, y, -l / 2 - 1.05]} size={[0.85, 0.5, 0.9]} color="#94a7ac" opacity={0.45} />
    <Box position={[0, (y + 0.9) / 2, -l / 2 - 1.25]} size={[0.85, y - 0.9, 0.5]} color="#94a7ac" opacity={0.35} />
    <Box position={[0, 0.9, -l / 2 - 1.55]} size={[0.85, 0.5, 0.6]} color="#94a7ac" opacity={0.4} />
    <group position={D.scrubber}>
      <ScrubberHighlight active={visual.scrubberActive}/>
      <Box position={[0, 0, 0]} size={[3.4, 3.6, 2.4]} color="#8eb7b5" opacity={0.22} />
      <Box position={[0, -1.3, 0]} size={[3.3, 0.45, 2.3]} color="#466f7a" />
      <Box position={[0, 0.15, 0]} size={[3.1, 0.75, 2.1]} color="#719885" opacity={0.7} />
      {/* 水平 충전층 위 분사 헤더, 상부 비말 제거층, 하부 순환수조 */}
      <Box position={[0, 1.52, 0]} size={[3.1, 0.14, 2.1]} color="#9fc0ca" opacity={0.8} />
      {[-0.8,0,0.8].map(x=><group key={x}>
        <Pipe start={[x,1.25,-0.85]} end={[x,1.25,0.85]} radius={0.035} color="#547f9d"/>
        <mesh position={[x,0.9,0]}><coneGeometry args={[0.12,0.3,8]}/><meshBasicMaterial color="#6acde0" transparent opacity={0.35}/></mesh>
      </group>)}
      <mesh position={[0, 1.9, 0]}><coneGeometry args={[0.2,0.45,8]}/><meshBasicMaterial color="#66f1b9"/></mesh>
      <Pipe start={[-1.3, 1.25, 0]} end={[1.3, 1.25, 0]} radius={0.06} color="#547f9d" />
      <Pipe start={[1.3, -1.3, 0]} end={[1.3, 1.25, 0]} radius={0.06} color="#547f9d" />
      <Box position={[1.25, -1.15, 0.5]} size={[0.35, 0.35, 0.5]} color={frame?.scrubberOn ? '#2dddac' : '#8a9295'} />
      <Box position={[1.9, -0.2, 0]} size={[0.45, 2.1, 1.7]} color="#4e717b" />
    </group>
  </group>;
}
export function Barn({ showLabels, labelPortal, showEnvelope = false, showPigs = true, frame, playing = false, showSensorFixtures = true }) {
  const { width: w, length: l, aisleWidth: a, pensPerSide: n, partitionHeight: ph } = BARN;
  const pw = (w - a) / 2;
  return <group>
    <FloorAndPit showEnvelope={showEnvelope} />
    <Envelope showEnvelope={showEnvelope} />
    {[-1, 1].map(side => <group key={side}>
      {Array.from({ length: n - 1 }, (_, i) => <Box key={i} position={[side * (a / 2 + pw / 2), ph / 2, -l / 2 + (i + 1) * l / n]} size={[pw, ph, 0.06]} color="#cbd9dc" />)}
      {Array.from({ length: n }, (_, i) => <Pen key={i} side={side} index={i} showPigs={showPigs} showSensorFixtures={showSensorFixtures} />)}
      <Pipe start={[side * (a / 2 + 0.65), 2.45, -l / 2]} end={[side * (a / 2 + 0.65), 2.45, l / 2]} radius={0.07} color="#c6a269" />
      <Pipe start={[side * (w / 2 - 0.3), 2.2, -l / 2]} end={[side * (w / 2 - 0.3), 2.2, l / 2]} color="#5685a4" />
    </group>)}
    <VentilationSystem frame={frame} playing={playing} />
    <Box position={[a / 2 + 0.2, 1.5, l / 2 - 0.4]} size={[0.4, 0.55, 0.15]} color="#344e5b" />
    {showLabels && <>
      <Label portal={labelPortal} position={[-w / 2, BARN.height + 0.5, -l / 2]}>육성·비육 사육실 · {w} × {l} m</Label>
      <Label portal={labelPortal} position={[0, S.ductHeight + 0.5, -l / 2 - 0.2]}>팬 · {frame?.pwm == null ? '미확인' : `${frame.pwm}%`} (모의)</Label>
      <Label portal={labelPortal} position={[0, 4.2, D.scrubber[2] - 0.8]}>배기 세정 · {frame?.scrubberOn == null ? '미확인' : frame.scrubberOn ? 'ON' : 'OFF'} (모의)</Label>
      <Label portal={labelPortal} position={[2.3, 2.2, D.scrubber[2]]}>하부 유입 → 수평 필터 → 상부 배출</Label>
      <Label portal={labelPortal} position={[-w / 2, S.inletHeight + 0.6, 0]}>조절식 측벽 입기구</Label>
      <Label portal={labelPortal} position={[w / 2 - 1, -0.7, l / 2 + 0.4]}>슬랫 하부 분뇨 피트</Label>
      <Label portal={labelPortal} position={[0, 0.4, l / 2 + 0.7]}>관리 통로 · 출입문</Label>
    </>}
  </group>;
}
