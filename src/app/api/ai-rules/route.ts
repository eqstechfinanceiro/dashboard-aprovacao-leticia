import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";

const ruleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  kind: z.enum(["advice", "autoaction"]).default("advice"),
  enabled: z.boolean().default(true),
  condition: z.record(z.string(), z.unknown()).default({}),
  action: z.record(z.string(), z.unknown()).default({}),
});

export async function GET() {
  try {
    const rules = await db().select().from(schema.aiRules);
    return NextResponse.json({ rules });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const parsed = ruleSchema.parse(await req.json());
    const [row] = await db()
      .insert(schema.aiRules)
      .values({
        name: parsed.name,
        description: parsed.description ?? null,
        kind: parsed.kind,
        enabled: parsed.enabled,
        condition: parsed.condition,
        action: parsed.action,
      })
      .returning();
    await db()
      .insert(schema.auditLog)
      .values({
        action: "RULE_CREATED",
        entity: "ai_rule",
        entityId: String(row.id),
        payload: parsed,
      });
    return NextResponse.json({ ok: true, rule: row });
  } catch (e) {
    return handleApiError(e);
  }
}
