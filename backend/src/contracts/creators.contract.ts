import { z } from "zod";

export const CreateCreatorRequest = z.object({
  nickname: z.string(),
  emoji: z.string().optional(),
});
