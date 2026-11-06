import { z } from "zod";

export const GuestBuildRequest = z.object({
  prompt: z.string(),
  // Only used for the first build, when the guest game is created.
  title: z.string().optional(),
});
