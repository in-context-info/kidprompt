import { z } from "zod";

export const SignupRequest = z.object({
  name: z.string(),
  email: z.string(),
  password: z.string(),
});

export const SignupConfirmRequest = z.object({
  email: z.string(),
  code: z.string(),
});

export const LoginRequest = z.object({
  email: z.string(),
  password: z.string(),
});

export const Creator = z.object({
  id: z.string(),
  nickname: z.string(),
  emoji: z.string(),
});

export const MeResponse = z.object({
  user: z.object({ email: z.string(), name: z.string() }),
  creators: z.array(Creator),
  buildsLeftToday: z.number(),
});
