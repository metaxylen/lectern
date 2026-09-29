import type { Definition, ExamQuestion, Notes } from "./types";

const STOPWORDS = new Set(
  `ve veya ile ama fakat ancak çünkü için gibi kadar daha çok en de da ki mi mu mı mü bu şu o bir bazı her hiç ne neden nasıl
  ise ya yani hem bunu şunu onu bunlar şunlar onlar biz siz ben sen var yok olan olarak olan olur oldu olduğu olduğunu olması
  eden etmek etti ettiği eder gibi sonra önce şimdi bugün artık tekrar ayrıca bunun bunların üzerinde içinde arasında
  the a an and or but if then than that this these those is are was were be been being of to in on at by for with as from
  it its into about over under not no so such also can could will would should may might we you they he she i our your their
  have has had do does did there here which who whom what when where why how more most very just
  between among during while other each some many same only because through using use used then them they thing things
  like make makes made take takes want need get gets given let lets know going okay right now will next first second`
    .split(/\s+/)
    .filter(Boolean),
);

const CUES = [
  "önemli",
  "dikkat",
  "sınav",
  "tanım",
  "özetle",
  "sonuç",
  "unutmayın",
  "mutlaka",
  "temel",
  "anahtar",
  "important",
  "exam",
  "definition",
  "remember",
  "key",
  "note",
  "conclusion",
  "summary",
  "main",
];

const TR_SUFFIX = "(?:dir|dır|dur|dür|tir|tır|tur|tür)";
const TERM_STOP = /^(?:bu|şu|o|bunlar|şunlar|onlar|this|that|these|those|it|they|there|here)\b/i;

function lower(s: string): string {
  return s.toLocaleLowerCase("tr");
}

