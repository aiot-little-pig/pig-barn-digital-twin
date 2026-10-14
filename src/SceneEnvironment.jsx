import React from 'react';
import { SCENE_STYLE as V } from './sceneStyle.js';

export default function SceneEnvironment() {
  return <>
    <color attach="background" args={[V.background]}/>
    <ambientLight intensity={V.ambient}/>
    <hemisphereLight args={['#bddef1','#253341',V.hemisphere]}/>
    <directionalLight position={[8,16,10]} color="#e4f2ff" intensity={V.keyLight}/>
    <directionalLight position={[-10,8,-12]} color="#73bad6" intensity={V.rimLight}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-1.55,0]}>
      <planeGeometry args={[36,36]}/><meshStandardMaterial color="#0a1928" roughness={0.95}/>
    </mesh>
    <gridHelper args={[36,36,V.gridMajor,V.gridMinor]} position={[0,-1.5,0]}/>
  </>;
}
