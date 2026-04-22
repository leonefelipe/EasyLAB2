import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { resumeRouter } from "./resumeRouter";
import { pdfRouter } from "./pdfRouter";
import { translateRouter } from "./translateRouter";
import { jobsRouter } from "./jobsRouter";
import { linkedinRouter } from "./linkedInRouter";
import { jobExtractorRouter } from "./jobExtractorRouter";
import { premiumReportRouter } from "./premiumReportRouter";

export const appRouter = router({
  system: systemRouter,
  resume: resumeRouter,
  pdf: pdfRouter,
  translate: translateRouter,
  jobs: jobsRouter,
  linkedin: linkedinRouter,
  jobExtractor: jobExtractorRouter,
  premiumReport: premiumReportRouter,
});

export type AppRouter = typeof appRouter;
