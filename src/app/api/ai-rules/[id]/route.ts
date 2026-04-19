import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  kind: z.enum(["advice", "autoaction"]).optional(),
  enabled: z.boolean().optional(),
  condition: z.record(z.string(), z.unknown()).optional(),
  action: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const id = Number(params.id);
    const parsed = patchSchema.parse(await req.json());
    const [row] = await db()
      .update(schema.aiRules)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(schema.aiRules.id, id))
      .returning();
    await db()
      .insert(schema.auditLog)
      .values({
        action: "RULE_UPDATED",
        entity: "ai_rule",
        entityId: String(id),
        payload: parsed,
      });
    return NextResponse.json({ ok: true, rule: row });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const id = Number(params.id);
    await db().delete(schema.aiRules).where(eq(schema.aiRules.id, id));
    await db()
      .insert(schema.auditLog)
      .values({
        action: "RULE_DELETED",
        entity: "ai_rule",
        entityId: String(id),
      });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
