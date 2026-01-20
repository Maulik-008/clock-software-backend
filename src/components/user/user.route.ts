import { Router, Request, Response, NextFunction } from "express";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { authenticate, requireRole } from "../../middlewares/authentication";
import { updateProfileValidation, changePasswordValidation } from "./user.validation";

const userRouter = Router();

const userService = new UserService();
const userController = new UserController(userService);

// Wrapper functions to handle typing
const handleGetStats = async (req: Request, res: Response, next: NextFunction) => {
    await userController.getStudentStats(req, res, next);
};

const handleGetAllUsers = async (req: Request, res: Response, next: NextFunction) => {
    await userController.getAllUsers(req, res, next);
};

const handleGetUser = async (req: Request, res: Response, next: NextFunction) => {
    await userController.getUser(req, res, next);
};

const handleUpdateProfile = async (req: Request, res: Response, next: NextFunction) => {
    await userController.updateProfile(req, res, next);
};

const handleChangePassword = async (req: Request, res: Response, next: NextFunction) => {
    await userController.changePassword(req, res, next);
};

const handleDeleteAccount = async (req: Request, res: Response, next: NextFunction) => {
    await userController.deleteAccount(req, res, next);
};

// Public routes (admin only)
// @ts-ignore
userRouter.get("/stats", authenticate, requireRole(["SUPER_ADMIN"]), handleGetStats);

// @ts-ignore
userRouter.get("/", authenticate, requireRole(["SUPER_ADMIN"]), handleGetAllUsers);

// @ts-ignore
userRouter.get("/:id", authenticate, requireRole(["SUPER_ADMIN"]), handleGetUser);

// Protected routes (authenticated users)
// @ts-ignore
userRouter.put("/profile", authenticate, updateProfileValidation, handleUpdateProfile);

// @ts-ignore
userRouter.put("/change-password", authenticate, changePasswordValidation, handleChangePassword);

// @ts-ignore
userRouter.delete("/account", authenticate, handleDeleteAccount);

export default userRouter;
