import { Request, Response } from "express";
import {
    apiRateLimiter,
    chatRateLimiter,
    roomOperationRateLimiter,
} from "../rateLimit";

describe("Rate Limiting Middleware", () => {
    describe("apiRateLimiter", () => {
        it("should be defined and configured correctly", () => {
            expect(apiRateLimiter).toBeDefined();
            expect(typeof apiRateLimiter).toBe("function");
        });

        it("should have correct configuration", () => {
            // Access the options from the rate limiter
            const options = (apiRateLimiter as any).options;
            
            expect(options.windowMs).toBe(60 * 1000); // 1 minute
            expect(options.max).toBe(100); // 100 requests
            expect(options.standardHeaders).toBe(true);
            expect(options.legacyHeaders).toBe(false);
        });
    });

    describe("chatRateLimiter", () => {
        it("should be defined and configured correctly", () => {
            expect(chatRateLimiter).toBeDefined();
            expect(typeof chatRateLimiter).toBe("function");
        });

        it("should have correct configuration", () => {
            const options = (chatRateLimiter as any).options;
            
            expect(options.windowMs).toBe(60 * 60 * 1000); // 1 hour
            expect(options.max).toBe(1000); // 1000 messages
            expect(options.standardHeaders).toBe(true);
            expect(options.legacyHeaders).toBe(false);
        });
    });

    describe("roomOperationRateLimiter", () => {
        it("should be defined and configured correctly", () => {
            expect(roomOperationRateLimiter).toBeDefined();
            expect(typeof roomOperationRateLimiter).toBe("function");
        });

        it("should have correct configuration", () => {
            const options = (roomOperationRateLimiter as any).options;
            
            expect(options.windowMs).toBe(60 * 1000); // 1 minute
            expect(options.max).toBe(10); // 10 operations
            expect(options.standardHeaders).toBe(true);
            expect(options.legacyHeaders).toBe(false);
        });
    });

    describe("keyGenerator", () => {
        it("should use user ID when available", () => {
            const mockReq = {
                user: { id: 123 },
                ip: "192.168.1.1",
            } as any;

            const options = (apiRateLimiter as any).options;
            const key = options.keyGenerator(mockReq);

            expect(key).toBe("123");
        });

        it("should fallback to IP when user is not available", () => {
            const mockReq = {
                ip: "192.168.1.1",
            } as any;

            const options = (apiRateLimiter as any).options;
            const key = options.keyGenerator(mockReq);

            expect(key).toBe("192.168.1.1");
        });

        it("should use 'unknown' when neither user nor IP is available", () => {
            const mockReq = {} as any;

            const options = (apiRateLimiter as any).options;
            const key = options.keyGenerator(mockReq);

            expect(key).toBe("unknown");
        });
    });

    describe("handler", () => {
        it("should return 429 status with correct error format", () => {
            const mockReq = {} as Request;
            const mockRes = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            } as unknown as Response;

            const options = (apiRateLimiter as any).options;
            options.handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(429);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({
                        code: "RATE_LIMIT_EXCEEDED",
                        message: expect.any(String),
                        timestamp: expect.any(String),
                    }),
                })
            );
        });

        it("should return correct error code for chat rate limiter", () => {
            const mockReq = {} as Request;
            const mockRes = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            } as unknown as Response;

            const options = (chatRateLimiter as any).options;
            options.handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(429);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({
                        code: "CHAT_RATE_LIMIT_EXCEEDED",
                    }),
                })
            );
        });

        it("should return correct error code for room operation rate limiter", () => {
            const mockReq = {} as Request;
            const mockRes = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            } as unknown as Response;

            const options = (roomOperationRateLimiter as any).options;
            options.handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(429);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({
                        code: "ROOM_OPERATION_RATE_LIMIT_EXCEEDED",
                    }),
                })
            );
        });
    });
});
