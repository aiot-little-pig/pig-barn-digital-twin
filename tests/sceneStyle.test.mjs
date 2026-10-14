import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceVisualState } from '../src/sceneStyle.js';
import { simulateScenario,frameAt } from '../src/simulation.js';
test('missing, off and invalid device states never glow',()=>{
 for(const frame of [null,{}, {rpm:null,scrubberOn:null},{rpm:0,scrubberOn:false},{rpm:-2,scrubberOn:'true'},{rpm:NaN}])
  assert.deepEqual(deviceVisualState(frame),{fanActive:false,scrubberActive:false});
});
test('existing C1/C3/C4 outputs drive independent device highlights without mutation',()=>{
 const frames=['C1','C3','C4'].map(id=>frameAt(simulateScenario(id),30));
 const before=JSON.stringify(frames);
 assert.deepEqual(frames.map(deviceVisualState),[{fanActive:false,scrubberActive:false},{fanActive:true,scrubberActive:false},{fanActive:true,scrubberActive:true}]);
 assert.equal(JSON.stringify(frames),before);
 assert.equal(frames[1].current,frames[2].current);
});
