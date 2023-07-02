const express = require("express");
const router = express.Router();
const colors = require("colors");

const { paginateData } = require("../lib/paginate");

const a = {
  key1: {
    ar: " aa",
    he: "bb",
  },
  key2: {
    ar: " aa",
    he: "bb",
  },
};

router.get("/api/getTranslations", async (req, res, next) => {
  const db = req.app.db;

  const dbTranslations = await db.translations
    .find()
    // .sort({ created: -1 })
    .toArray();
  const arTranslations = {};
  const heTranslations = {};

  dbTranslations.forEach((element) => {
    arTranslations[element.key] = element.ar || element.key;
    heTranslations[element.key] = element.he || element.key;
  });

  const translations = {
    arTranslations,
    heTranslations,
  };

  res.status(200).json(translations);
});

router.post("/api/translations/update", async (req, res, next) => {
  const db = req.app.db;
  const doc = req.body;

  await db.translations.updateOne(
    { key: doc.key },
    {
      $set: {
        ar: doc.ar,
        he: doc.he,
      },
    },
    { multi: false }
  );

  const dbTranslations = await db.translations
    .find()
    // .sort({ created: -1 })
    .toArray();

  const arTranslations = {};
  const heTranslations = {};

  dbTranslations.forEach((element) => {
    arTranslations[element.key] = element.ar || element.key;
    heTranslations[element.key] = element.he || element.key;
  });

  const translations = {
    arTranslations,
    heTranslations,
  };

  res.status(200).json(translations);
});

router.post("/api/translations/add", async (req, res, next) => {
  const db = req.app.db;
  const doc = req.body;

  await db.translations.insertOne(doc);

  const dbTranslations = await db.translations
    .find()
    // .sort({ created: -1 })
    .toArray();

  const arTranslations = {};
  const heTranslations = {};

  dbTranslations.forEach((element) => {
    arTranslations[element.key] = element.ar || element.key;
    heTranslations[element.key] = element.he || element.key;
  });

  const translations = {
    arTranslations,
    heTranslations,
  };

  res.status(200).json(translations);
});

router.get("/api/getTranslations", async (req, res, next) => {
  const db = req.app.db;

  const dbTranslations = await db.translations
    .find()
    // .sort({ created: -1 })
    .toArray();
  const arTranslations = {};
  const heTranslations = {};

  dbTranslations.forEach((element) => {
    arTranslations[element.key] = element.ar || element.key;
    heTranslations[element.key] = element.he || element.key;
  });

  const translations = {
    arTranslations,
    heTranslations,
  };

  res.status(200).json(translations);
});

router.post("/api/translations/delete", async (req, res, next) => {
  const db = req.app.db;
  const doc = req.body;
  await db.translations.deleteOne({ key: doc.key });

  const dbTranslations = await db.translations
    .find()
    .toArray();

  const arTranslations = {};
  const heTranslations = {};

  dbTranslations.forEach((element) => {
    arTranslations[element.key] = element.ar || element.key;
    heTranslations[element.key] = element.he || element.key;
  });

  const translations = {
    arTranslations,
    heTranslations,
  };

  res.status(200).json(translations);
});

module.exports = router;
