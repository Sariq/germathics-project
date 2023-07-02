const express = require('express');
const router = express.Router();
const _ = require('lodash');

const {
    paginateData
} = require('../lib/paginate');

router.get("/api/menu", async (req, res, next) => {
    let pageNum = 1;
    if (req.params.page) {
      pageNum = req.params.page;
    }
  
    // Get our paginated data
    const categories = await paginateData(
      false,
      req,
      pageNum,
      "categories",
      {},
      {}
    );
    const products = await paginateData(
        false,
        req,
        pageNum,
        "products",
        {},
        { productAddedDate: -1 }
      );
      const productsImagesList = [];
     const grouped =  _.groupBy(products.data, 'categoryId');

     Object.entries(grouped).forEach(([key, value]) => {
      grouped[key] = value.map((product)=> `https://creme-caramel-images.fra1.cdn.digitaloceanspaces.com/${product.img[0].uri}`)
    });
     //delete grouped['5'];
      console.log("grouped",grouped)
      products.data.forEach(product => {
        if(product.categoryId != '5'){
          productsImagesList.push(`https://creme-caramel-images.fra1.cdn.digitaloceanspaces.com/${product.img[0].uri}`)
        }
      });
      const menu = categories.data.map((category)=>{
          const tempCat = {
              ...category,
              products: products.data.filter((product)=> product.categoryId == category.categoryId)
          }
          return tempCat;
      })
    res.status(200).json({menu:menu, productsImagesList: productsImagesList, categoryImages: grouped});
});

module.exports = router;