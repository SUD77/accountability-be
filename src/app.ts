import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import usersRouter from "./routes/usersRouter";
import streaksRouter from "./routes/streaksRouter";
import goalRouter from "./routes/goalsRouter";
import logsRouter from "./routes/logsRouter";
import authRouter from "./routes/auth"; 
import { errorHandler } from "./middleware/errorHandler";
import groupsRouter from "./routes/groupsRouter";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use(authRouter);

// existing routes
app.use(usersRouter);
app.use(streaksRouter);
app.use(goalRouter);
app.use(logsRouter);
app.use(groupsRouter);

// error handler LAST
app.use(errorHandler);

export default app;
