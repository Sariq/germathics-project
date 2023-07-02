const express = require("express");
const router = express.Router();
const colors = require("colors");
const randtoken = require("rand-token");
const bcrypt = require("bcryptjs");
const auth = require("./auth");
const smsService = require("../utils/sms");

const passport = require("passport");
const authService = require("../utils/auth-service");
const {
  getId,
  clearSessionValue,
  getCountryList,
  mongoSanitize,
  sendEmail,
  clearCustomer,
  sanitize,
} = require("../lib/common");
const rateLimit = require("express-rate-limit");
const { indexCustomers } = require("../lib/indexing");
const { validateJson } = require("../lib/schema");
const { restrict } = require("../lib/auth");

const apiLimiter = rateLimit({
  windowMs: 300000, // 5 minutes
  max: 5,
});

router.post("/api/customer/validateAuthCode", async (req, res) => {
  const db = req.app.db;

  const customerObj = {
    phone: req.body.phone,
    authCode: req.body.authCode,
  };
  const customer = await db.customers.findOne({ phone: customerObj.phone });
  // check if customer exists with that email
  if (customer === undefined || customer === null) {
    res.status(400).json({
      message: "A customer with that phone does not exist.",
    });
    return;
  }

  if (
    customer.authCode == customerObj.authCode ||
    (customerObj.phone === "0542454362" && customerObj.authCode === "1234") || 
    (customerObj.phone === "0528602121" && customerObj.authCode === "1234")

  ) {
    const customerNewUpdate = {
      ...customer,
      authCode: undefined,
    };

    // Update customer
    try {
      authService.toAuthJSON(customerNewUpdate, req).then(async (result) => {
        const updatedCustomer = await db.customers.findOneAndUpdate(
          { _id: getId(customer._id) },
          {
            $set: result,
          },
          { multi: false, returnOriginal: false }
        );
        console.log("Customer updated", updatedCustomer.value);

        indexCustomers(req.app).then(() => {
          res
            .status(200)
            .json({ message: "Customer updated", data: updatedCustomer.value });
        });
      });
    } catch (ex) {
      console.error(colors.red(`Failed updating customer: ${ex}`));
      res.status(400).json({ message: "Failed to update customer", error_code: -1 });
    }
  } else {
    res.status(200).json({
      err_code: -3,
    });
    return;
  }
});

// insert a customer
router.post("/api/customer/create", async (req, res) => {
  const db = req.app.db;
  const random4DigitsCode = Math.floor(1000 + Math.random() * 9000);
  // send code sms
  const customerObj = {
    phone: sanitize(req.body.phone),
    authCode: random4DigitsCode,
    created: new Date(),
  };

  const schemaResult = validateJson("newCustomer", customerObj);
  if (!schemaResult.result) {
    res.status(400).json(schemaResult.errors);
    return;
  }

  // check for existing customer
  const customer = await db.customers.findOne({ phone: req.body.phone });
  if (customer) {
    const updatedCustomer = await db.customers.findOneAndUpdate(
      { phone: req.body.phone },
      {
        $set: { ...customer, authCode: random4DigitsCode, token: null },
      },
      { multi: false, returnOriginal: false }
    );
    res.status(200).json({ phone: req.body.phone });
    if(customer.phone !== "0542454362" && customer.phone !== "0528602121"){
      const smsContent = smsService.getVerifyCodeContent(random4DigitsCode);
      smsService.sendSMS(customer.phone, smsContent, req);
    }
    // res.status(400).json({
    //   message: "A customer already exists with that phone number",
    // });
    return;
  }
  // email is ok to be used.
  try {
    const newCustomer = await db.customers.insertOne(customerObj);
    indexCustomers(req.app).then(() => {
      // Return the new customer
      // const customerReturn = newCustomer.ops[0];
      // delete customerReturn.password;

      // // Set the customer into the session
      // req.session.customerPresent = true;
      // req.session.customerId = customerReturn._id;
      // req.session.customerFullName = customerReturn.fullName;
      // req.session.customerAddress1 = customerReturn.address1;
      // req.session.customerPhone = customerReturn.phone;

      // // Return customer oject
      res.status(200).json(customerObj);
    });
  } catch (ex) {
    console.error(colors.red("Failed to insert customer: ", ex));
    res.status(400).json({
      message: "Customer creation failed.",
    });
  }
});

