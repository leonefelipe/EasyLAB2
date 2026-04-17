import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { resumeRouter } from "./resumeRouter";
import { pdfRouter } from "./pdfRouter";
import { translateRouter } from "./translateRouter";
import { jobsRouter } from "./jobsRouter";
import { linkedInRouter } from "./linkedInRouter";
import { jobExtractorRouter } from "./jobExtractorRouter";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  resume: resumeRouter,
  pdf: pdfRouter,
  translate: translateRouter,
  jobs: jobsRouter,
  linkedin: linkedInRouter,
  jobExtractor: jobExtractorRouter,
});

export type AppRouter = typeof appRouter;
