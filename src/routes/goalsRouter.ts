import { Router } from "express";
import { createGoal, listGoals } from "../controllers/goalsController";

const goalRouter = Router();
goalRouter.post("/goals", createGoal);
goalRouter.get("/goals", listGoals);

export default goalRouter;
