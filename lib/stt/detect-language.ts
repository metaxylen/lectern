import { Tensor } from "@huggingface/transformers";

export const AUTO_LANGUAGES = ["en", "tr"];

type WhisperPipe = {
  processor: (audio: Float32Array) => Promise<{ input_features: unknown }>;
  model: ((inputs: Record<string, unknown>) => Promise<{ logits: { data: ArrayLike<number> } }>) & {
    generation_config: { decoder_start_token_id: number; lang_to_id: Record<string, number> };
  };
};

/**
 * transformers.js has no Whisper language detection (it silently assumes English), so we run
 * one decoder step from <|startoftranscript|> and compare the language-token logits ourselves.
 */
export async function detectLanguage(
  pipe: unknown,
  audio: Float32Array,
  candidates: string[] = AUTO_LANGUAGES,
): Promise<{ language: string; confidence: number }> {
  const p = pipe as WhisperPipe;
  const gc = p.model.generation_config;
  const { input_features } = await p.processor(audio);
  const decoder_input_ids = new Tensor(
    "int64",
    BigInt64Array.from([BigInt(gc.decoder_start_token_id)]),
    [1, 1],
  );
  const out = await p.model({ input_features, decoder_input_ids });
  const logits = out.logits.data;

  const scored = candidates
    .map((code) => ({ code, logit: Number(logits[gc.lang_to_id[`<|${code}|>`]]) }))
    .filter((s) => Number.isFinite(s.logit));
  if (!scored.length) return { language: candidates[0], confidence: 0 };
  const max = Math.max(...scored.map((s) => s.logit));
  const exps = scored.map((s) => Math.exp(s.logit - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const best = exps.indexOf(Math.max(...exps));
  return { language: scored[best].code, confidence: exps[best] / sum };
}
