import { Op, Sequelize } from "sequelize";

export const pagination = async (
  searchParams,
  model,
  includeArray = null,
  cutomWhere = null,
  customAttributes = null,
) => {
  const page = searchParams.page ? searchParams.page : "";
  const limit = searchParams.limit ? searchParams.limit : "";
  const sortBy = searchParams.sortBy ? searchParams.sortBy : "";
  const sortOrder = searchParams.sortOrder ? searchParams.sortOrder : "";
  const sortOrderObj = searchParams.sortOrderObj ? searchParams.sortOrderObj : null;
  const filterDt = searchParams.filterDt ? searchParams.filterDt : "";
  const distinct = searchParams.distinct ? searchParams.distinct : false;
  const distinctCol = searchParams.distinctCol ? searchParams.distinctCol : false;
  const queryLog = searchParams.queryLog ? searchParams.queryLog : false;
  const subQuery = !searchParams.subQuery ? searchParams.subQuery : true;
  const raw = searchParams.raw ? searchParams.raw : false;
  const defaultOrder =
    typeof searchParams.defaultOrder == "undefined" ? true : searchParams.defaultOrder;

  let limitQuery = {};
  let whereQuery = {};
  let orderQuery = {};
  let _newInclude = false;
  let _cutomWhere = {};

  if (defaultOrder) {
    orderQuery["order"] = [[`${"id"}`, `${"DESC"}`]];
  } else {
    orderQuery = [];
  }
  if (page && limit) {
    limitQuery["offset"] = (parseInt(page) - 1) * parseInt(limit);
    limitQuery["limit"] = parseInt(limit);
  }

  if (sortOrderObj) {
    orderQuery["order"] = sortOrderObj;
  }

  if (sortBy && sortOrder && sortOrderObj == null) {
    orderQuery["order"] = [[`${sortBy}`, `${sortOrder}`]];
  }

  if (!sortBy && sortOrder && sortOrderObj == null) {
    orderQuery["order"] = [[`${"id"}`, `${sortOrder}`]];
  }

  if (filterDt) {
    const dtArr = filterDt.split(" ");
    const btnQuery =
      dtArr.length > 1
        ? {
            [Op.and]: [
              Sequelize.where(Sequelize.cast(Sequelize.col("created_at"), "DATE"), "BETWEEN", [
                dtArr[0],
                dtArr[1],
              ]),
            ],
          }
        : {
            [Op.and]: [
              Sequelize.where(Sequelize.cast(Sequelize.col("created_at"), "DATE"), "=", dtArr[0]),
            ],
          };
    whereQuery = Object.assign({
      created_at: btnQuery,
    });
  }

  if (cutomWhere === null) {
    _cutomWhere = {};
  } else {
    _cutomWhere = cutomWhere;
  }

  if (includeArray === null) {
    _newInclude = false;
  } else if (includeArray.length > 0) {
    _newInclude = includeArray;
  }

  return await model.findAndCountAll({
    attributes: customAttributes,
    offset: limitQuery["offset"] ? limitQuery["offset"] : null,
    limit: limitQuery["limit"] ? limitQuery["limit"] : null,
    where: Object.assign(whereQuery, _cutomWhere),
    include: _newInclude,
    distinct: distinct || _newInclude ? true : false,
    col: distinctCol,
    order: Object.keys(orderQuery).length > 0 ? orderQuery.order : orderQuery,
    raw: raw ? true : false,
    subQuery: subQuery,
    logging: queryLog ? console.log : false,
  });
};