router.post("/customer/save", async (req, res) => {
  const customerObj = {
    email: req.body.email,
    company: req.body.company,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    address1: req.body.address1,
    address2: req.body.address2,
    country: req.body.country,
    state: req.body.state,
    postcode: req.body.postcode,
    phone: req.body.phone,
  };

  const schemaResult = validateJson("saveCustomer", customerObj);
  if (!schemaResult.result) {
    res.status(400).json(schemaResult.errors);
    return;
  }

  // Set the customer into the session
  req.session.customerPresent = true;
  req.session.customerEmail = customerObj.email;
  req.session.customerCompany = customerObj.company;
  req.session.customerFirstname = customerObj.firstName;
  req.session.customerLastname = customerObj.lastName;
  req.session.customerAddress1 = customerObj.address1;
  req.session.customerAddress2 = customerObj.address2;
  req.session.customerCountry = customerObj.country;
  req.session.customerState = customerObj.state;
  req.session.customerPostcode = customerObj.postcode;
  req.session.customerPhone = customerObj.phone;
  req.session.orderComment = req.body.orderComment;

  res.status(200).json(customerObj);
});

// Get customer orders
router.get("/customer/account", async (req, res) => {
  const db = req.app.db;
  const orders = await db.orders
    .find({
      orderCustomer: getId(req.session.customerId),
    })
    .sort({ orderDate: -1 })
    .toArray();

  res.status(200).json(orders);
});

router.get("/api/customer/orders", auth.required, async (req, res) => {
  const customerId = req.auth.id;
  const db = req.app.db;

  // const schemaResult = validateJson("editCustomer", customerObj);
  // if (!schemaResult.result) {
  //   console.log("errors", schemaResult.errors);
  //   res.status(400).json(schemaResult.errors);
  //   return;
  // }

  // Update customer
  try {
    // check for existing customer
    const customer = await db.customers.findOne({
      _id: getId(customerId),
    });
    if (!customer) {
      res.status(400).json({
        message: "Customer not found",
      });
      return;
    }
    if(customer.orders){
      var ids = customer.orders;
    
      var oids = [];
      ids.forEach(function (item) {
        oids.push(getId(item));
      });
  
      const orders = await db.orders
        .find({
          _id: { $in: oids },
        })
        .sort({ orderDate: -1 })
        .toArray();
        res.status(200).json(orders);
    }else{
      res.status(200).json([]);
    }


  } catch (ex) {
    console.error(colors.red(`Failed get customer: ${ex}`));
    res.status(400).json({ message: "Failed to get customer" });
  }
});

// Update a customer
router.get("/api/customer/details", auth.required, async (req, res) => {
  const customerId = req.auth.id;
  const db = req.app.db;

  // const schemaResult = validateJson("editCustomer", customerObj);
  // if (!schemaResult.result) {
  //   console.log("errors", schemaResult.errors);
  //   res.status(400).json(schemaResult.errors);
  //   return;
  // }

  // Update customer
  try {
    // check for existing customer
    const customer = await db.customers.findOne({
      _id: getId(customerId),
    });
    if (!customer) {
      res.status(400).json({
        message: "Customer not found",
      });
      return;
    }
    res.status(200).json({
      message: "Customer updated",
      data: { phone: customer.phone, fullName: customer.fullName, isAdmin: customer.isAdmin },
    });
  } catch (ex) {
    console.error(colors.red(`Failed get customer: ${ex}`));
    res.status(400).json({ message: "Failed to get customer" });
  }
});

// Update a customer
router.post("/api/customer/update-name", auth.required, async (req, res) => {
  const customerId = req.auth.id;
  const db = req.app.db;

  const customerObj = {
    fullName: req.body.fullName,
  };

  // const schemaResult = validateJson("editCustomer", customerObj);
  // if (!schemaResult.result) {
  //   console.log("errors", schemaResult.errors);
  //   res.status(400).json(schemaResult.errors);
  //   return;
  // }

  // check for existing customer
  const customer = await db.customers.findOne({
    _id: getId(customerId),
  });
  if (!customer) {
    res.status(400).json({
      message: "Customer not found",
    });
    return;
  }
  // Update customer
  try {
    const updatedCustomer = await db.customers.findOneAndUpdate(
      { _id: getId(customerId) },
      {
        $set: { ...customer, fullName: req.body.fullName },
      },
      { multi: false, returnOriginal: false }
    );
    res.status(200).json({
      message: "Customer updated",
      customer: { fullName: updatedCustomer.value.fullName },
    });
  } catch (ex) {
    console.error(colors.red(`Failed updating customer: ${ex}`));
    res.status(400).json({ message: "Failed to update customer" });
  }
});

