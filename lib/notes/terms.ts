import type { GlossaryEntry, Notes } from "../types";
import { normalizeForMatch } from "./ground";

/**
 * Established Turkish equivalents of common technical terms. Small language models often invent
 * literal, wrong translations ("race condition" -> "yarış koşulu"/"yüzleşme koşulu"), so we feed the
 * right ones into the prompt for terms that occur in the lecture, and correct glossaries afterwards.
 * [English, Turkish]. Prefer the term Turkish university textbooks use.
 */
const TERMS: [string, string][] = [
  // operating systems
  ["process", "süreç"],
  ["thread", "iş parçacığı"],
  ["race condition", "yarış durumu"],
  ["mutual exclusion", "karşılıklı dışlama"],
  ["mutex", "muteks"],
  ["semaphore", "semafor"],
  ["deadlock", "kilitlenme"],
  ["starvation", "açlık"],
  ["critical section", "kritik bölge"],
  ["context switch", "bağlam değiştirme"],
  ["scheduler", "zamanlayıcı"],
  ["scheduling", "zamanlama"],
  ["preemption", "önceleme"],
  ["virtual memory", "sanal bellek"],
  ["page table", "sayfa tablosu"],
  ["page fault", "sayfa hatası"],
  ["page replacement", "sayfa değiştirme"],
  ["paging", "sayfalama"],
  ["segmentation", "bölütleme"],
  ["kernel", "çekirdek"],
  ["system call", "sistem çağrısı"],
  ["interrupt", "kesme"],
  ["file system", "dosya sistemi"],
  ["inode", "i-düğümü (inode)"],
  ["fragmentation", "parçalanma"],
  ["throughput", "çıktı (verim)"],
  ["latency", "gecikme"],
  ["cache", "önbellek"],
  ["heap", "öbek"],
  ["stack", "yığın"],
  ["synchronization", "eşzamanlama"],
  ["concurrency", "eşzamanlılık"],
  ["parallelism", "paralellik"],
  ["memory leak", "bellek sızıntısı"],
  ["garbage collection", "çöp toplama"],
  // algorithms and data structures
  ["algorithm", "algoritma"],
  ["time complexity", "zaman karmaşıklığı"],
  ["space complexity", "yer karmaşıklığı"],
  ["complexity", "karmaşıklık"],
  ["recursion", "özyineleme"],
  ["dynamic programming", "dinamik programlama"],
  ["greedy algorithm", "açgözlü algoritma"],
  ["binary search", "ikili arama"],
  ["sorting", "sıralama"],
  ["hash table", "karma tablosu"],
  ["hash function", "karma işlevi"],
  ["linked list", "bağlı liste"],
  ["array", "dizi"],
  ["queue", "kuyruk"],
  ["binary tree", "ikili ağaç"],
  ["tree", "ağaç"],
  ["graph", "çizge"],
  ["data structure", "veri yapısı"],
  ["pointer", "işaretçi"],
  ["divide and conquer", "böl ve yönet"],
  ["backtracking", "geri izleme"],
  ["breadth-first search", "genişlik öncelikli arama"],
  ["depth-first search", "derinlik öncelikli arama"],
  ["shortest path", "en kısa yol"],
  ["spanning tree", "kapsayan ağaç"],
  // databases
  ["database", "veritabanı"],
  ["transaction", "işlem (transaction)"],
  ["primary key", "birincil anahtar"],
  ["foreign key", "yabancıl anahtar"],
  ["normalization", "normalleştirme"],
  ["query", "sorgu"],
  ["schema", "şema"],
  ["isolation", "yalıtım"],
  ["concurrency control", "eşzamanlılık denetimi"],
  // networks and security
  ["protocol", "protokol"],
  ["packet", "paket"],
  ["router", "yönlendirici"],
  ["routing", "yönlendirme"],
  ["bandwidth", "bant genişliği"],
  ["congestion control", "tıkanıklık denetimi"],
  ["flow control", "akış denetimi"],
  ["firewall", "güvenlik duvarı"],
  ["encryption", "şifreleme"],
  ["authentication", "kimlik doğrulama"],
  ["public key", "açık anahtar"],
  ["private key", "özel anahtar"],
  // machine learning and statistics
  ["machine learning", "makine öğrenmesi"],
  ["neural network", "yapay sinir ağı"],
  ["overfitting", "aşırı öğrenme"],
  ["underfitting", "yetersiz öğrenme"],
  ["gradient descent", "gradyan inişi"],
  ["loss function", "kayıp işlevi"],
  ["regression", "bağlanım (regresyon)"],
  ["classification", "sınıflandırma"],
  ["clustering", "kümeleme"],
  ["feature", "öznitelik"],
  ["supervised learning", "gözetimli öğrenme"],
  ["unsupervised learning", "gözetimsiz öğrenme"],
  ["backpropagation", "geri yayılım"],
  ["activation function", "etkinleştirme işlevi"],
  ["probability", "olasılık"],
  ["variance", "varyans"],
  ["standard deviation", "standart sapma"],
  ["median", "ortanca"],
  ["hypothesis", "hipotez"],
  ["confidence interval", "güven aralığı"],
  ["distribution", "dağılım"],
  ["correlation", "ilinti (korelasyon)"],
  ["expected value", "beklenen değer"],
  // mathematics
  ["derivative", "türev"],
  ["integral", "integral"],
  ["matrix", "matris"],
  ["eigenvalue", "özdeğer"],
  ["eigenvector", "özvektör"],
  ["vector", "vektör"],
  ["theorem", "teorem"],
  ["proof", "kanıt"],
  ["induction", "tümevarım"],
  ["linear algebra", "doğrusal cebir"],
  // software engineering
  ["compiler", "derleyici"],
  ["interpreter", "yorumlayıcı"],
  ["abstraction", "soyutlama"],
  ["inheritance", "kalıtım"],
  ["polymorphism", "çok biçimlilik"],
  ["encapsulation", "kapsülleme"],
  ["object-oriented", "nesne yönelimli"],
  ["design pattern", "tasarım deseni"],
  ["unit test", "birim testi"],
  ["version control", "sürüm denetimi"],
  ["debugging", "hata ayıklama"],
];

