import { Request, Response } from "express";
import { candidateRecommendationService } from "../services/candidate_recommendation.service";

export const candidateRecommendationController = {
  getProfile: async (req: Request, res: Response) => {
    const data = await candidateRecommendationService.getRecommendationProfile(
      req.user!.id,
    );
    return res.json(data);
  },

  putProfile: async (req: Request, res: Response) => {
    const data = await candidateRecommendationService.putRecommendationProfile(
      req.user!.id,
      req.body,
    );
    return res.json(data);
  },

  getRecommendedJobs: async (req: Request, res: Response) => {
    res.set(
      "Cache-Control",
      "private, no-store, must-revalidate, max-age=0",
    );
    const data = await candidateRecommendationService.getRecommendedJobs(
      req.user!.id,
      req.query as { page?: number; limit?: number },
    );
    return res.json(data);
  },
};
