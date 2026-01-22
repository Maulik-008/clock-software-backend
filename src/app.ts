import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import indexRouter from "./components/indexRoute";
import { globalErrorHandler } from "./middlewares/globalErrorHandler";
import { requestLoggingMiddleware } from "./middlewares/requestLogging";

const app = express();

// Security middleware - Enhanced helmet configuration
// Requirement 10.3, 10.4, 10.5: Security headers and IP privacy
app.use(helmet({
    // Content Security Policy
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    // Strict Transport Security - Force HTTPS
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
    },
    // Prevent clickjacking
    frameguard: {
        action: "deny",
    },
    // Prevent MIME type sniffing
    noSniff: true,
    // XSS Protection
    xssFilter: true,
    // Hide X-Powered-By header
    hidePoweredBy: true,
    // Referrer Policy
    referrerPolicy: {
        policy: "strict-origin-when-cross-origin",
    },
}));

// CORS configuration for public endpoints
// Requirement 10.3: Configure CORS for public endpoints
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
    maxAge: 86400, // 24 hours
}));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Trust proxy for accurate IP addresses
// Requirement 10.1, 10.2: Accurate IP extraction for hashing
app.set("trust proxy", 1);

// Request logging middleware for monitoring
// Requirement 10.5: Add request logging for monitoring
app.use(requestLoggingMiddleware);

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
