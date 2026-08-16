import { z } from "zod";

export const emailSchema = z.string().trim().email().max(320);
export const passwordSchema = z.string().min(6).max(1024);
export const idSchema = z.string().regex(/^[a-z]+_[A-Za-z0-9_-]{12,}$/);
export const nullableIdSchema = idSchema.nullable();
export const sortSchema = z.enum(["date:new-first", "date:old-first", "size:largest-first", "size:smallest-first"]).default("date:new-first");
export const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(25);

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw Object.assign(new Error(issue?.message ?? "The request is invalid."), { statusCode: 422, code: "VALIDATION_ERROR", details: result.error.flatten() });
}
