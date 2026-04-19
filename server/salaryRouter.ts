import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { estimateSalary, getMarketBenchmarks, getMarketTrends } from "./salaryEngine";
import type { Seniority, Region } from "./salaryData";

const SeniorityEnum = z.enum(["estagio", "junior", "pleno", "senior", "gerente", "diretor", "clevel"]);
const RegionEnum    = z.enum(["sp", "rj", "sul", "nordeste", "co", "remoto", "brasil"]);

export const salaryRouter = router({

  // GET /salary-estimate
  estimate: publicProcedure
    .input(z.object({
      role:              z.string().min(2),
      seniority:         SeniorityEnum,
      industry:          z.string().optional(),
      region:            z.string().optional(),
      skills:            z.array(z.string()).optional(),
      yearsExperience:   z.number().min(0).max(50).optional(),
    }))
    .query(({ input }) => {
      return estimateSalary({
        role:            input.role,
        seniority:       input.seniority as Seniority,
        industry:        input.industry,
        region:          input.region,
        skills:          input.skills,
        yearsExperience: input.yearsExperience,
      });
    }),

  // Also as mutation for POST use
  estimateMutation: publicProcedure
    .input(z.object({
      role:              z.string().min(2),
      seniority:         SeniorityEnum,
      industry:          z.string().optional(),
      region:            z.string().optional(),
      skills:            z.array(z.string()).optional(),
      yearsExperience:   z.number().min(0).max(50).optional(),
    }))
    .mutation(({ input }) => {
      return estimateSalary({
        role:            input.role,
        seniority:       input.seniority as Seniority,
        industry:        input.industry,
        region:          input.region,
        skills:          input.skills,
        yearsExperience: input.yearsExperience,
      });
    }),

  // GET /salary-benchmarks
  benchmarks: publicProcedure
    .input(z.object({ category: z.string().min(2) }))
    .query(({ input }) => {
      const records = getMarketBenchmarks(input.category);
      return {
        category: input.category,
        count: records.length,
        records: records.map(r => ({
          role:       r.role,
          seniority:  r.seniority,
          industry:   r.industry,
          region:     r.region,
          cltMin:     r.cltMin,
          cltMedian:  r.cltMedian,
          cltMax:     r.cltMax,
          confidence: r.confidence,
          source:     r.source,
        })),
      };
    }),

  // GET /market-trends
  trends: publicProcedure
    .input(z.object({ category: z.string().min(2) }))
    .query(({ input }) => {
      const trends = getMarketTrends(input.category);
      return {
        category: input.category,
        trends: trends ?? [],
        dataAvailable: trends !== null && trends.length > 0,
      };
    }),
});