function words(s: string): string[] {
  return lower(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+(?=[\p{Lu}\p{N}"'(\[])/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && words(s).length >= 4);
}

function termFrequency(sentences: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const s of sentences) {
    for (const w of words(s)) {
      if (w.length < 4 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
      tf.set(w, (tf.get(w) ?? 0) + 1);
    }
  }
  return tf;
}

function scoreSentences(sentences: string[], tf: Map<string, number>): number[] {
  return sentences.map((s, i) => {
    const ws = words(s).filter((w) => tf.has(w));
    if (!ws.length) return 0;
    let score = ws.reduce((a, w) => a + (tf.get(w) ?? 0), 0) / Math.sqrt(words(s).length);
    const l = lower(s);
    if (CUES.some((c) => l.includes(c))) score *= 1.35;
    if (i < 2) score *= 1.15;
    return score;
  });
}

function topIndices(scores: number[], n: number): number[] {
  return scores
    .map((s, i) => [s, i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, n)
    .map(([, i]) => i)
    .sort((a, b) => a - b);
}

function capitalize(s: string, locale: string): string {
  return s ? s.charAt(0).toLocaleUpperCase(locale) + s.slice(1) : s;
}

function clean(s: string): string {
  return s
    .replace(/^\s*[-–•]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractKeywords(text: string, n = 8): string[] {
  const tf = termFrequency(splitSentences(text).length ? splitSentences(text) : [text]);
  return [...tf.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, n)
    .map(([w]) => w);
}

export function extractDefinitions(sentences: string[], max = 5, locale = "en"): Definition[] {
  const found: Definition[] = [];
  const seen = new Set<string>();
  const push = (term: string, definition: string) => {
    term = clean(term)
      .replace(/^["'“]|["'”]$/g, "")
      .replace(/^(?:a|an|the)\s+/i, "");
    definition = clean(definition);
    const key = lower(term);
    if (!term || term.split(" ").length > 5 || TERM_STOP.test(term) || seen.has(key)) return;
    if (definition.length < 15) return;
    seen.add(key);
    found.push({ term: capitalize(term, locale), definition: capitalize(definition, locale) });
  };

  for (const s of sentences) {
    if (found.length >= max) break;
    const body = s.replace(/[.!?…]+$/, "");
    let m: RegExpMatchArray | null;

    if (
      (m = body.match(
        /^(.{2,60}?)\s+(?:is defined as|refers to|is called|means|is (?:a|an|the)|are (?:the|a))\s+(.{15,})$/i,
      ))
    ) {
      push(m[1], m[2]);
      continue;
    }
    if ((m = body.match(/^(?:.{5,}?\s)?([^\s,]+)\s+(?:denir|denilir|adını alır|adı verilir)$/i))) {
      push(m[1], body);
      continue;
    }
    if (
      (m = body.match(
        /^(.{2,50}?)\s+(?:olarak\s+)?(?:tanımlanır|adlandırılır|ifade edilir)\b(.*)$/i,
      ))
    ) {
      push(m[1], body);
      continue;
    }
    if ((m = body.match(new RegExp(`^(.{2,50}?),\\s+(.{15,}?${TR_SUFFIX})$`, "i")))) {
      push(m[1], m[2]);
      continue;
    }
    if (
      (m = body.match(new RegExp(`^(\\S+(?:\\s\\S+){0,2}?)\\s+(.{20,}?${TR_SUFFIX})$`, "i"))) &&
      !/\s(?:ve|ile|ama)\s/i.test(m[1])
    ) {
      push(m[1], m[2]);
    }
  }
  return found;
}

const TR_HINTS = new Set(
  "ve bir bu için ile de da çok gibi olarak olan ise ama daha var yok değil ne nasıl şu o".split(
    " ",
  ),
);
const EN_HINTS = new Set(
  "the and of to is are that this for with as on it be an in which not we you can".split(" "),
);

export function dominantLanguage(text: string): "tr" | "en" {
  let tr = 0;
  let en = 0;
  for (const w of words(text)) {
    if (TR_HINTS.has(w)) tr++;
    if (EN_HINTS.has(w)) en++;
  }
  return tr > en ? "tr" : "en";
}

export function condenseTranscript(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const sentences = splitSentences(text);
  if (!sentences.length) return text.slice(0, maxChars);
  const scores = scoreSentences(sentences, termFrequency(sentences));
  const ranked = scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]);
  const chosen: number[] = [];
  let total = 0;
  for (const [, i] of ranked) {
    if (total + sentences[i].length + 1 > maxChars) continue;
    chosen.push(i);
    total += sentences[i].length + 1;
  }
  // Whisper output can lack sentence punctuation, leaving only sentences longer than the budget.
  // Never hand the model an empty transcript: keep the start and end of the lecture instead.
  if (!chosen.length) {
    const gap = " … ";
    const head = Math.ceil((maxChars - gap.length) * 0.6);
    const tail = maxChars - gap.length - head;
    return `${text.slice(0, head)}${gap}${text.slice(text.length - tail)}`;
  }
  return chosen
    .sort((a, b) => a - b)
    .map((i) => sentences[i])
    .join(" ");
}

// Templates follow the transcript language (the summarizer cannot translate), not the requested notes language.
export function extractiveNotes(transcript: string): Notes {
  const text = transcript.replace(/^\s*\[[^\]]*\]\s*/, "").trim();
  const tr = dominantLanguage(text) === "tr";
  const sentences = splitSentences(text);
  if (!sentences.length) {
    return {
      title: tr ? "Ders notları" : "Lecture notes",
      summary: text || (tr ? "Transkript boş." : "The transcript is empty."),
      keyPoints: [],
      definitions: [],
      examQuestions: [],
    };
  }

  const tf = termFrequency(sentences);
  const scores = scoreSentences(sentences, tf);
  const keywords = [...tf.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 8)
    .map(([w]) => w);

  const summaryCount = Math.min(4, Math.max(1, Math.round(sentences.length / 4)));
  const keyCount = Math.min(8, Math.max(3, Math.round(sentences.length / 3)));
  const summary = topIndices(scores, summaryCount)
    .map((i) => sentences[i])
    .join(" ");
  const summaryIdx = new Set(topIndices(scores, summaryCount));
  const keyIdx = topIndices(
    scores.map((s, i) => (summaryIdx.has(i) ? s * 0.6 : s)),
    keyCount,
  );
  const keyPoints = keyIdx.map((i) => sentences[i]);

  const locale = tr ? "tr" : "en";
  const definitions = extractDefinitions(sentences, 5, locale);

  const questions: ExamQuestion[] = definitions.slice(0, 3).map((d) => ({
    question: tr ? `${d.term} nedir?` : `What is ${d.term}?`,
    answer: d.definition,
  }));
  const used = new Set(definitions.map((d) => lower(d.term)));
  for (const kw of keywords) {
    if (questions.length >= 5) break;
    const stem = kw.slice(0, 5);
    if ([...used].some((u) => u.includes(stem))) continue;
    const best = sentences
      .map((s, i) => [s, scores[i]] as const)
      .filter(([s]) => words(s).includes(kw))
      .sort((a, b) => b[1] - a[1])[0];
    if (!best) continue;
    used.add(kw);
    questions.push({
      question: tr
        ? `"${capitalize(kw, locale)}" kavramını dersteki bağlamıyla açıklayınız.`
        : `Explain the concept of "${capitalize(kw, locale)}" in the context of the lecture.`,
      answer: best[0],
    });
  }

  const head = keywords
    .slice(0, 3)
    .map((w) => capitalize(w, locale))
    .join(", ");
  return {
    title: head
      ? `${tr ? "Ders notu" : "Lecture notes"}: ${head}`
      : tr
        ? "Ders notları"
        : "Lecture notes",
    summary,
    keyPoints,
    definitions,
    examQuestions: questions,
  };
}
