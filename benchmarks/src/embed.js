// Embedding helpers for Tier 2.
//
// Everything runs locally on CPU through transformers.js so that a reader can
// reproduce the tier with no API key and no account. Models are listed with the
// parameter counts and query prefixes their authors specify; bge-family models
// are trained with an instruction prefix on the query side only, and omitting it
// would understate their retrieval quality, which would flatter our result.

import { pipeline } from '@huggingface/transformers';

export const MODELS = [
  {
    id: 'Xenova/all-MiniLM-L6-v2',
    label: 'all-MiniLM-L6-v2',
    params: '22M',
    note: 'the default in most off-the-shelf retrieval stacks',
    queryPrefix: '',
  },
  {
    id: 'Xenova/all-mpnet-base-v2',
    label: 'all-mpnet-base-v2',
    params: '110M',
    note: 'stronger general-purpose sentence encoder',
    queryPrefix: '',
  },
  {
    id: 'Xenova/bge-base-en-v1.5',
    label: 'bge-base-en-v1.5',
    params: '109M',
    note: 'retrieval-tuned, uses an instruction prefix on queries',
    queryPrefix: 'Represent this sentence for searching relevant passages: ',
  },
  {
    id: 'Xenova/gte-base',
    label: 'gte-base',
    params: '109M',
    note: 'retrieval-tuned general text embeddings',
    queryPrefix: '',
  },
];

// Batched so that a larger corpus cannot blow out memory on a 16 GB machine.
const BATCH = 32;

export async function loadExtractor(modelId) {
  return pipeline('feature-extraction', modelId);
}

export async function embed(extractor, texts) {
  const vectors = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH);
    const out = await extractor(chunk, { pooling: 'mean', normalize: true });
    vectors.push(...out.tolist());
  }
  return vectors;
}

// Vectors are L2-normalised by the pipeline, so the dot product is the cosine.
export function cosine(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export function describe(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, x) => s + x, 0) / n;
  const variance = sorted.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const quantile = (q) => {
    const pos = (n - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  };
  return {
    n,
    mean: round(mean),
    sd: round(Math.sqrt(variance)),
    min: round(sorted[0]),
    p25: round(quantile(0.25)),
    median: round(quantile(0.5)),
    p75: round(quantile(0.75)),
    max: round(sorted[n - 1]),
  };
}

export function round(x, places = 4) {
  return Number(x.toFixed(places));
}
