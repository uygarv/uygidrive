import { z } from "zod";

export const emailSchema = z.string().trim().email().max(320);
export const usernameSchema = z.string().trim().regex(/^[a-z0-9_]{3,20}$/, "Username must use 3–20 lowercase letters, numbers, or underscores.");
export const passwordSchema = z.string().min(6).max(1024);
export const idSchema = z.string().regex(/^[a-z]+_[A-Za-z0-9_-]{12,}$/);
export const nullableIdSchema = idSchema.nullable();
export const sortSchema = z.enum(["date:new-first", "date:old-first", "size:largest-first", "size:smallest-first"]).default("date:new-first");
export const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(25);
export const trashQuerySchema = z.object({
  cursor: z.string().max(2048).optional(),
  pageSize: pageSizeSchema,
});
export const shareStatusSchema = z.object({
  hasActiveLink: z.boolean(),
  sharedRecipientCount: z.number().int().nonnegative(),
});
export const revokePrivateLinksResponseSchema = z.object({
  revoked: z.number().int().nonnegative(),
});
export const shareModeSchema = z.enum(["public", "link", "recipient"]);
export const shareLinkTargetSchema = z.enum(["preview", "content"]);
export const accessModeSchema = z.enum(["public", "private"]);
export const shareRoleSchema = z.enum(["viewer", "editor"]);
export const createShareSchema = z.object({
  mode: shareModeSchema,
  // Firebase Auth UIDs are opaque strings, not UygiDrive node IDs.
  recipientId: z.string().min(1).max(128).nullable().optional().default(null),
  role: shareRoleSchema.nullable().optional().default(null),
  expiresAt: z.string().datetime().nullable().optional().default(null),
  linkTarget: shareLinkTargetSchema.optional().default("preview"),
}).superRefine((value, context) => {
  if (value.mode === "recipient" && !value.recipientId) context.addIssue({ code: z.ZodIssueCode.custom, message: "A recipient is required for a recipient share." });
  if (value.mode === "recipient" && !value.role) context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose a role for the recipient." });
  if (value.mode !== "recipient" && value.role) context.addIssue({ code: z.ZodIssueCode.custom, message: "Only direct recipients have roles." });
  if (value.mode === "link" && !value.expiresAt) context.addIssue({ code: z.ZodIssueCode.custom, message: "Private links require an expiration time." });
  if (value.mode !== "link" && value.expiresAt) context.addIssue({ code: z.ZodIssueCode.custom, message: "Only private links can have an expiration time." });
  if (value.mode === "recipient" && value.linkTarget !== "preview") context.addIssue({ code: z.ZodIssueCode.custom, message: "Only public and private links can choose a link target." });
  if (value.expiresAt) {
    const expiresAt = new Date(value.expiresAt);
    if (expiresAt <= new Date()) context.addIssue({ code: z.ZodIssueCode.custom, message: "The expiration time must be in the future." });
    if (expiresAt.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1_000) context.addIssue({ code: z.ZodIssueCode.custom, message: "Private links can expire at most one year from now." });
  }
});

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw Object.assign(new Error(issue?.message ?? "The request is invalid."), { statusCode: 422, code: "VALIDATION_ERROR", details: result.error.flatten() });
}
