const express = require('express');
const router = express.Router();
const {
    paginateData
} = require('../lib/paginate');

router.get("/api/store", async (req, res, next) => {
    let pageNum = 1;
    if (req.params.page) {
      pageNum = req.params.page;
    }
  
    // Get our paginated data

    const stores = await paginateData(
        false,
        req,
        pageNum,
        "store",
        {},
      );

    res.status(200).json(stores);
});

module.exports = router;