import type { Segment } from "../lib/types";

/** Turn paragraphs into 20-second segments, like the recorder produces. */
export function toSegments(paragraphs: string[], secondsPerSegment = 20): Segment[] {
  return paragraphs.map((text, i) => ({
    start: i * secondsPerSegment,
    end: (i + 1) * secondsPerSegment,
    text,
    language: /[ığşçöüİĞŞÇÖÜ]/.test(text) ? "tr" : "en",
  }));
}

export type Fixture = {
  name: string;
  language: "en" | "tr";
  glossary?: boolean;
  context?: string;
  segments: Segment[];
  expect: {
    /** Each entry is a concept; it counts as covered if ANY of its patterns appears in the notes. */
    concepts: RegExp[][];
    /** Patterns that must appear in `examHints`. */
    hints: RegExp[];
    /** Text that must NOT appear anywhere (hallucinations, transcript junk). */
    forbidden: RegExp[];
    /** Expect chapter/section output with timestamps. */
    sections?: boolean;
  };
};

// --- 1. Short OS lecture: English with Turkish asides, ASR errors, a hallucinated outro ---------
const osShort = toSegments([
  "Okay everyone, today we are talking about synchronization in operating systems.",
  "So the problem is this: when two threads update the same variable at the same time, we get a race condition.",
  "A race condition is when the result depends on the order in which the threads happen to run.",
  "Şimdi bunu iyi anlayın çünkü vizede mutlaka çıkacak, race condition'ın tanımını ezberleyin.",
  "To fix this we use mutual exclusion. A mew tex is a lock that only one thread can hold at a time.",
  "The part of the code that touches the shared variable is called the critical section.",
  "A sema four is more general than a mutex. It keeps a counter, and wait decrements the counter and blocks if it is zero.",
  "Signal increments the counter and wakes up one waiting thread. Dijkstra invented semaphores in 1965.",
  "Bir de deadlock var. Deadlock, iki thread'in birbirinin kilidini beklemesi demek. Bu da sınavda çıkar.",
  "Four conditions must hold for a deadlock: mutual exclusion, hold and wait, no preemption, and circular wait.",
  "If we break any one of these four conditions, deadlock cannot happen.",
  "Homework three is due next Friday, it is about implementing a producer consumer queue with semaphores.",
  "Thank you.",
  "Thank you.",
  "Thank you.",
]);

// --- 2. Long lecture: forces the part-by-part pipeline -----------------------------------------
const topics: [string, string[]][] = [
  [
    "virtual memory",
    [
      "Virtual memory gives each process the illusion of a large private address space.",
      "The address space is split into pages, typically four kilobytes, and physical memory into frames of the same size.",
      "The page table maps a virtual page number to a physical frame number.",
      "On a page fault the operating system loads the missing page from disk, which takes about ten milliseconds.",
      "Vize için sayfa tablosunun nasıl çalıştığını bilmeniz şart, bunu mutlaka soracağım.",
    ],
  ],
  [
    "the translation lookaside buffer",
    [
      "The TLB is a small hardware cache of recent page table entries.",
      "A TLB hit costs about one nanosecond, while a miss requires walking the page table in memory.",
      "With a ninety-nine percent hit rate the effective access time stays close to the memory access time.",
      "Context switches usually flush the TLB unless entries are tagged with an address space identifier.",
    ],
  ],
  [
    "page replacement",
    [
      "When memory is full we must evict a page. The optimal algorithm evicts the page that will be used farthest in the future.",
      "Optimal cannot be implemented, but it is the benchmark. FIFO is simple but suffers from Belady's anomaly.",
      "LRU evicts the least recently used page and approximates the optimal algorithm well.",
      "The clock algorithm approximates LRU using a single reference bit per page.",
      "Final sınavında Belady's anomaly ile ilgili bir soru olacak, FIFO örneğini çözebilmelisiniz.",
    ],
  ],
  [
    "file systems",
    [
      "A file system organizes data on disk into files and directories.",
      "An inode stores the metadata of a file: its size, owner, permissions and the pointers to its data blocks.",
      "Unix inodes have twelve direct pointers, one single indirect, one double indirect and one triple indirect pointer.",
      "With four kilobyte blocks and four byte pointers a single indirect block addresses one thousand twenty-four blocks.",
    ],
  ],
  [
    "disk scheduling",
    [
      "The disk arm must move to the right cylinder, which is the seek time and dominates the access cost.",
      "First come first served is fair but slow. Shortest seek time first is fast but can starve far away requests.",
      "The elevator algorithm, also called SCAN, sweeps the arm in one direction serving requests along the way.",
      "SSDs have no moving arm so seek time disappears, but they wear out after many writes.",
    ],
  ],
];

function repeatTopic(topic: [string, string[]], rounds: number): string[] {
  const [name, lines] = topic;
  const out: string[] = [`Now let us move on to ${name}.`];
  for (let r = 0; r < rounds; r++) {
    for (const line of lines) {
      out.push(r === 0 ? line : `${line} Let me repeat that with another example.`);
    }
  }
  return out;
}

const osLong = toSegments(topics.flatMap((t) => repeatTopic(t, 6)));

export const FIXTURES: Fixture[] = [
  {
    name: "Short OS lecture, Turkish notes",
    language: "tr",
    glossary: false,
    segments: osShort,
    expect: {
      concepts: [
        [/yarış durumu|race condition/i],
        [/muteks|karşılıklı dışlama|mutex/i],
        [/kritik bölge|critical section/i],
        [/semafor|semaphore/i],
        [/kilitlenme|deadlock/i],
        [/döngüsel bekleme|circular wait|dairesel/i],
      ],
      hints: [/yarış durumu|race condition/i, /kilitlenme|deadlock/i, /ödev|homework|cuma/i],
      forbidden: [/\bmew tex\b/i, /\bsema four\b/i, /thank you/i],
      sections: true,
    },
  },
  {
    name: "Short OS lecture (EN with Turkish asides, ASR errors)",
    language: "en",
    glossary: true,
    context: "Operating Systems, week 6: synchronization. Terms: mutex, semaphore, deadlock.",
    segments: osShort,
    expect: {
      concepts: [
        [/race condition/i],
        [/mutex|mutual exclusion/i],
        [/critical section/i],
        [/semaphore/i],
        [/deadlock/i],
        [/circular wait/i],
      ],
      hints: [/race condition/i, /deadlock/i, /homework|ödev|due|friday|cuma/i],
      forbidden: [/\bmew tex\b/i, /\bsema four\b/i, /thank you/i],
      sections: true,
    },
  },
  {
    name: "Long OS lecture (forces part-by-part summarization)",
    language: "en",
    segments: osLong,
    expect: {
      concepts: [
        [/page table/i],
        [/TLB|translation lookaside/i],
        [/LRU|least recently used/i],
        [/belady/i],
        [/inode/i],
        [/SCAN|elevator|seek/i],
      ],
      hints: [/page table|sayfa tablosu/i, /belady|FIFO|final|sınav/i],
      forbidden: [/let me repeat that/i],
      sections: true,
    },
  },
];
