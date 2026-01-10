import { Router } from "express";
import { commonController } from "../../controllers/site/index.js";

const commonRouter = Router();
commonRouter.get("/countries", commonController.countryList);
commonRouter.get("/states/:country_id", commonController.stateList);
commonRouter.get("/cities/:state_id", commonController.cityList);
export { commonRouter };
