import { z } from "zod";
import { publicProcedure, router } from "./trpc";

/**
 * System-level tRPC procedures.
 *
 * Atualmente só health-check.
 * Notificações push (notifyOwner) foram removidas com o SDK Manus.
 * Quando precisar, substituir por serviço próprio (e.g. email via Resend).
 */
export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
      version: "2.0.0",
    })),
});
