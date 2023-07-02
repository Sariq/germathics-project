const express = require('express');
const router = express.Router();
const colors = require("colors");
const websockets = require("../utils/websockets");

const {
    paginateData
} = require('../lib/paginate');

router.post("/api/admin/calander/disable/hour/insert", async (req, res) => {
    const db = req.app.db;
    const calanderObj = {
      date: req.body.date,
      hour: req.body.hour,
    };

    try {
        await db.calander.insertOne(calanderObj);
        websockets.fireWebscoketEvent();

          res.status(200).json(calanderObj);
      } catch (ex) {
        console.error(colors.red("Failed to insert calander disable hour: ", ex));
        res.status(400).json({
          message: "Customer creation failed.",
        });
      }

});

router.post("/api/admin/calander/enable/hour", async (req, res) => {
    const db = req.app.db;
    const calanderObj = {
      date: req.body.date,
      hour: req.body.hour,
    };

    try{
        const updateobj = { isDisabled: false };
        await db.calander.deleteOne({
            date: calanderObj.date, hour: calanderObj.hour });
            websockets.fireWebscoketEvent();

        return res.status(200).json({ message: 'Disabled Hour enabled successfully updated' });
    }catch(ex){
        console.info('Error updating calander enable hour', ex);
    }

});

router.get("/api/admin/calander/disabled/hours/:date", async (req, res, next) => {
    const db = req.app.db;
    const date = req.params.date;

    const calander = await db.calander
    .find({ date: date })
    // .sort({ created: -1 })
    .toArray();
    res.status(200).json(calander);
});

module.exports = router;