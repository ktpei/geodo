import { pipeline } from '@huggingface/transformers';
import { extractWithLLM } from './llm-extractor';

// ── Embedding Model ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embeddingPipeline: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modelLoading: Promise<any> | null = null;

async function getEmbeddingPipeline() {
  if (embeddingPipeline) return embeddingPipeline;

  if (modelLoading) return modelLoading;

  modelLoading = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2' as any, {
    dtype: 'fp32' as any,
  });

  embeddingPipeline = await modelLoading;
  modelLoading = null;
  return embeddingPipeline;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

// ── Message Handler ──

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;

  handleMessage(message).then(sendResponse);
  return true;
});

async function handleMessage(message: { type: string; payload?: unknown }): Promise<unknown> {
  switch (message.type) {
    case 'GENERATE_EMBEDDING': {
      const { id, text } = message.payload as { id: string; text: string };
      try {
        const embedding = await generateEmbedding(text);
        return { id, embedding };
      } catch (err) {
        console.error('Embedding generation failed:', err);
        return { id, embedding: null, error: String(err) };
      }
    }

    case 'LLM_EXTRACT': {
      const payload = message.payload as {
        url: string;
        title: string;
        raw_text: string;
        api_key: string;
        provider: 'openai' | 'anthropic';
      };
      try {
        const entry = await extractWithLLM(payload);
        return { entry };
      } catch (err) {
        console.error('LLM extraction failed:', err);
        return { entry: null, error: String(err) };
      }
    }

    default:
      return { error: 'Unknown message type' };
  }
}

console.log('Geodo offscreen document loaded');
