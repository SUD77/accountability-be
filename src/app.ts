import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import usersRouter from "./routes/usersRouter";
import streaksRouter from "./routes/streaksRouter";
import goalRouter from "./routes/goalsRouter";
import authRouter from "./routes/auth"; 
import { errorHandler } from "./middleware/errorHandler";
import groupsRouter from "./routes/groupsRouter";
import membershipsRouter from "./routes/membershipRouter";
import invitesRouter from "./routes/invitesRouter";
import logEntriesRouter from "./routes/logEntriesRouter";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use(authRouter);

// existing routes
app.use(usersRouter);
app.use(streaksRouter);
app.use(goalRouter);
app.use(groupsRouter);
app.use(membershipsRouter);
app.use(invitesRouter);
app.use(goalRouter);
app.use(logEntriesRouter);

// error handler LAST
app.use(errorHandler);

export default app;
