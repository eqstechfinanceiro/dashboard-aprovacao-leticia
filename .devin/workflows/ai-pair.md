---
description: Start a dual-AI pair-programming session where two Cascade personas collaborate on a file through a shared log.
---

# AI Pair Workflow

## Goal
Run two AI personas with complementary strengths (Architect + Implementer) to solve the same problem in the same codebase. They communicate through `AI_PAIR_LOG.md` and take turns modifying files.

## How to use

1. Trigger the workflow by typing `/ai-pair` in the Cascade chat.
2. The active AI will read `AI_PAIR_LOG.md`, determine whose turn it is, and act as that persona.
3. After each turn, the AI will update the log with its reasoning and the handoff.
4. When you want the other AI to continue, run `/ai-pair` again or mention `@ai-pair`.

## Personas

### AI-A: Architect
- Strengths: planning, system design, risk analysis, testing strategy.
- Responsibilities:
  - Decompose the problem.
  - Propose design and file changes.
  - Write a clear `Turn` entry in the log.
  - Do not modify code unless asked; focus on plans.

### AI-B: Implementer
- Strengths: writing code, debugging, minimal changes, verification.
- Responsibilities:
  - Read the previous Architect turn.
  - Implement the proposed changes in code.
  - Run any verification available (build, tests, lint, typecheck).
  - Write a `Turn` entry summarizing what was done.

## Protocol

The shared log file is `AI_PAIR_LOG.md` at the repository root.

### Log format

```markdown
# AI Pair Session Log

## Session: [short title]
### Goal
[one sentence describing what is being solved]

---

### Turn 1 — Architect
- **Thoughts:** [context, plan, design decisions]
- **Proposed files:**
  - `[file/path]`: [what should change]
- **Instructions to Implementer:** [clear, concrete next steps]

---

### Turn 2 — Implementer
- **Done:** [what was changed and why]
- **Files touched:**
  - `[file/path]`: [summary of changes]
- **Verification:** [commands run, results]
- **Blockers:** [anything that needs Architect input]
- **Next turn request:** [what the Architect should do next]

---
```

### Rules

1. **One turn at a time.** Each AI updates the log with exactly one `Turn` block before touching files.
2. **State is in the log.** The last `Turn` block determines which persona acts next.
3. **No guessing.** If the next AI is unclear, read the entire log and ask the user for direction.
4. **User override.** The human can interrupt at any time by typing a normal message.
5. **End session.** When the problem is solved, add a final `### Turn N — Closure` with a summary.

## Starting a new session

If `AI_PAIR_LOG.md` does not exist, create it from the template and start as **Architect**.

If the log exists and the last turn is from Architect, act as **Implementer**.
If the last turn is from Implementer, act as **Architect**.
