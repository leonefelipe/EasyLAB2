import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { resumeRouter } from "./resumeRouter";
import { pdfRouter } from "./pdfRouter";
import { translateRouter } from "./translateRouter";
import { jobsRouter } from "./jobsRouter";
import { linkedinRouter } from "./linkedInRouter";
import { jobExtractorRouter } from "./jobExtractorRouter";

/**
 * Root tRPC router — EasyLAB2 v2.
 *
 * Auth (cookies de sessão + OAuth Manus) foi removido na Fase 0.
 * Quando introduzirmos auth real, voltará como router próprio.
 *
 * Na Fase 1 adiciona-se: clientsRouter, projectsRouter, analysesRouter
 * para migrar o CRM do localStorage para MySQL.
 */
export const appRouter = router({
  system: systemRouter,
  resume: resumeRouter,
  pdf: pdfRouter,
  translate: translateRouter,
  jobs: jobsRouter,
  linkedin: linkedinRouter,
  jobExtractor: jobExtractorRouter,
});

export type AppRouter = typeof appRouter;
