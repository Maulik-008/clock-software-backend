// src/utils/asyncHandler.ts
import { Request, Response, NextFunction, RequestHandler } from "express";

type AsyncFunction = (
    req: Request,
    res: Response,
    next: NextFunction,
) => Promise<void>;

export const asyncHandler = (fn: AsyncFunction): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction): void => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
