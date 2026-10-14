import React from 'react';
import { AdditiveBlending } from 'three';
import { SCENE_STYLE as V } from './sceneStyle.js';

export function FanHighlight({active}) {
  if (!active) return null;
  return <group>
    <mesh position={[0,0,0.1]}><torusGeometry args={[0.48,0.025,8,48]}/><meshStandardMaterial color={V.fanColor} emissive={V.fanColor} emissiveIntensity={V.emissiveIntensity}/></mesh>
    {[0.055,0.1,0.17].map((width,i)=><mesh key={width} position={[0,0,0.08]}><torusGeometry args={[0.48,width,8,48]}/><meshBasicMaterial color={V.fanColor} transparent opacity={V.haloOpacity/(i+1)} blending={AdditiveBlending} depthWrite={false}/></mesh>)}
    <pointLight position={[0,0,0.6]} color={V.fanColor} intensity={2} distance={3} decay={2}/>
  </group>;
}

export function ScrubberHighlight({active}) {
  if (!active) return null;
  return <group>
    {[-1,1].map(side=><group key={side} position={[side*1.73,0,1.23]}>
      <mesh><boxGeometry args={[0.035,3.35,0.035]}/><meshStandardMaterial color={V.scrubberColor} emissive={V.scrubberColor} emissiveIntensity={V.emissiveIntensity}/></mesh>
      <mesh><boxGeometry args={[0.16,3.4,0.16]}/><meshBasicMaterial color={V.scrubberColor} transparent opacity={V.haloOpacity} blending={AdditiveBlending} depthWrite={false}/></mesh>
    </group>)}
    <mesh position={[0,-1.7,1.23]}><boxGeometry args={[3.48,0.035,0.035]}/><meshStandardMaterial color={V.scrubberColor} emissive={V.scrubberColor} emissiveIntensity={V.emissiveIntensity}/></mesh>
    <pointLight position={[0,0.4,1.5]} color={V.scrubberColor} intensity={3} distance={4} decay={2}/>
  </group>;
}
