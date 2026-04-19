"use client";

import * as React from "react";
import { Send, Sparkles, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Quem são os 5 colaboradores com mais reembolso pendente?",
  "Existe algum setor com tempo médio de aprovação acima de 7 dias?",
  "Liste relatórios acima de R$ 5.000 aguardando aprovação.",
  "Qual centro de custo gastou mais nos últimos 30 dias?",
];

export function AIAdviceChat() {
  const [messages, setMessages] = React.useState<Message[]>([
    {
      role: "assistant",
      content:
        "Olá! Sou a IA Consultora. Posso responder perguntas analíticas com base nos dados sincronizados da VExpenses. Experimente uma das sugestões ou digite sua pergunta.",
    },
  ]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function send(text?: string) {
    const prompt = (text ?? input).trim();
    if (!prompt) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: prompt }]);
    setPending(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.answer ?? data.error ?? "—" },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Erro: ${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Chat contextual (beta)
        </CardTitle>
        <CardDescription>
          Este chat consulta as agregações em memória (tempo de aprovação,
          saldos, top colaboradores). Sem modelo LLM plugado ainda — as
          respostas são determinísticas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ScrollArea className="h-[420px] rounded-md border p-3">
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex"}
              >
                <div
                  className={
                    m.role === "user"
                      ? "flex max-w-[80%] items-start gap-2 rounded-lg bg-primary p-2 text-primary-foreground"
                      : "flex max-w-[80%] items-start gap-2 rounded-lg border bg-muted/40 p-2"
                  }
                >
                  {m.role === "user" ? (
                    <User className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                  <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                </div>
              </div>
            ))}
            {pending ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Bot className="h-3 w-3 animate-pulse text-primary" />
                Analisando…
              </div>
            ) : null}
          </div>
        </ScrollArea>

        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <Button
              key={s}
              size="xs"
              variant="outline"
              onClick={() => send(s)}
              disabled={pending}
            >
              {s}
            </Button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite uma pergunta…"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button type="submit" disabled={pending}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
