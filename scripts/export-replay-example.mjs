import { mkdirSync, writeFileSync } from 'node:fs';
import { makeReplayExample } from '../src/replayData.js';
const directory = new URL('../examples/', import.meta.url);
mkdirSync(directory, { recursive: true });
writeFileSync(new URL('replay-example-SYNTHETIC.json', directory), JSON.stringify(makeReplayExample(), null, 2));
console.log('examples/replay-example-SYNTHETIC.json 생성');
