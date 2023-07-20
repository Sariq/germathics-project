const fs = require("fs");
const yenv = require("yenv");
if (fs.existsSync("./env.yaml")) {
  process.env = yenv("env.yaml", { strict: false });
}

const path = require("path");
const express = require("express");
const logger = require("morgan");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const moment = require("moment");
const _ = require("lodash");
const MongoStore = require("connect-mongodb-session")(session);
const numeral = require("numeral");
const helmet = require("helmet");
const colors = require("colors");
const cron = require("node-cron");
const crypto = require("crypto");
const websockets = require("./utils/websockets");

const {
  getConfig,
  getPaymentConfig,
  updateConfigLocal,
} = require("./lib/config");
const { runIndexing } = require("./lib/indexing");
const { addSchemas } = require("./lib/schema");
const { initDb, getDbUri } = require("./lib/db");
const { writeGoogleData } = require("./lib/googledata");
let handlebars = require("express-handlebars");
const cors = require("cors");
require("./config/passport");

// Validate our settings schema
const Ajv = require("ajv");
const ajv = new Ajv({ useDefaults: true });

// get config
const config = getConfig();

const baseConfig = ajv.validate(require("./config/settingsSchema"), config);
if (baseConfig === false) {
  console.log(colors.red(`settings.json incorrect: ${ajv.errorsText()}`));
  process.exit(2);
}

// require the routes
const index = require("./routes/index");
const admin = require("./routes/admin");
const category = require("./routes/category");
const student = require("./routes/student");
const employe = require("./routes/employe");
const product = require("./routes/product");
const menu = require("./routes/menu");
const customer = require("./routes/customer");
const calander = require("./routes/calander");
const translations = require("./routes/translations");
const geo = require("./routes/geo");
const store = require("./routes/store");
const order = require("./routes/order");
const user = require("./routes/user");
const transactions = require("./routes/transactions");
const reviews = require("./routes/reviews");

const app = express();

app.enable("trust proxy");
app.use(helmet());
app.set("port", process.env.PORT || 1111);
app.use(logger("dev"));
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.use(
  session({
    secret: "secret",
    cookie: { maxAge: 60000 },
    resave: false,
    saveUninitialized: false,
  })
);

app.use(express.json({}));

// Set locales from session

// Make stuff accessible to our router
app.use((req, res, next) => {
  //req.handlebars = handlebars;
  next();
});

// Setup the routes
app.use("/", index);
app.use("/", customer);
app.use("/", calander);
app.use("/", translations);
app.use("/", geo);
app.use("/", store);
app.use("/", category);
app.use("/", student);
app.use("/", employe);
app.use("/", product);
app.use("/", menu);
app.use("/", order);
app.use("/", user);
app.use("/", admin);
app.use("/", transactions);
app.use("/", reviews);

// Payment route(s)
// _.forEach(config.paymentGateway, (gateway) => {
//     app.use(`/${gateway}`, require(`./lib/payments/${gateway}`));
// });

// catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get("env") === "development") {
  app.use((err, req, res, next) => {
    res.status(err.status || 500);

    res.json({
      errors: {
        message: err.message,
        error: err,
      },
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use((err, req, res, next) => {
  console.error(colors.red(err.stack));
  if (err && err.code === "EACCES") {
    res.status(400).json({ message: "File upload error. Please try again." });
    return;
  }
  res.status(err.status || 500);
  res.json({
    errors: {
      message: err.message,
      error: {},
    },
  });
});

// Nodejs version check
const nodeVersionMajor = parseInt(
  process.version.split(".")[0].replace("v", "")
);
if (nodeVersionMajor < 7) {
  console.log(
    colors.red(
      `Please use Node.js version 7.x or above. Current version: ${nodeVersionMajor}`
    )
  );
  process.exit(2);
}

app.on("uncaughtException", (err) => {
  console.error(colors.red(err.stack));
  process.exit(2);
});

console.log("config.databaseConnectionString", config.databaseConnectionString);

initDb(config.databaseConnectionString, async (err, db) => {
  // On connection error we display then exit
  if (err) {
    console.log(colors.red(`Error connecting to MongoDB: ${err}`));
    process.exit(2);
  }

  // add db to app for routes
  app.db = db;
  app.config = config;
  app.port = app.get("port");
  const activeTrailSecret = await app.db.amazonconfigs.findOne({app: "activetrail"});
  //app.activeTrailSecret = activeTrailSecret.SECRET_KEY;
  // Fire up the cron job to clear temp held stock
  cron.schedule("*/1 * * * *", async () => {
    const validSessions = await db.sessions.find({}).toArray();
    const validSessionIds = [];
    _.forEach(validSessions, (value) => {
      validSessionIds.push(value._id);
    });

    // Remove any invalid cart holds
    await db.cart.deleteMany({
      sessionId: { $nin: validSessionIds },
    });
  });

  // Fire up the cron job to create google product feed
  cron.schedule("0 * * * *", async () => {
    await writeGoogleData(db);
  });

  // Create indexes on startup
  if (process.env.NODE_ENV !== "test") {
    try {
      await runIndexing(app);
    } catch (ex) {
      console.error(colors.red(`Error setting up indexes: ${ex.message}`));
    }
  }

  // Start cron job to index
  if (process.env.NODE_ENV !== "test") {
    cron.schedule("*/30 * * * *", async () => {
      try {
        await runIndexing(app);
      } catch (ex) {
        console.error(colors.red(`Error setting up indexes: ${ex.message}`));
      }
    });
  }

  // Set trackStock for testing
  if (process.env.NODE_ENV === "test") {
    config.trackStock = true;
  }

  // Process schemas
  await addSchemas();

  // Start the app
  try {
    const server = await app.listen(app.get("port"));
    console.log("APPJS")
    websockets.initWebSockets(server);

 
    app.emit("appStarted");
    if (process.env.NODE_ENV !== "test") {
      console.log(
        colors.green(
          `expressCart running on host: http://localhost:${app.get("port")}`
        )
      );
    }
  } catch (ex) {
    console.error(colors.red(`Error starting expressCart app:${ex.message}`));
    process.exit(2);
  }



});

module.exports = app;
