import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'

const MODEL = 'Xenova/all-MiniLM-L6-v2'

// Singleton: load the ONNX model once and reuse across requests.
// In development, attach to global to survive Next.js hot reloads.
declare global {
  // eslint-disable-next-line no-var
  var __embeddingPipeline: FeatureExtractionPipeline | undefined
}

async function loadPipeline(): Promise<FeatureExtractionPipeline> {
  // Cast through unknown to avoid the "union type too complex" TS error
  return (await pipeline('feature-extraction', MODEL)) as unknown as FeatureExtractionPipeline
}

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (process.env.NODE_ENV !== 'production') {
    if (!global.__embeddingPipeline) {
      global.__embeddingPipeline = await loadPipeline()
    }
    return global.__embeddingPipeline
  }

  // Production: module-level singleton (one instance per serverless function lifetime)
  if (!prodInstance) {
    prodInstance = await loadPipeline()
  }
  return prodInstance
}

let prodInstance: FeatureExtractionPipeline | undefined

/** Generate a normalized 384-dim embedding for a single text string. */
export async function generateEmbedding(text: string): Promise<number[]> {
  const extractor = await getPipeline()
  const output = await extractor(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data as Float32Array)
}

/** Generate embeddings for multiple texts in one batch call. */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const extractor = await getPipeline()
  const output = await extractor(texts, { pooling: 'mean', normalize: true })
  // For batch input, tolist() returns number[][]
  return (output as unknown as { tolist(): number[][] }).tolist()
}

/** Chunk an array into sub-arrays of size n. */
export function chunk<T>(arr: T[], n: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += n) {
    chunks.push(arr.slice(i, i + n))
  }
  return chunks
}
