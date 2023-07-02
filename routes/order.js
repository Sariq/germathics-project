const express = require("express");
const auth = require("./auth");
const orderid = require("order-id")("key");
const textToImage = require("text-to-image");
const websockets = require("../utils/websockets");
const smsService = require("../utils/sms");
const imagesService = require("../utils/images-service");
var multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const axios = require("axios");

const {
  clearSessionValue,
  getCountryList,
  getId,
  sendEmail,
  getEmailTemplate,
  clearCustomer,
  sanitize,
} = require("../lib/common");
const { paginateData } = require("../lib/paginate");
const { emptyCart } = require("../lib/cart");
const { restrict, checkAccess } = require("../lib/auth");
const { indexOrders } = require("../lib/indexing");
const router = express.Router();

// Show orders
router.get(
  "/api/order/admin/orders/:page?",
  auth.required,
  async (req, res, next) => {
    const db = req.app.db;
    let finalOrders = [];

    let pageNum = 1;
    if (req.params.page) {
      pageNum = req.params.page;
    }

    // Get our paginated data
    const orders = await paginateData(
      false,
      req,
      pageNum,
      "orders",
      {},
      { orderDate: 1 }
    );
    // orders?.data?.forEach(async (order)=>{
    for (const order of orders?.data) {
      const customer = await db.customers.findOne({
        _id: getId(order.customerId),
      });

      const dataUri = await textToImage.generate(customer.fullName, {
        maxWidth: 200,
        textAlign: "center",
      });

      finalOrders.push({
        ...order,
        customerDetails: {
          name: customer.fullName,
          phone: customer.phone,
          recipetName: dataUri,
        },
      });
    }
    console.log("finalOrders", finalOrders);
    // If API request, return json
    // if(req.apiAuthenticated){
    res.status(200).json(finalOrders);
    // }
  }
);

router.post("/api/order/byDate", async (req, res, next) => {
  const db = req.app.db;
  let finalOrders = [];

  finalOrders = await db.orders
    .find({
      created: {
        $gte: new Date(req.body.startDate),
        $lt: new Date(req.body.endDate),
      },
    })
    .toArray();

  res.status(200).json(finalOrders);
});

// Admin section
router.get(
  "/admin/orders/bystatus/:orderstatus",
  restrict,
  async (req, res, next) => {
    const db = req.app.db;

    if (typeof req.params.orderstatus === "undefined") {
      res.redirect("/admin/orders");
      return;
    }

    // case insensitive search
    const regex = new RegExp(["^", req.params.orderstatus, "$"].join(""), "i");
    const orders = await db.orders
      .find({ orderStatus: regex })
      .sort({ orderDate: -1 })
      .limit(10)
      .toArray();

    // If API request, return json
    if (req.apiAuthenticated) {
      res.status(200).json({
        orders,
      });
      return;
    }

    res.render("orders", {
      title: "Cart",
      orders: orders,
      admin: true,
      filteredOrders: true,
      filteredStatus: req.params.orderstatus,
      config: req.app.config,
      session: req.session,
      message: clearSessionValue(req.session, "message"),
      messageType: clearSessionValue(req.session, "messageType"),
      helpers: req.handlebars.helpers,
    });
  }
);

// render the editor
router.get("/admin/order/view/:id", restrict, async (req, res) => {
  const db = req.app.db;
  const order = await db.orders.findOne({ _id: getId(req.params.id) });
  const transaction = await db.transactions.findOne({
    _id: getId(order.transaction),
  });

  res.render("order", {
    title: "View order",
    result: order,
    transaction,
    config: req.app.config,
    session: req.session,
    message: clearSessionValue(req.session, "message"),
    messageType: clearSessionValue(req.session, "messageType"),
    editor: true,
    admin: true,
    helpers: req.handlebars.helpers,
  });
});

// render the editor
router.get("/admin/order/create", restrict, async (req, res) => {
  res.render("order-create", {
    title: "Create order",
    config: req.app.config,
    session: req.session,
    message: clearSessionValue(req.session, "message"),
    messageType: clearSessionValue(req.session, "messageType"),
    countryList: getCountryList(),
    editor: true,
    admin: true,
    helpers: req.handlebars.helpers,
  });
});

