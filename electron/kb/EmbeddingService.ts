import log from 'electron-log';

export interface EmbeddingConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class EmbeddingService {
  private cache = new Map<string, number[]>();

  async embed(texts: string[], config: EmbeddingConfig): Promise<number[][]> {
    const results: number[][] = [];
    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const model = config.model;
    const BATCH_SIZE = 20;
    const DELAY_MS = 200;

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);

      const uncached: { index: number; text: string }[] = [];
      const batchResults: (number[] | null)[] = new Array(batch.length).fill(null);

      for (let j = 0; j < batch.length; j++) {
        const text = batch[j];
        const cacheKey = `${model}:${text.substring(0, 200)}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
          batchResults[j] = cached;
        } else {
          uncached.push({ index: j, text });
        }
      }

      if (uncached.length > 0) {
        try {
          const response = await fetch(`${baseUrl}/embeddings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              model,
              input: uncached.map(u => u.text.substring(0, 8192)),
            }),
          });

          if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Embedding API error: ${response.status} ${errorBody}`);
          }

          const data = await response.json() as {
            data: Array<{ embedding: number[] }>;
          };

          if (!data.data || data.data.length !== uncached.length) {
            throw new Error(`Expected ${uncached.length} embeddings, got ${data.data?.length ?? 0}`);
          }

          for (let k = 0; k < uncached.length; k++) {
            const embedding = data.data[k]?.embedding;
            if (!embedding) {
              throw new Error('No embedding returned from API');
            }
            const cacheKey = `${model}:${uncached[k].text.substring(0, 200)}`;
            this.cache.set(cacheKey, embedding);
            batchResults[uncached[k].index] = embedding;
          }
        } catch (err) {
          log.error('[EmbeddingService] Batch embed failed, falling back to individual:', err);
          for (const u of uncached) {
            if (batchResults[u.index] !== null) continue;
            try {
              const response = await fetch(`${baseUrl}/embeddings`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${config.apiKey}`,
                },
                body: JSON.stringify({
                  model,
                  input: u.text.substring(0, 8192),
                }),
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const data = await response.json() as { data: Array<{ embedding: number[] }> };
              const embedding = data.data[0]?.embedding;
              if (!embedding) throw new Error('No embedding returned');
              const cacheKey = `${model}:${u.text.substring(0, 200)}`;
              this.cache.set(cacheKey, embedding);
              batchResults[u.index] = embedding;
            } catch (singleErr) {
              log.error(`[EmbeddingService] Failed to embed chunk ${u.index}:`, singleErr);
              throw singleErr;
            }
          }
        }
      }

      results.push(...(batchResults as number[][]));

      if (i + BATCH_SIZE < texts.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    return results;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
