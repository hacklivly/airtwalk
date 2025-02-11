import { text } from "drizzle-orm/pg-core";
import { z } from "zod";

// Schema for participants
export const participants = z.object({
  sessionId: z.string(),
  isMuted: z.boolean().default(false),
  isAvailable: z.boolean().default(true),
  autoFind: z.boolean().default(false),
  region: z.string().optional()
});

// Schema for chat history
export const chatHistory = z.object({
  sessionId: z.string(),
  partnerId: z.string(),
  lastInteractionTime: z.number(),
  messages: z.array(z.object({
    text: z.string(),
    from: z.enum(['me', 'partner']),
    timestamp: z.number()
  })).default([])
});

export type Participant = z.infer<typeof participants>;
export type ChatHistory = z.infer<typeof chatHistory>;