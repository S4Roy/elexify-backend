import { Op, Sequelize } from "sequelize";

export const paginationWithHavingGroupBy = async (
  searchParams,
  model,
  includeArray = null,
  cutomWhere = null,
  customAttributes = null,
  groupByQuery = null,
  havingQuery = null,
) => {
  const page = searchParams.page ? searchParams.page : "";
  const limit = searchParams.limit ? searchParams.limit : "";
  const sortBy = searchParams.sortBy ? searchParams.sortBy : "";
  const sortOrder = searchParams.sortOrder ? searchParams.sortOrder : "";
  const sortOrderObj = searchParams.sortOrderObj ? searchParams.sortOrderObj : null;
  const filterDt = searchParams.filterDt ? searchParams.filterDt : "";
  const distinct = searchParams.distinct ? searchParams.distinct : false;
  const subQuery = !searchParams.subQuery ? searchParams.subQuery : true;
  const raw = searchParams.raw ? searchParams.raw : false;
  const queryLog = searchParams.queryLog ? searchParams.queryLog : false;
  let limitQuery = {};
  let whereQuery = {};
  let orderQuery = {};
  let _newInclude = false;
  let _cutomWhere = {};

  orderQuery["order"] = [[`${"id"}`, `${"DESC"}`]];
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
  const findingQuery = {
    attributes: customAttributes,
    offset: limitQuery["offset"] ? limitQuery["offset"] : null,
    limit: limitQuery["limit"] ? limitQuery["limit"] : null,
    where: Object.assign(whereQuery, _cutomWhere),
    include: _newInclude,
    distinct: distinct || _newInclude ? true : false,
    order: Object.keys(orderQuery).length > 0 ? orderQuery.order : orderQuery,
    raw: raw ? true : false,
    subQuery: subQuery,
    group: groupByQuery != null && groupByQuery.length > 0 ? groupByQuery : false,
    logging: queryLog ? console.log : false,
  };
  if (havingQuery && havingQuery != null) {
    findingQuery.having = havingQuery;
  }
  const findingQueryAll = findingQuery;
  delete findingQueryAll.offset;
  delete findingQueryAll.limit;
  const [allRows, rows] = await Promise.all([
    model.findAll(findingQueryAll),
    model.findAll(findingQuery),
  ]);
  return { count: allRows ? allRows.length : 0, rows: rows };
};
