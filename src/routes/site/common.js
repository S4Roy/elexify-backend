import { Router } from "express";
import { commonController } from "../../controllers/site/index.js";

const commonRouter = Router();
commonRouter.get("/countries", commonController.countryList);
commonRouter.get("/states/:country_id", commonController.stateList);
commonRouter.get("/cities/:state_id", commonController.cityList);
commonRouter.get("/pincode/:pincode", commonController.pincodeLookup);
commonRouter.get("/reverse-geocode", commonController.reverseGeocode);
export { commonRouter };
