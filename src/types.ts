export type MoodId = "happy" | "calm" | "sad" | "angry" | "anxious";

export interface MoodTag {
  id: MoodId;
  name: string;
  icon: string;
  color: string; // hex e.g. "#ffcf5c"
}

export type BlockKind = "text" | "image" | "audio";

export interface DiaryBlock {
  id: string;
  kind: BlockKind;
  content: string;           // text: 文本 / image: dataURL / audio: dataURL
  durationMs?: number;       // 仅 audio
}

export interface Diary {
  id: string;
  title: string;
  date: string;              // YYYY-MM-DD
  moodId: MoodId | null;
  blocks: DiaryBlock[];
  createdAt: number;
  updatedAt: number;
}

export function uid(prefix = "b"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
