import { previewBuyAgain, addBuyAgain } from "../../../../services/buyAgain/index.js";

export const buyAgainPreview = async (req, res, next) => {
  try {
    const data = await previewBuyAgain(req.auth?.user_id, req.query.order_id);
    res.status(200).json({ status: "success", data });
  } catch (error) { next(error); }
};

export const buyAgainAdd = async (req, res, next) => {
  try {
    const data = await addBuyAgain(req.auth?.user_id, req.body.order_id, req.body.items);
    res.status(200).json({ status: "success", data });
  } catch (error) { next(error); }
};
