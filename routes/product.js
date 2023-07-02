const express = require("express");
const { restrict, checkAccess } = require("../lib/auth");
const {
  getId,
  clearSessionValue,
  cleanHtml,
  convertBool,
  checkboxBool,
  safeParseInt,
  getImages,
} = require("../lib/common");
const AWS = require("aws-sdk");
var multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const websockets = require("../utils/websockets");

// import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
var {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const { indexProducts } = require("../lib/indexing");
const { validateJson } = require("../lib/schema");
const { paginateData } = require("../lib/paginate");
const colors = require("colors");
const rimraf = require("rimraf");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const BUCKET_NAME = "creme-caramel-images";
const spacesEndpoint = new AWS.Endpoint(
  "https://creme-caramel-images.fra1.digitaloceanspaces.com"
);

const uploadFile = async (files, req, folderName) => {
  const db = req.app.db;
  const amazonConfig = await db.amazonconfigs.findOne({ app: "amazon" });
  let locationslist = [];
  let counter = 0;

  return new Promise((resolve, reject) => {
    const s3Client = new S3Client({
      endpoint: "https://fra1.digitaloceanspaces.com", // Find your endpoint in the control panel, under Settings. Prepend "https://".
      //forcePathStyle: false, // Configures to use subdomain/virtual calling format.
      region: "FRA1", // Must be "us-east-1" when creating new Spaces. Otherwise, use the region in your endpoint (e.g. nyc3).
      credentials: {
        accessKeyId: amazonConfig["ID_KEY"], // Access key pair. You can create access key pairs using the control panel or API.
        secretAccessKey: amazonConfig["SECRET_KEY"], // Secret access key defined through an environment variable.
      },
    });
    files = files.filter((file) => file.originalname !== "existingImage");
    console.log("X3");
    if (files.length > 0) {
      files.forEach(async (file, i) => {
        const fileName = `${new Date().getTime()}` + file.originalname;
        const folder = folderName || "products";
        const params = {
          Bucket: BUCKET_NAME, // The path to the directory you want to upload the object to, starting with your Space name.
          Key: `${folder}/${fileName}`, // Object key, referenced whenever you want to access this file later.
          Body: file.buffer, // The object's contents. This variable is an object, not a string.
          ACL: "public-read",
        };

        try {
          console.log("X4");

          const data = await s3Client.send(new PutObjectCommand(params));
          locationslist.push({ uri: params.Key });
          counter++;
          console.log("X5");

          if (counter === files.length) {
            console.log("X6");
            resolve(locationslist);
          }
        } catch (err) {
          console.log("Error", err);
        }
      });
    } else {
      resolve(locationslist);
    }
  });
};

const deleteImages = async (images, req) => {
  const db = req.app.db;
  const amazonConfig = await db.amazonconfigs.findOne({ app: "amazon" });
  return new Promise((resolve, reject) => {
    const s3Client = new S3Client({
      endpoint: "https://fra1.digitaloceanspaces.com", // Find your endpoint in the control panel, under Settings. Prepend "https://".
      region: "FRA1", // Must be "us-east-1" when creating new Spaces. Otherwise, use the region in your endpoint (e.g. nyc3).
      credentials: {
        accessKeyId: amazonConfig["ID_KEY"], // Access key pair. You can create access key pairs using the control panel or API.
        secretAccessKey: amazonConfig["SECRET_KEY"], // Secret access key defined through an environment variable.
      },
    });

    images?.forEach(async (img) => {
      const bucketParams = { Bucket: BUCKET_NAME, Key: img.uri };
      try {
        const data = await s3Client.send(new DeleteObjectCommand(bucketParams));
        console.log("Success. Object deleted.", data);
      } catch (err) {
        console.log("Error", err);
      }
    });
    resolve(true);
  });
};

// insert new product form action
router.post(
  "/api/admin/images/upload",
  upload.array("img"),
  async (req, res, next) => {
    const db = req.app.db;
    const body = { ...req.body };

    let imagesList = [];
    if (req.files && req.files.length > 0) {
      imagesList = await uploadFile(req.files, req, "birthday");
    }

    if (imagesList?.length > 0) {
      imagesList.forEach((image) => {
        const doc = {
          data: image,
          type: "birthday",
          subType: body.subType
        };
        db.images.insertOne(doc);
      });

      res.status(200).json({
        message: "New product successfully created",
      });
    } else {
      console.log(colors.red(`Error inserting images`));
      res.status(400).json({ message: "Error inserting images" });
    }
  }
);
// insert new product form action
router.post(
  "/api/admin/product/insert",
  upload.array("img"),
  async (req, res, next) => {
    const db = req.app.db;
    // try{
    //   const amazonConfig = await db.amazonconfigs.findOne({});
    //   console.log("amazonConfig",amazonConfig)
    // }catch(e){
    //   console.log(e)
    // }
    const orderDoc = { ...req.body };
    let doc = {
      nameAR: req.body.nameAR,
      nameHE: req.body.nameHE,
      categoryId: req.body.categoryId,
      descriptionAR: cleanHtml(req.body.descriptionAR),
      descriptionHE: cleanHtml(req.body.descriptionHE),
      // mediumPrice: Number(req.body.mediumPrice),
      // largePrice: Number(req.body.largePrice),
      // mediumCount: Number(req.body.mediumCount),
      // largeCount: Number(req.body.largeCount),
      isInStore: req.body.isInStore === "false" ? false : true,
      isUploadImage: req.body.isUploadImage === "false" ? false : true,
      createdAt: new Date(),
    };

    if(req.body.subCategoryId){
      doc.subCategoryId = req.body.subCategoryId;
    }
    doc.extras = {
      ...doc.extras,
      counter: {
        type: "COUNTER",
        value: 1,
      },
    };

    doc.extras = {
      ...doc.extras,
      size: {
        options: {
          medium:{
            price: Number(req.body.mediumPrice),
            count: Number(req.body.mediumCount)
          },
          large: {
            price: Number(req.body.largePrice),
            count: Number(req.body.largeCount)
          }
        },
        type: "oneChoice",
        value: "medium",
      },
    };

    if (doc.isUploadImage) {
      doc.extras = {
        ...doc.extras,
        image: {
          type: "uploadImage",
          value: null,
        },
      };
    }

    // doc.img = JSON.parse(req.body.img);
    // doc.img = req.body.img.filter(file=> !file.isNew)
    if (req.files && req.files.length > 1) {
      doc.img = req.body.img.concat(await uploadFile(req.files, req));
    } else {
      doc.img = await uploadFile(req.files, req);
    }
    // Validate the body again schema
    // const schemaValidate = validateJson('newProduct', doc);
    // if(!schemaValidate.result){
    //     if(process.env.NODE_ENV !== 'test'){
    //         console.log('schemaValidate errors', schemaValidate.errors);
    //     }
    //     res.status(400).json(schemaValidate.errors);
    //     return;
    // }
    // Check permalink doesn't already exist
    // const product = await db.products.countDocuments({ name: req.body.nameAR });
    // console.log("productproduct",product)

    // if (product > 0 && req.body.nameAR !== "") {
    //   res
    //     .status(400)
    //     .json({ message: "product already exists. Pick a new one." });
    //   return;
    // }

    try {
      const newDoc = await db.products.insertOne(doc);
      // get the new ID
      const newId = newDoc.insertedId;
      websockets.fireWebscoketEvent();
      // add to lunr index
      indexProducts(req.app).then(() => {
        res.status(200).json({
          message: "New product successfully created",
          productId: newId,
        });
      });
    } catch (ex) {
      console.log(colors.red(`Error inserting document: ${ex}`));
      res.status(400).json({ message: "Error inserting document" });
    }
  }
);

// Update an existing product form action
router.post(
  "/api/admin/product/update",
  upload.array("img"),
  async (req, res) => {
    const db = req.app.db;

    const product = await db.products.findOne({
      _id: getId(req.body.productId),
    });

    if (!product) {
      res.status(400).json({ message: "Failed to update product" });
      return;
    }
    let productDoc = {
      nameAR: req.body.nameAR,
      nameHE: req.body.nameHE,
      categoryId: req.body.categoryId,
      descriptionAR: cleanHtml(req.body.descriptionAR),
      descriptionHE: cleanHtml(req.body.descriptionHE),
      subCategoryId: req.body.subCategoryId,
      // mediumPrice: Number(req.body.mediumPrice),
      // largePrice: Number(req.body.largePrice),
      // mediumCount: Number(req.body.mediumCount),
      // largeCount: Number(req.body.largeCount),
      isInStore: req.body.isInStore === "false" ? false : true,
      isUploadImage: req.body.isUploadImage === "false" ? false : true,
      updatedAt: new Date(),
    };
    if (req.files) {
      if (req.files.length > 0) {
        productDoc.img = await uploadFile(req.files, req);
        await deleteImages(product.img, req);
      }
    }

    productDoc.extras = {
      ...productDoc.extras,
      counter: {
        type: "COUNTER",
        value: 1,
      },
    };
    productDoc.extras = {
      ...productDoc.extras,
      size: {
        options: {
          medium:{
            price: Number(req.body.mediumPrice),
            count: Number(req.body.mediumCount)
          },
          large: {
            price: Number(req.body.largePrice),
            count: Number(req.body.largeCount)
          }
        },
        type: "oneChoice",
        value: req.body.mediumCount > 0 ? "medium" : "large",
      },
    };

    if (productDoc.isUploadImage) {
      productDoc.extras = {
        ...productDoc.extras,
        image: {
          type: "uploadImage",
          value: null,
        },
      };
    }

    try {
      await db.products.updateOne(
        { _id: getId(req.body.productId) },
        { $set: productDoc },
        {}
      );
      websockets.fireWebscoketEvent();

      // Update the index
      indexProducts(req.app).then(() => {
        res
          .status(200)
          .json({ message: "Successfully saved", product: productDoc });
      });
    } catch (ex) {
      res.status(400).json({ message: "Failed to save. Please try again" });
    }

    return;

    // const count = await db.products.countDocuments({
    //   productPermalink: req.body.productPermalink,
    //   _id: { $ne: getId(product._id) },
    // });
    // if (count > 0 && req.body.productPermalink !== "") {
    //   res
    //     .status(400)
    //     .json({ message: "Permalink already exists. Pick a new one." });
    //   return;
    // }

    // const images = await getImages(req.body.productId, req, res);
    // let productDoc = {
    //   name: req.body.name,
    //   categoryId: req.body.categoryId,
    //   description: cleanHtml(req.body.description),
    //   price: cleanHtml(req.body.price),
    //   count: cleanHtml(req.body.count),
    //   updatedAt: new Date(),
    // };

    // // Validate the body again schema
    // const schemaValidate = validateJson("editProduct", productDoc);
    // if (!schemaValidate.result) {
    //   res.status(400).json(schemaValidate.errors);
    //   return;
    // }

    // // Remove productId from doc
    // delete productDoc.productId;

    // // if no featured image
    // if (!product.productImage) {
    //   if (images.length > 0) {
    //     productDoc.productImage = images[0].path;
    //   } else {
    //     productDoc.productImage = "/uploads/placeholder.png";
    //   }
    // } else {
    //   productDoc.productImage = product.productImage;
    // }

    // try {
    //   await db.products.updateOne(
    //     { _id: getId(req.body.productId) },
    //     { $set: productDoc },
    //     {}
    //   );
    //   // Update the index
    //   indexProducts(req.app).then(() => {
    //     res
    //       .status(200)
    //       .json({ message: "Successfully saved", product: productDoc });
    //   });
    // } catch (ex) {
    //   res.status(400).json({ message: "Failed to save. Please try again" });
    // }
  }
);

// delete a product
router.post("/api/admin/product/delete", async (req, res) => {
  const db = req.app.db;
  try {
    const objectIdsList = req.body.productsIdsList.map((id) => {
      return getId(id);
    });

    const results = await db.products
      .find({ _id: { $in: objectIdsList } })
      .toArray();

    await results.forEach(async (product) => {
      await deleteImages(product.img, req);
    });
    await db.products.deleteMany({ _id: { $in: objectIdsList } }, {});
    websockets.fireWebscoketEvent();

    // Remove the variants
    //await db.variants.deleteMany({ product: getId(req.body.productId) }, {});

    // re-index products
    indexProducts(req.app).then(() => {
      res.status(200).json({ message: "Product successfully deleted" });
    });
  } catch (e) {
    console.log(e);
    res.status(200).json({ message: e });
  }
  // });
});

router.get("/admin/products/:page?", async (req, res, next) => {
  let pageNum = 1;
  if (req.params.page) {
    pageNum = req.params.page;
  }
  console.log("xx");
  // Get our paginated data
  const products = await paginateData(
    false,
    req,
    pageNum,
    "products",
    {},
    { productAddedDate: -1 }
  );
  res.status(200).json(products.data);
});

router.get("/admin/products/category/:id/:page?", async (req, res, next) => {
  let pageNum = 1;
  if (req.params.page) {
    pageNum = req.params.page;
  }

  // Get our paginated data
  const products = await paginateData(
    false,
    req,
    pageNum,
    "products",
    { categoryId: req.params.id },
    { productAddedDate: -1 }
  );
  res.status(200).json(products.data);
});

router.get(
  "/admin/products/filter/:search",
  restrict,
  async (req, res, next) => {
    const db = req.app.db;
    const searchTerm = req.params.search;
    const productsIndex = req.app.productsIndex;

    const lunrIdArray = [];
    productsIndex.search(searchTerm).forEach((id) => {
      lunrIdArray.push(getId(id.ref));
    });

    // we search on the lunr indexes
    const results = await db.products
      .find({ _id: { $in: lunrIdArray } })
      .toArray();

    if (req.apiAuthenticated) {
      res.status(200).json(results);
      return;
    }

    res.render("products", {
      title: "Results",
      results: results,
      resultType: "filtered",
      admin: true,
      config: req.app.config,
      session: req.session,
      searchTerm: searchTerm,
      message: clearSessionValue(req.session, "message"),
      messageType: clearSessionValue(req.session, "messageType"),
      helpers: req.handlebars.helpers,
    });
  }
);

// insert form
router.get("/admin/product/new", restrict, checkAccess, (req, res) => {
  res.render("product-new", {
    title: "New product",
    session: req.session,
    productTitle: clearSessionValue(req.session, "productTitle"),
    productDescription: clearSessionValue(req.session, "productDescription"),
    productPrice: clearSessionValue(req.session, "productPrice"),
    productPermalink: clearSessionValue(req.session, "productPermalink"),
    message: clearSessionValue(req.session, "message"),
    messageType: clearSessionValue(req.session, "messageType"),
    editor: true,
    admin: true,
    helpers: req.handlebars.helpers,
    config: req.app.config,
  });
});

// get product by id
router.get("/admin/product/:id", async (req, res) => {
  const db = req.app.db;

  const product = await db.products.findOne({ _id: getId(req.params.id) });
  if (!product) {
    // If API request, return json
    if (req.apiAuthenticated) {
      res.status(400).json({ message: "Product not found" });
      return;
    }
    return;
  }

  // If API request, return json

  res.status(200).json(product);
  return;
});

router.get("/admin/:categoryId/product", async (req, res) => {
  const db = req.app.db;

  const product = await db.products.findOne({
    categoryId: getId(req.params.categoryId),
  });
  if (!product) {
    // If API request, return json
    if (req.apiAuthenticated) {
      res.status(400).json({ message: "Product not found" });
      return;
    }
    return;
  }

  // If API request, return json

  res.status(200).json(product);
  return;
});

// render the editor
router.get(
  "/admin/product/edit/:id",
  restrict,
  checkAccess,
  async (req, res) => {
    const db = req.app.db;

    const images = await getImages(req.params.id, req, res);
    const product = await db.products.findOne({ _id: getId(req.params.id) });
    if (!product) {
      // If API request, return json
      if (req.apiAuthenticated) {
        res.status(400).json({ message: "Product not found" });
        return;
      }
      req.session.message = "Product not found";
      req.session.messageType = "danger";
      res.redirect("/admin/products");
      return;
    }

    // Get variants
    product.variants = await db.variants
      .find({ product: getId(req.params.id) })
      .toArray();

    // If API request, return json
    if (req.apiAuthenticated) {
      res.status(200).json(product);
      return;
    }

    res.render("product-edit", {
      title: "Edit product",
      result: product,
      images: images,
      admin: true,
      session: req.session,
      message: clearSessionValue(req.session, "message"),
      messageType: clearSessionValue(req.session, "messageType"),
      config: req.app.config,
      editor: true,
      helpers: req.handlebars.helpers,
    });
  }
);

// Add a variant to a product
router.post(
  "/admin/product/addvariant",
  restrict,
  checkAccess,
  async (req, res) => {
    const db = req.app.db;

    const variantDoc = {
      product: req.body.product,
      title: req.body.title,
      price: req.body.price,
      stock: safeParseInt(req.body.stock) || null,
    };

    // Validate the body again schema
    const schemaValidate = validateJson("newVariant", variantDoc);
    if (!schemaValidate.result) {
      if (process.env.NODE_ENV !== "test") {
        console.log("schemaValidate errors", schemaValidate.errors);
      }
      res.status(400).json(schemaValidate.errors);
      return;
    }

    // Check product exists
    const product = await db.products.findOne({ _id: getId(req.body.product) });

    if (!product) {
      console.log("here1?");
      res.status(400).json({ message: "Failed to add product variant" });
      return;
    }

    // Fix values
    variantDoc.product = getId(req.body.product);
    variantDoc.added = new Date();

    try {
      const variant = await db.variants.insertOne(variantDoc);
      product.variants = variant.ops;
      res.status(200).json({ message: "Successfully added variant", product });
    } catch (ex) {
      console.log("here?");
      res
        .status(400)
        .json({ message: "Failed to add variant. Please try again" });
    }
  }
);

// Update an existing product variant
router.post(
  "/admin/product/editvariant",
  restrict,
  checkAccess,
  async (req, res) => {
    const db = req.app.db;

    const variantDoc = {
      product: req.body.product,
      variant: req.body.variant,
      title: req.body.title,
      price: req.body.price,
      stock: safeParseInt(req.body.stock) || null,
    };

    // Validate the body again schema
    const schemaValidate = validateJson("editVariant", variantDoc);
    if (!schemaValidate.result) {
      if (process.env.NODE_ENV !== "test") {
        console.log("schemaValidate errors", schemaValidate.errors);
      }
      res.status(400).json(schemaValidate.errors);
      return;
    }

    // Validate ID's
    const product = await db.products.findOne({ _id: getId(req.body.product) });
    if (!product) {
      res.status(400).json({ message: "Failed to add product variant" });
      return;
    }

    const variant = await db.variants.findOne({ _id: getId(req.body.variant) });
    if (!variant) {
      res.status(400).json({ message: "Failed to add product variant" });
      return;
    }

    // Removed props not needed
    delete variantDoc.product;
    delete variantDoc.variant;

    try {
      const updatedVariant = await db.variants.findOneAndUpdate(
        {
          _id: getId(req.body.variant),
        },
        {
          $set: variantDoc,
        },
        {
          returnOriginal: false,
        }
      );
      res.status(200).json({
        message: "Successfully saved variant",
        variant: updatedVariant.value,
      });
    } catch (ex) {
      res
        .status(400)
        .json({ message: "Failed to save variant. Please try again" });
    }
  }
);

// Remove a product variant
router.post(
  "/admin/product/removevariant",
  restrict,
  checkAccess,
  async (req, res) => {
    const db = req.app.db;

    const variant = await db.variants.findOne({ _id: getId(req.body.variant) });
    if (!variant) {
      res.status(400).json({ message: "Failed to remove product variant" });
      return;
    }

    try {
      // Delete the variant
      await db.variants.deleteOne({ _id: variant._id }, {});
      res.status(200).json({ message: "Successfully removed variant" });
    } catch (ex) {
      res
        .status(400)
        .json({ message: "Failed to remove variant. Please try again" });
    }
  }
);

// update the published state based on an ajax call from the frontend
router.post(
  "/admin/product/publishedState",
  restrict,
  checkAccess,
  async (req, res) => {
    const db = req.app.db;

    try {
      await db.products.updateOne(
        { _id: getId(req.body.id) },
        { $set: { productPublished: convertBool(req.body.state) } },
        { multi: false }
      );
      res.status(200).json({ message: "Published state updated" });
    } catch (ex) {
      console.error(colors.red(`Failed to update the published state: ${ex}`));
      res.status(400).json({ message: "Published state not updated" });
    }
  }
);

// set as main product image
router.post(
  "/admin/product/setasmainimage",
  restrict,
  checkAccess,
  async (req, res) => {
    const db = req.app.db;

    try {
      // update the productImage to the db
      await db.products.updateOne(
        { _id: getId(req.body.product_id) },
        { $set: { productImage: req.body.productImage } },
        { multi: false }
      );
      res.status(200).json({ message: "Main image successfully set" });
    } catch (ex) {
      res
        .status(400)
        .json({ message: "Unable to set as main image. Please try again." });
    }
  }
);

// deletes a product image
router.post(
  "/admin/product/deleteimage",
  restrict,
  checkAccess,
  async (req, res) => {
    const db = req.app.db;

    // get the productImage from the db
    const product = await db.products.findOne({
      _id: getId(req.body.product_id),
    });
    if (!product) {
      res.status(400).json({ message: "Product not found" });
      return;
    }
    // Check for main image being deleted
    if (req.body.productImage === product.productImage) {
      // set the productImage to null
      await db.products.updateOne(
        { _id: getId(req.body.product_id) },
        { $set: { productImage: null } },
        { multi: false }
      );
    }

    // Check if image is a URL
    if (req.body.productImage.substring(0, 4) === "http") {
      // Remove image URL from list
      const imageList = product.productImages.filter(
        (item) => item !== req.body.productImage
      );
      // Update image list to DB
      await db.products.updateOne(
        { _id: getId(req.body.product_id) },
        { $set: { productImages: imageList } },
        { multi: false }
      );
      res.status(200).json({ message: "Image successfully deleted" });
    } else {
      // remove the image from disk
      fs.unlink(path.join("public", req.body.productImage), (err) => {
        if (err) {
          res
            .status(400)
            .json({ message: "Image not removed, please try again." });
        } else {
          res.status(200).json({ message: "Image successfully deleted" });
        }
      });
    }
  }
);

// get images by type
router.post("/api/images", async (req, res, next) => {
  const db = req.app.db;

  console.log("req.body.type", req.body.type);
  try {
    const results = await db.images.find({ type: req.body.type }).toArray();
    res.status(200).json(results);
  } catch (e) {
    console.log(colors.red(`Error getting images`, e));

    res.status(400).json({ message: "Error getting images" });
  }
});

module.exports = router;
