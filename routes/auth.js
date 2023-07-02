// const ROLES = require('../utils/roles');
const { expressjwt } = require("express-jwt");
const jwt = require("jsonwebtoken");
const { getId } = require("../lib/common");
const getTokenFromHeaders = async (req, res) => {
  const db = req.app.db;
  const {
    headers: { authorization },
  } = req;
  var token = authorization.split(" ")[1],
    decoded;
  try {
    decoded = jwt.verify(token, "secret");
  } catch (e) {
    console.log("E", e);
  }
  const cutomerId = decoded.id;
  // check for existing customer
  const customer = await db.customers.findOne({
    _id: getId(cutomerId),
  });

  if (!customer) {
    return null;
  }
  if (customer.token !== token) {
    return null;
  }

  if (authorization && authorization.split(" ")[0] === "Token") {
    return authorization.split(" ")[1];
  } else if (req.body.token) {
    return req.body.token;
  }
  return null;
};

const checkIsInRole = (...roles) => (req, res, next) => {
  const {
    body: { user },
  } = req;
  if (!user) {
    return res.status(400).json({
      errors: {
        password: "User is missing",
      },
    });
  }

  const hasRole = roles.find((role) => user.role === role);
  if (!hasRole) {
    return res.status(400).json({
      errors: {
        password: "Admin section!",
      },
    });
  }

  return next();
};

const auth = {
  required: expressjwt({
    secret: "secret",
    userProperty: "payload",
    getToken: getTokenFromHeaders,
    algorithms: ["HS256"],
  }),
  optional: expressjwt({
    secret: "secret",
    userProperty: "payload",
    getToken: getTokenFromHeaders,
    credentialsRequired: false,
    algorithms: ["HS256"],
  }),
  checkIsInRole: checkIsInRole,
};

module.exports = auth;
