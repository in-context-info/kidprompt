import { z } from "zod";

export const ProjectKind = z.enum(["game", "app"]);
export const ProjectStatus = z.enum(["draft", "submitted", "published", "rejected"]);

export const CreateProjectRequest = z.object({
  title: z.string(),
  creatorId: z.string().nullable().optional(),
  kind: ProjectKind.optional(),
  emoji: z.string().optional(),
});

export const UpdateProjectRequest = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  creatorId: z.string().nullable().optional(),
  kind: ProjectKind.optional(),
  emoji: z.string().optional(),
  // Pasting or hand-editing the code directly (e.g. a game made elsewhere).
  html: z.string().optional(),
});

export const BuildRequest = z.object({
  prompt: z.string(),
});

export const RestoreRequest = z.object({
  versionId: z.number(),
});

export const ProjectSummary = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  kind: ProjectKind,
  emoji: z.string(),
  status: ProjectStatus,
  reviewNote: z.string().nullable(),
  creatorId: z.string().nullable(),
  isLive: z.boolean(),
  hasUnpublishedChanges: z.boolean(),
  plays: z.number(),
  updatedAt: z.number(),
});

export const ProjectDetail = ProjectSummary.extend({
  html: z.string(),
  versions: z.array(z.object({ id: z.number(), prompt: z.string(), createdAt: z.number() })),
});

export const GalleryItem = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  kind: ProjectKind,
  emoji: z.string(),
  creatorNickname: z.string(),
  creatorEmoji: z.string(),
  plays: z.number(),
  publishedAt: z.number(),
});
