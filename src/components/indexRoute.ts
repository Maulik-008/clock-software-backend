import { Router } from "express";
import userRouter from "./user/user.route";

const indexRouter = Router();

indexRouter.use("/user", userRouter);

export default indexRouter;
