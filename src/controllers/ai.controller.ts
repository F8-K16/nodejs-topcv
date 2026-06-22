import { Request, Response } from "express";
import { aiService } from "../services/ai.service";

export const aiController = {
  cvSuggest: async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const data = await aiService.suggestCvSection(userId ?? 0, req.body);
    return res.json(data);
  },
  coverLetter: async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const data = await aiService.generateCoverLetter(userId ?? 0, req.body);
    return res.json(data);
  },
  jobQuestions: async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const data = await aiService.suggestJobQuestions(userId ?? 0, req.body);
    return res.json(data);
  },
  cvReviewJob: async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const data = await aiService.reviewCvForJob(userId ?? 0, req.body);
    return res.json(data);
  },
};
