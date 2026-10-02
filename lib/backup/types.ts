import { z } from "zod";
import { LectureSchema, SegmentSchema } from "@/lib/schemas";

const ChunkStatusSchema = z.enum(["pending", "done", "failed", "silent"]);
const SessionStatusSchema = z.enum(["recording", "complete"]);

export const BackupAudioChunkSchema = z.object({
  index: z.number().int().nonnegative(),
  mimeType: z.string(),
  complete: z.boolean(),
  durationSec: z.number(),
  status: ChunkStatusSchema,
  segments: z.array(SegmentSchema).optional(),
  error: z.string().optional(),
  dataBase64: z.string().min(1),
});

export const BackupAudioSessionSchema = z.object({
  id: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  status: SessionStatusSchema,
  source: z.enum(["mic", "file"]),
  title: z.string(),
  fileName: z.string().optional(),
  audioLanguage: z.string(),
  notesLanguage: z.string(),
  sttEngine: z.string(),
  chunks: z.array(BackupAudioChunkSchema),
});

export const BackupFileSchema = z.object({
  format: z.literal("lectern-backup"),
  version: z.literal(1),
  exportedAt: z.number(),
  lectures: z.array(LectureSchema),
  audio: z.array(BackupAudioSessionSchema),
});

export type BackupFile = z.infer<typeof BackupFileSchema>;
