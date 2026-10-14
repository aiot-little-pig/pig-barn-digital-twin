import { writeFileSync } from 'node:fs';
import { makeTwinExample } from '../src/twinData.js';
writeFileSync(new URL('../examples/twin-SYNTHETIC.json',import.meta.url),JSON.stringify(makeTwinExample(),null,2)+'\n');
