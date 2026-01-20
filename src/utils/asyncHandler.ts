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

// Generic version that accepts any request type
export const asyncHandlerGeneric = <T extends Request = Request>(
    fn: (req: T, res: Response, next: NextFunction) => Promise<void>
): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction): void => {
        Promise.resolve(fn(req as T, res, next)).catch(next);
    };
};
