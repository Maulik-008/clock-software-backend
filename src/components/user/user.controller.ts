import { NextFunction, Request, Response } from "express";
export class UserController {
    constructor() {}

    async signup(req: Request, res: Response, next: NextFunction) {
        try {
            res.status(201).json({
                success: true,
                message: "User signed up successfully",
            });
        } catch (error) {
            next(error);
        }
    }
    async login() {}
}
