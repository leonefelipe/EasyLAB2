import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";

/**
 * tRPC context.
 *
 * Auth foi removido junto com o SDK Manus. Em Fase 1 (CRM real),
 * reintroduzimos auth se necessário usando JWT simples + tabela users.
 *
 * Por enquanto todos os procedures são públicos — seguro porque
 * o app roda apenas pelo Felipe, sem acesso externo.
 */
export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  return {
    req: opts.req,
    res: opts.res,
    user: null,
  };
}