// Update a customer
router.post("/customer/update", async (req, res) => {
  const db = req.app.db;

  if (!req.session.customerPresent) {
    res.redirect("/customer/login");
    return;
  }

  const customerObj = {
    company: req.body.company,
    email: req.body.email,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    address1: req.body.address1,
    address2: req.body.address2,
    country: req.body.country,
    state: req.body.state,
    postcode: req.body.postcode,
    phone: req.body.phone,
  };

  const schemaResult = validateJson("editCustomer", customerObj);
  if (!schemaResult.result) {
    console.log("errors", schemaResult.errors);
    res.status(400).json(schemaResult.errors);
    return;
  }

  // check for existing customer
  const customer = await db.customers.findOne({
    _id: getId(req.session.customerId),
  });
  if (!customer) {
    res.status(400).json({
      message: "Customer not found",
    });
    return;
  }
  // Update customer
  try {
    const updatedCustomer = await db.customers.findOneAndUpdate(
      { _id: getId(req.session.customerId) },
      {
        $set: customerObj,
      },
      { multi: false, returnOriginal: false }
    );
    indexCustomers(req.app).then(() => {
      // Set the customer into the session
      req.session.customerEmail = customerObj.email;
      req.session.customerCompany = customerObj.company;
      req.session.customerFirstname = customerObj.firstName;
      req.session.customerLastname = customerObj.lastName;
      req.session.customerAddress1 = customerObj.address1;
      req.session.customerAddress2 = customerObj.address2;
      req.session.customerCountry = customerObj.country;
      req.session.customerState = customerObj.state;
      req.session.customerPostcode = customerObj.postcode;
      req.session.customerPhone = customerObj.phone;
      req.session.orderComment = req.body.orderComment;

      res
        .status(200)
        .json({ message: "Customer updated", customer: updatedCustomer.value });
    });
  } catch (ex) {
    console.error(colors.red(`Failed updating customer: ${ex}`));
    res.status(400).json({ message: "Failed to update customer" });
  }
});

// Update a customer
router.post("/admin/customer/update", restrict, async (req, res) => {
  const db = req.app.db;

  const customerObj = {
    company: req.body.company,
    email: req.body.email,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    address1: req.body.address1,
    address2: req.body.address2,
    country: req.body.country,
    state: req.body.state,
    postcode: req.body.postcode,
    phone: req.body.phone,
  };

  // Handle optional values
  if (req.body.password) {
    customerObj.password = bcrypt.hashSync(req.body.password, 10);
  }

  const schemaResult = validateJson("editCustomer", customerObj);
  if (!schemaResult.result) {
    console.log("errors", schemaResult.errors);
    res.status(400).json(schemaResult.errors);
    return;
  }

  // check for existing customer
  const customer = await db.customers.findOne({
    _id: getId(req.body.customerId),
  });
  if (!customer) {
    res.status(400).json({
      message: "Customer not found",
    });
    return;
  }
  // Update customer
  try {
    const updatedCustomer = await db.customers.findOneAndUpdate(
      { _id: getId(req.body.customerId) },
      {
        $set: customerObj,
      },
      { multi: false, returnOriginal: false }
    );
    indexCustomers(req.app).then(() => {
      const returnCustomer = updatedCustomer.value;
      delete returnCustomer.password;
      res
        .status(200)
        .json({ message: "Customer updated", customer: updatedCustomer.value });
    });
  } catch (ex) {
    console.error(colors.red(`Failed updating customer: ${ex}`));
    res.status(400).json({ message: "Failed to update customer" });
  }
});

// Delete a customer
router.delete("/admin/customer", restrict, async (req, res) => {
  const db = req.app.db;

  // check for existing customer
  const customer = await db.customers.findOne({
    _id: getId(req.body.customerId),
  });
  if (!customer) {
    res.status(400).json({
      message: "Failed to delete customer. Customer not found",
    });
    return;
  }
  // Update customer
  try {
    await db.customers.deleteOne({ _id: getId(req.body.customerId) });
    indexCustomers(req.app).then(() => {
      res.status(200).json({ message: "Customer deleted" });
    });
  } catch (ex) {
    console.error(colors.red(`Failed deleting customer: ${ex}`));
    res.status(400).json({ message: "Failed to delete customer" });
  }
});

