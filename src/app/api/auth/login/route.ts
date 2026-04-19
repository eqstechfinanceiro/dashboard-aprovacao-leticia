import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authConfig,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  safeEqual,
  signSession,
} from "@/lib/auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  user: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Informe usuário e senha." },
      { status: 400 },
    );
  }

  const cfg = authConfig();
  const userOk = safeEqual(parsed.user, cfg.user);
  const passOk = safeEqual(parsed.password, cfg.password);
  if (!userOk || !passOk) {
    return NextResponse.json(
      { error: "Usuário ou senha inválidos." },
      { status: 401 },
    );
  }

  const token = await signSession(cfg.user);
  const res = NextResponse.json({
    ok: true,
    user: cfg.user,
    usingDefaults: cfg.usingDefaults,
  });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
