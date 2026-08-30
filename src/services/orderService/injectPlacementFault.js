export const injectPlacementFault = async (req, stage) => {
  if (process.env.NODE_ENV === "test" && typeof req?.app?.locals?.orderPlacementFaultInjector === "function") {
    await req.app.locals.orderPlacementFaultInjector(stage);
  }
};

