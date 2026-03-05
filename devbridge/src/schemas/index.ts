import { z } from "zod";

export const projectCreate = z.object({
  name: z.string().min(1),
  localPath: z.string().min(1),
  repoUrl: z.string().url().optional(),
  defaultBranch: z.string().optional().default("main"),
});

export const projectSelect = z.object({
  channelKey: z.string().min(1),
});

export const planBody = z.object({
  channelKey: z.string().min(1),
  projectId: z.number().int().positive().optional(),
  text: z.string().min(1),
  agent: z.string().optional(),
  model: z.string().optional(),
});

export const buildBody = z.object({
  channelKey: z.string().min(1),
  text: z.string().optional(),
  agent: z.string().optional(),
  model: z.string().optional(),
});

export const statusQuery = z.object({
  channelKey: z.string().min(1),
});

export const sessionEventsQuery = z.object({
  channelKey: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const diffQuery = z.object({
  channelKey: z.string().min(1),
});

export const approvalsQuery = z.object({
  channelKey: z.string().min(1),
});

export const approvalBody = z.object({
  decision: z.enum(["approve", "deny"]),
  remember: z.boolean().optional().default(false),
});

export const applyBody = z.object({
  channelKey: z.string().min(1),
  mode: z.enum(["commit", "push", "pr"]).default("commit"),
  message: z.string().optional(),
});

export const opencodeChannelBody = z.object({
  channelKey: z.string().min(1),
});

export const handoffBody = z.object({
  channelKey: z.string().min(1),
  text: z.string().min(1),
  system: z.string().optional(),
  agent: z.string().optional(),
  model: z.string().optional(),
});

export const executeBody = z.object({
  channelKey: z.string().min(1),
  naturalLanguage: z.string().min(1),
});