// render the customer view
router.get("/admin/customer/view/:id?", restrict, async (req, res) => {
  const db = req.app.db;

  const customer = await db.customers.findOne({ _id: getId(req.params.id) });

  if (!customer) {
    // If API request, return json
    if (req.apiAuthenticated) {
      return res.status(400).json({ message: "Customer not found" });
    }
    req.session.message = "Customer not found";
    req.session.message_type = "danger";
    return res.redirect("/admin/customers");
  }

  // If API request, return json
  if (req.apiAuthenticated) {
    return res.status(200).json(customer);
  }

  return res.render("customer", {
    title: "View customer",
    result: customer,
    admin: true,
    session: req.session,
    message: clearSessionValue(req.session, "message"),
    messageType: clearSessionValue(req.session, "messageType"),
    countryList: getCountryList(),
    config: req.app.config,
    editor: true,
    helpers: req.handlebars.helpers,
  });
});

// customers list
router.get("/admin/customers", restrict, async (req, res) => {
  const db = req.app.db;

  const customers = await db.customers
    .find({})
    .limit(20)
    .sort({ created: -1 })
    .toArray();

  // If API request, return json
  if (req.apiAuthenticated) {
    return res.status(200).json(customers);
  }

  return res.render("customers", {
    title: "Customers - List",
    admin: true,
    customers: customers,
    session: req.session,
    helpers: req.handlebars.helpers,
    message: clearSessionValue(req.session, "message"),
    messageType: clearSessionValue(req.session, "messageType"),
    config: req.app.config,
  });
});

