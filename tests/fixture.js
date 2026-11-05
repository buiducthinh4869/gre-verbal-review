// Dữ liệu và tiện ích dùng chung cho các test phía client.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as srs from '../assets/srs.js';
import * as vocabMod from '../assets/vocab.js';
import * as dis from '../assets/distractors.js';
import * as render from '../assets/render.js';

const Srs = Object.assign({}, srs, vocabMod, dis, render);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/index.json'), 'utf8'));
export const vocab = {
  clusters: index.clusters.map((id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/clusters', id + '.json'), 'utf8'))),
};
export const idx = Srs.buildIndex(vocab, []);
export { Srs };

export function seq(seed) {
  let x = seed;
  return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
}