router.post(
  "/api/order/create",
  upload.array("img"),
  auth.required,
  async (req, res, next) => {
    const customerId = req.auth.id;
    const db = req.app.db;
    const config = req.app.config;
    console.log("req.files", req.files);
    const parsedBodey = JSON.parse(req.body.body);
    // // Check if cart is empty
    // if(!req.session.cart){
    //     res.status(400).json({
    //         message: 'The cart is empty. You will need to add items to the cart first.'
    //     });
    // }
    const generatedOrderId = orderid.generate();
    console.log("generatedOrderId", generatedOrderId);
    let imagesList = [];
    if (req.files && req.files.length > 0) {
      imagesList = await imagesService.uploadImage(req.files, req, "orders");
    }
    let imageIndex = 0;
    let updatedItemsWithImages = [];
    if (imagesList?.length > 0) {
      updatedItemsWithImages = parsedBodey.order.items.map((item) => {
        if (item.clienImage) {
          imageIndex++;
          return {
            ...item,
            clienImage: imagesList[imageIndex - 1],
          };
        }
        return {
          ...item,
          clienImage: null,
        };
      });
    }

    const orderDoc = {
      ...parsedBodey,
      order: {
        ...parsedBodey.order,
        items:
          updatedItemsWithImages?.length > 0
            ? updatedItemsWithImages
            : parsedBodey.order.items,
      },
      created: new Date(),
      customerId,
      orderId: generatedOrderId,
      status: "1",
      isPrinted: false,
    };
    console.log("orderDoc", orderDoc);

    // insert order into DB
    try {
      const newDoc = await db.orders.insertOne(orderDoc);

      // get the new ID
      const orderId = newDoc.insertedId;
      const customer = await db.customers.findOne({
        _id: getId(customerId),
      });
      if (!customer) {
        res.status(400).json({
          message: "Customer not found",
        });
        return;
      }

      const updatedCustomer = await db.customers.findOneAndUpdate(
        { _id: getId(customerId) },
        {
          $set: {
            ...customer,
            orders: customer.orders ? [...customer.orders, orderId] : [orderId],
          },
        },
        { multi: false, returnOriginal: false }
      );
      orderDoc.order.items.forEach(async (item) => {
        const product = await db.products.findOne({
          _id: getId(item.item_id),
        });

        let updatedProduct = {};
        product.extras.size.options[item.size].count =
          product.extras.size.options[item.size].count - item.qty ;
        updatedProduct = { ...product };
        await db.products.updateOne(
          { _id: getId(item.item_id) },
          { $set: updatedProduct },
          {}
        );
        // Update the index
        //     indexProducts(req.app).then(() => {
        //       res
        //         .status(200)
        //         .json({ message: "Successfully saved", product: productDoc });
        //     });
        //   } catch (ex) {
        //     res.status(400).json({ message: "Failed to save. Please try again" });
        //   }
      });
      const smsContent = smsService.getOrderRecivedContent(
        customer.fullName,
        orderDoc.total,
        orderDoc.order.receipt_method,
        generatedOrderId,
        orderDoc.app_language
      );
      smsService.sendSMS(customer.phone, smsContent, req);
      console.log("fire websocket order");
      const dataUri = await textToImage.generate(customer.fullName, {
        maxWidth: 200,
        textAlign: "center",
      });
      const finalOrderDoc = {
        ...orderDoc,
        customerDetails: {
          name: customer.fullName,
          phone: customer.phone,
          recipetName: dataUri,
        },
      };
      websockets.fireWebscoketEvent("new order", finalOrderDoc);

      // https://www.waze.com/ul?ll=32.23930691837541,34.95049682449079&navigate=yes&zoom=17
      // add to lunr index
      indexOrders(req.app).then(() => {
        // send the email with the response
        // TODO: Should fix this to properly handle result
        //sendEmail(req.session.paymentEmailAddr, `Your order with ${config.cartTitle}`, getEmailTemplate(paymentResults));
        // redirect to outcome
        res.status(200).json({
          message: "Order created successfully",
          orderId,
        });
      });
    } catch (ex) {
      console.log(ex);
      res.status(400).json({ err: "Your order declined. Please try again" });
    }
  }
);

// Admin section
router.get("/admin/orders/filter/:search", restrict, async (req, res, next) => {
  const db = req.app.db;
  const searchTerm = req.params.search;
  const ordersIndex = req.app.ordersIndex;

  const lunrIdArray = [];
  ordersIndex.search(searchTerm).forEach((id) => {
    lunrIdArray.push(getId(id.ref));
  });

  // we search on the lunr indexes
  const orders = await db.orders.find({ _id: { $in: lunrIdArray } }).toArray();

  // If API request, return json
  if (req.apiAuthenticated) {
    res.status(200).json({
      orders,
    });
    return;
  }

  res.render("orders", {
    title: "Order results",
    orders: orders,
    admin: true,
    config: req.app.config,
    session: req.session,
    searchTerm: searchTerm,
    message: clearSessionValue(req.session, "message"),
    messageType: clearSessionValue(req.session, "messageType"),
    helpers: req.handlebars.helpers,
  });
});

// order product
router.get("/admin/order/delete/:id", async (req, res) => {
  const db = req.app.db;

  // remove the order
  try {
    await db.orders.deleteOne({ _id: getId(req.params.id) });

    // remove the index
    indexOrders(req.app).then(() => {
      res.status(200).json({
        message: "Order successfully deleted",
      });
      return;
    });
  } catch (ex) {
    console.log("Cannot delete order", ex);
    res.status(200).json({
      message: "Error deleting order",
    });
    return;
  }
});

// update order
router.post("/api/order/update", auth.required, async (req, res) => {
  const db = req.app.db;
  try {
    const updateobj = { status: req.body.status };
    console.log("XXX", updateobj);

    await db.orders.updateOne(
      {
        _id: getId(req.body.orderId),
      },
      { $set: updateobj },
      { multi: false }
    );
    return res.status(200).json({ message: "Order successfully updated" });
  } catch (ex) {
    console.info("Error updating order", ex);
    return res.status(400).json({ message: "Failed to update the order" });
  }
});

router.post("/api/order/printed", auth.required, async (req, res) => {
  const db = req.app.db;
  try {
    console.log("PRINTED", req.body.orderId);
    await db.orders.updateOne(
      {
        _id: getId(req.body.orderId),
      },
      { $set: { isPrinted: true } },
      { multi: false }
    );
    return res.status(200).json({ message: "Order successfully printed" });
  } catch (ex) {
    console.info("Error updating order", ex);
    return res.status(400).json({ message: "Failed to print the order" });
  }
});

module.exports = router;
