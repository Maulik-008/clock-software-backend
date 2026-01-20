import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import indexRouter from "./components/indexRoute";
import { globalErrorHandler } from "./middlewares/globalErrorHandler";

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Trust proxy for accurate IP addresses
app.set("trust proxy", 1);

app.get("/", (req: Request, res: Response) => {
    res.json({
        success: true,
        message: "Clock Software API is running!",
        version: "1.0.0",
    });
});

app.use("/api", indexRouter);
app.use(globalErrorHandler);

export default app;
