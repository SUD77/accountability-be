import { Router } from "express";
import { createUser, listUsers } from "../controllers/usersController";

const usersRouter = Router();
usersRouter.post("/users", createUser);
usersRouter.get("/users", listUsers);

export default usersRouter;
