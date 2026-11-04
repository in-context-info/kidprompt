export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || 10000);
  let res: Response;
  try {
    res = await fetch("/api/" + path, {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError("Couldn't reach KidPrompt. Check your internet and try again.", 0);
  } finally {
    clearTimeout(timeout);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error || "Something went wrong.", res.status);
  return data as T;
}

export interface Creator {
  id: string;
  nickname: string;
  emoji: string;
}

export interface Me {
  user: { email: string; name: string };
  creators: Creator[];
  buildsLeftToday: number;
}

export type Status = "draft" | "submitted" | "published" | "rejected";

export interface ProjectSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  kind: "game" | "app";
  emoji: string;
  status: Status;
  reviewNote: string | null;
  creatorId: string | null;
  isLive: boolean;
  hasUnpublishedChanges: boolean;
  plays: number;
  updatedAt: number;
}

export interface ProjectDetail extends ProjectSummary {
  html: string;
  versions: { id: number; prompt: string; createdAt: number }[];
}

export interface GalleryItem {
  slug: string;
  title: string;
  description: string;
  kind: "game" | "app";
  emoji: string;
  creatorNickname: string;
  creatorEmoji: string;
  plays: number;
  publishedAt: number;
}
