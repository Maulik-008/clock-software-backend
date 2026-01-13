import {
    Router,
    NextFunction,
    RequestHandler,
    Request,
    Response,
} from "express";
import { UserController } from "./user.controller";

const userRouter = Router();

const userController = new UserController();

userRouter.post("/signup", (async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    await userController.signup(req, res, next);
}) as unknown as RequestHandler);

export default userRouter;
