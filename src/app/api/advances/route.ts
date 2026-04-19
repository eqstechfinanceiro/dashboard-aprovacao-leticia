import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { createAdvance } from "@/lib/vexpenses";
import { db, schema } from "@/db";
import { getUserBalance } from "@/lib/cash-balance";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  team_member_id: z.number().int().positive(),
  team_member_name: z.string().optional(),
  value: z.number().positive(),
  currency_id: z.number().int().positive().optional(),
  currency_code: z.string().default("BRL"),
  description: z.string().optional(),
  override_debtor: z.boolean().default(false),
  created_by: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.parse(await req.json());

    const balance = await getUserBalance(parsed.team_member_id);
    if (
      balance &&
      balance.status === "DEVEDOR" &&
      !parsed.override_debtor
    ) {
      return NextResponse.json(
        {
          error:
            "Colaborador está DEVEDOR. Quite o saldo antes ou passe override_debtor=true.",
          balance,
        },
        { status: 409 },
      );
    }

    let remote: Awaited<ReturnType<typeof createAdvance>> | null = null;
    if (process.env.ENABLE_WRITES === "true") {
      remote = await createAdvance({
        team_member_id: parsed.team_member_id,
        value: parsed.value,
        currency_id: parsed.currency_id,
        description: parsed.description,
      });
    }

    const [row] = await db()
      .insert(schema.advances)
      .values({
        vexpensesId: remote?.id ?? null,
        teamMemberId: parsed.team_member_id,
        teamMemberName: parsed.team_member_name ?? null,
        value: String(parsed.value),
        currencyCode: parsed.currency_code,
        description: parsed.description ?? null,
        createdBy: parsed.created_by ?? null,
      })
      .returning();

    await db()
      .insert(schema.auditLog)
      .values({
        action: "ADVANCE_CREATED",
        entity: "advance",
        entityId: String(row.id),
        payload: { parsed, remoteId: remote?.id ?? null },
      });

    revalidateTag("reports");
    return NextResponse.json({
      ok: true,
      advance: row,
      remote,
      enabled_writes: process.env.ENABLE_WRITES === "true",
    });
  } catch (e) {
    return handleApiError(e);
  }
}
