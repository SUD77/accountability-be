import { Router } from "express";
import { upsertLogEntry, listLogEntries } from "../controllers/logsController";

const logsRouter = Router();
logsRouter.post("/log-entries", upsertLogEntry);
logsRouter.get("/log-entries", listLogEntries);

export default logsRouter;