type Term = { en: string; tr: string; padded: string };

const INDEX: Term[] = TERMS.map(([en, tr]) => ({
  en,
  tr,
  padded: ` ${normalizeForMatch(en)} `,
}));

/** Terms from the dictionary that occur in `text` (singular or plural), longest match first. */
export function findKnownTerms(text: string, max = 24): { en: string; tr: string }[] {
  const norm = ` ${normalizeForMatch(text)} `;
  const found = INDEX.filter((t) => {
    const stem = t.padded.trimEnd();
    return norm.includes(t.padded) || norm.includes(`${stem}s `) || norm.includes(`${stem}es `);
  });
  // Drop a short term when a longer one that contains it was found ("complexity" vs "time complexity").
  const kept = found.filter(
    (t) =>
      !found.some(
        (o) => o !== t && o.en.length > t.en.length && o.padded.includes(t.padded.trim()),
      ),
  );
  return kept.slice(0, max).map(({ en, tr }) => ({ en, tr }));
}

/** Replace model-invented Turkish glossary equivalents with the established ones. */
export function fixGlossary(glossary: GlossaryEntry[] | undefined): GlossaryEntry[] | undefined {
  if (!glossary) return glossary;
  const byEnglish = new Map(TERMS.map(([en, tr]) => [normalizeForMatch(en), tr]));
  return glossary.map((g) => {
    const key = normalizeForMatch(g.term).replace(/(?:es|s)$/, "");
    const known = byEnglish.get(normalizeForMatch(g.term)) ?? byEnglish.get(key);
    return known ? { term: g.term, turkish: known } : g;
  });
}

export function applyKnownGlossary(notes: Notes): Notes {
  return notes.glossary ? { ...notes, glossary: fixGlossary(notes.glossary) } : notes;
}

/** Number of dictionary entries (for tests and docs). */
export const KNOWN_TERM_COUNT = TERMS.length;