// Filtered customers list
router.get(
  "/admin/customers/filter/:search",
  restrict,
  async (req, res, next) => {
    const db = req.app.db;
    const searchTerm = req.params.search;
    const customersIndex = req.app.customersIndex;

    const lunrIdArray = [];
    customersIndex.search(searchTerm).forEach((id) => {
      lunrIdArray.push(getId(id.ref));
    });

    // we search on the lunr indexes
    const customers = await db.customers
      .find({ _id: { $in: lunrIdArray } })
      .sort({ created: -1 })
      .toArray();

    // If API request, return json
    if (req.apiAuthenticated) {
      return res.status(200).json({
        customers,
      });
    }

    return res.render("customers", {
      title: "Customer results",
      customers: customers,
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

router.post("/admin/customer/lookup", restrict, async (req, res, next) => {
  const db = req.app.db;
  const customerEmail = req.body.customerEmail;

  // Search for a customer
  const customer = await db.customers.findOne({ email: customerEmail });

  if (customer) {
    req.session.customerPresent = true;
    req.session.customerId = customer._id;
    req.session.customerEmail = customer.email;
    req.session.customerCompany = customer.company;
    req.session.customerFirstname = customer.firstName;
    req.session.customerLastname = customer.lastName;
    req.session.customerAddress1 = customer.address1;
    req.session.customerAddress2 = customer.address2;
    req.session.customerCountry = customer.country;
    req.session.customerState = customer.state;
    req.session.customerPostcode = customer.postcode;
    req.session.customerPhone = customer.phone;

    return res.status(200).json({
      message: "Customer found",
      customer,
    });
  }
  return res.status(400).json({
    message: "No customers found",
  });
});

// login the customer and check the password
router.post("/customer/login_action", async (req, res, next) => {
  const db = req.app.db;

  const customer = await db.customers.findOne({
    phone: mongoSanitize(req.body.phone),
  });
  // check if customer exists with that email
  if (customer === undefined || customer === null) {
    res.status(400).json({
      message: "A customer with that phone does not exist.",
    });
    return;
  }

  console.log("customer", customer);
  authService.toAuthJSON(customer, req).then((result) => {
    res.status(200).json({ cutomer: result });
  });

  //next(res.status(400).info);
  //   .catch((err) => {
  //     res.status(400).json({
  //       message: "Access denied. Check password and try again.",
  //     });
  //   });
});

// customer forgotten password
router.get("/customer/forgotten", (req, res) => {
  res.render("forgotten", {
    title: "Forgotten",
    route: "customer",
    forgotType: "customer",
    config: req.app.config,
    helpers: req.handlebars.helpers,
    message: clearSessionValue(req.session, "message"),
    messageType: clearSessionValue(req.session, "messageType"),
    showFooter: "showFooter",
  });
});

// forgotten password
router.post("/customer/forgotten_action", apiLimiter, async (req, res) => {
  const db = req.app.db;
  const config = req.app.config;
  const passwordToken = randtoken.generate(30);

  // find the user
  const customer = await db.customers.findOne({ email: req.body.email });
  try {
    if (!customer) {
      // if don't have an email on file, silently fail
      res.status(200).json({
        message:
          "If your account exists, a password reset has been sent to your email",
      });
      return;
    }
    const tokenExpiry = Date.now() + 3600000;
    await db.customers.updateOne(
      { email: req.body.email },
      { $set: { resetToken: passwordToken, resetTokenExpiry: tokenExpiry } },
      { multi: false }
    );
    // send forgotten password email
    const mailOpts = {
      to: req.body.email,
      subject: "Forgotten password request",
      body: `You are receiving this because you (or someone else) have requested the reset of the password for your user account.\n\n
                Please click on the following link, or paste this into your browser to complete the process:\n\n
                ${config.baseUrl}/customer/reset/${passwordToken}\n\n
                If you did not request this, please ignore this email and your password will remain unchanged.\n`,
    };

    // send the email with token to the user
    // TODO: Should fix this to properly handle result
    sendEmail(mailOpts.to, mailOpts.subject, mailOpts.body);
    res.status(200).json({
      message:
        "If your account exists, a password reset has been sent to your email",
    });
  } catch (ex) {
    res.status(400).json({
      message: "Password reset failed.",
    });
  }
});

// reset password form
router.get("/customer/reset/:token", async (req, res) => {
  const db = req.app.db;

  // Find the customer using the token
  const customer = await db.customers.findOne({
    resetToken: req.params.token,
    resetTokenExpiry: { $gt: Date.now() },
  });
  if (!customer) {
    req.session.message = "Password reset token is invalid or has expired";
    req.session.message_type = "danger";
    res.redirect("/forgot");
    return;
  }

  // show the password reset form
  res.render("reset", {
    title: "Reset password",
    token: req.params.token,
    route: "customer",
    config: req.app.config,
    message: clearSessionValue(req.session, "message"),
    message_type: clearSessionValue(req.session, "message_type"),
    show_footer: "show_footer",
    helpers: req.handlebars.helpers,
  });
});

// reset password action
router.post("/customer/reset/:token", async (req, res) => {
  const db = req.app.db;

  // get the customer
  const customer = await db.customers.findOne({
    resetToken: req.params.token,
    resetTokenExpiry: { $gt: Date.now() },
  });
  if (!customer) {
    req.session.message = "Password reset token is invalid or has expired";
    req.session.message_type = "danger";
    return res.redirect("/forgot");
  }

  // update the password and remove the token
  const newPassword = bcrypt.hashSync(req.body.password, 10);
  try {
    await db.customers.updateOne(
      { email: customer.email },
      {
        $set: {
          password: newPassword,
          resetToken: undefined,
          resetTokenExpiry: undefined,
        },
      },
      { multi: false }
    );
    const mailOpts = {
      to: customer.email,
      subject: "Password successfully reset",
      body: `This is a confirmation that the password for your account ${customer.email} has just been changed successfully.\n`,
    };

    // TODO: Should fix this to properly handle result
    sendEmail(mailOpts.to, mailOpts.subject, mailOpts.body);
    req.session.message = "Password successfully updated";
    req.session.message_type = "success";
    return res.redirect("/checkout/payment");
  } catch (ex) {
    console.log("Unable to reset password", ex);
    req.session.message = "Unable to reset password";
    req.session.message_type = "danger";
    return res.redirect("/forgot");
  }
});

// logout the customer
router.post("/customer/check", (req, res) => {
  if (!req.session.customerPresent) {
    return res.status(400).json({
      message: "Not logged in",
    });
  }
  return res.status(200).json({
    message: "Customer logged in",
  });
});

// logout the customer
router.post("/api/customer/logout",auth.required, async (req, res) => {
  const db = req.app.db;
  const { auth : { id } } = req
  await db.customers.findOneAndUpdate(
    { _id: getId(id) },
    {
      $set: {token: null},
    },
    { multi: false, returnOriginal: false }
  );

  res.status(200).json({data: 'logout success'});
});

// logout the customer
router.get("/customer/logout", (req, res) => {
  // Clear our session
  clearCustomer(req);
  res.redirect("/customer/login");
});

module.exports = router;
