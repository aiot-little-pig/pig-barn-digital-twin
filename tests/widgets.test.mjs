import test from 'node:test';
import assert from 'node:assert/strict';
import { gaugeView, intervalView } from '../src/widgetData.js';
test('zero is valid; missing/negative/unknown range never displays a measured zero',()=>{
 assert.equal(gaugeView(0,0,30).ratio,0);
 for(const v of [null,undefined,NaN,-1]) assert.equal(gaugeView(v,0,30).ratio,null);
 assert.equal(gaugeView(12,undefined,undefined).ratio,null);
});
test('gauge saturates display only, preserving above-range classification',()=>{
 assert.deepEqual(gaugeView(45,0,30),{ratio:1,outside:true});
 assert.deepEqual(gaugeView(15,0,30),{ratio:.5,outside:false});
});
test('interval preserves negative bounds, equal bounds and outlying point placement',()=>{
 assert.equal(intervalView(null,null,3),null);
 assert.equal(intervalView(5,2,3),null);
 const v=intervalView(-3,2,4);assert.ok(v.lower<v.upper&&v.upper<v.point&&v.point<200);
 const flat=intervalView(2,2,2);assert.equal(flat.lower,flat.upper);assert.equal(flat.point,flat.lower);
});
