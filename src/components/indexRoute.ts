import { Router } from "express";
import userRouter from "./user/user.route";
import authRouter from "./auth/auth.route";
import studyRouter from "./study/study.route";
import roomRouter from "./room/room.route";
import adminRouter from "./admin/admin.routes";

const indexRouter = Router();

indexRouter.use("/auth", authRouter);
indexRouter.use("/user", userRouter);
indexRouter.use("/sessions", studyRouter);
indexRouter.use("/rooms", roomRouter);
indexRouter.use("/admin", adminRouter);

export default indexRouter;
