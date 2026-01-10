import { Router } from "express";
import { specificationRouter } from "./specification.js";

const masterRouter = Router();
// All routes go here
masterRouter.use("/specification", specificationRouter);

export { masterRouter };
