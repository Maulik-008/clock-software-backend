import express, { Request, Response } from "express";
import { globalErrorHandler } from "./common/middlewares/globalErrorHandler";
import indexRouter from "./components/indexRoute";

const app = express();

app.get("/", (req: Request, res: Response) => {
    res.send("Hello World!");
});

app.use("/api", indexRouter);
app.use(globalErrorHandler);

export default app;
