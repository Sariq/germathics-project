const express = require("express");
const router = express.Router();
const { getId, PaymentMethods } = require("../lib/common");
const uuid = require("uuid");
const PDFDocument = require("pdfkit");
const textToImage = require("text-to-image");
const fs = require("fs");
const nodemailer = require("nodemailer");
const XLSX = require("xlsx");
const moment = require("moment");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "germathics.dev@gmail.com",
    pass: "iioxheozbhqwuhoh",
    // pass: 'bgxhkditradxebev'
  },
});

addStudentToCategory = async function (
  req,
  categoryId,
  studentId,
  apperanceCount = 0
) {
  const db = req.app.db;

  let category = await db.categories.findOne({
    _id: getId(categoryId),
  });

  category.studentsList.push(getId(studentId));
  // category.lectures.forEach((lecture, index) => {
  //   if (apperanceCount - 1 < index) {
  //     // lecture.studentsList.push({
  //     //   studentId: getId(studentId),
  //     //   isAppeard: false,
  //     // });
  //   }
  // });

  await db.categories.updateOne(
    { _id: getId(categoryId) },
    { $set: category },
    { multi: false }
  );

  let student = await db.students.findOne({
    _id: getId(studentId),
  });
  student.categoryIdList.push(categoryId);
  const updateCategoriesList = student.categoryIdList;
  await db.students.updateOne(
    { _id: getId(studentId) },
    { $set: { categoryIdList: updateCategoriesList } },
    { multi: false }
  );
};

removeStudentFromCategory = async function (
  req,
  categoryId,
  studentId,
  apperanceCount
) {
  const db = req.app.db;

  let category = await db.categories.findOne({
    _id: getId(categoryId),
  });

  category.studentsList = category.studentsList.filter((id) => {
    return id === studentId;
  });

  // category.lectures.forEach((lecture, index) => {
  //   if (apperanceCount - 1 > index) {
  //     lecture.studentsList = lecture.studentsList.filter(
  //       (student) => !student.studentId.equals(studentId)
  //     );
  //   }
  // });

  await db.categories.updateOne(
    { _id: getId(categoryId) },
    { $set: category },
    { multi: false }
  );
};

router.post("/api/admin/students/add", async (req, res, next) => {
  const db = req.app.db;

  const doc = {
    name: req.body.name,
    phone: req.body.phone,
    categoryId: req.body.categoryId,
    totalLecturesPaid: req.body.totalLecturesPaid,
    apperanceCount: 0,
    status: req.body.status,
    totalPaidPrice: req.body.totalPaidPrice,
    categoryIdList: [req.body.categoryId],
    packagesList: req.body.packagesList,
  };

  const createdStudent = await db.students.insertOne(doc);
  if (req.body.categoryId !== "") {
    addStudentToCategory(req, req.body.categoryId, createdStudent.insertedId);
  }

  res.status(200).json({});
});
router.post("/api/admin/students/update", async (req, res, next) => {
  const db = req.app.db;
  delete req.body._id;
  const student = {
    ...req.body,
  };

  let oldStudent = await db.students.findOne({
    _id: getId(student.id),
  });

  await db.students.updateOne(
    { _id: getId(student.id) },
    { $set: student },
    { multi: false }
  );

  if (oldStudent.categoryId != student.categoryId) {
    removeStudentFromCategory(
      req,
      oldStudent.categoryId,
      student.id,
      student.apperanceCount
    );
    addStudentToCategory(
      req,
      student.categoryId,
      student.id,
      student.apperanceCount
    );
  }

  const studentsList = await db.students.find().toArray();
  res.status(200).json(studentsList);
});

router.post("/api/admin/students/add/package", async (req, res, next) => {
  const db = req.app.db;

  const doc = {
    id: req.body.id,
    package: req.body.studentPackage,
  };

  let oldStudent = await db.students.findOne({
    _id: getId(student.id),
  });

  oldStudent.packagesList.push(doc.package);

  await db.students.updateOne(
    { _id: getId(student.id) },
    { $set: student },
    { multi: false }
  );
  res.status(200).json({});
});

router.post("/admin/students/category/change", async (req, res, next) => {
  const db = req.app.db;

  const student = {
    id: req.body.studentId,
    oldCategoryId: req.body.oldCategoryId,
    newCategoryId: req.body.newCategoryId,
    apperanceCount: req.body.apperanceCount,
  };

  await db.students.updateOne(
    { _id: getId(student.id) },
    { $set: { categoryId: student.newCategoryId } },
    { multi: false }
  );

  removeStudentFromCategory(
    req,
    student.oldCategoryId,
    student.id,
    student.apperanceCount
  );
  addStudentToCategory(
    req,
    student.newCategoryId,
    student.id,
    student.apperanceCount
  );
  res.status(200).json({});
});

router.post("/api/admin/students", async (req, res, next) => {
  const db = req.app.db;
  let studentsList = [];
  if (req.body.ids && req.body.ids.length > 0) {
    const ids = req.body.ids.map((id) => getId(id));
    studentsList = await db.students.find({ _id: { $in: ids } }).toArray();
  } else {
    if (req.body.ids == undefined) {
      studentsList = await db.students.find().toArray();
    }
  }

  res.status(200).json(studentsList);
});

const getPackageStatus = (packageData) => {
  const emptySeats = packageData.seats.filter((seat) => seat.status === 0);
  if (emptySeats.length === 0) {
    return 2;
  } else {
    return 1;
  }
};

const getSeatPackage = (studentDoc, lectureId) => {
  let seatFound = null;
  let seatPackage = null;
  studentDoc.packagesList.forEach((currentPackage) => {
    currentPackage.seats.forEach((seat) => {
      if (seat.lectureId === lectureId) {
        seatPackage = currentPackage;
        seatFound = seat;
      }
    });
  });
  return { seatPackage, seatFound };
};
router.post("/api/admin/students/apperance", async (req, res, next) => {
  const db = req.app.db;

  const params = {
    lectureId: req.body.lectureId,
    lectureDate: req.body.lectureDate,
    studentId: req.body.studentId,
    seatStatus: req.body.seatStatus,
  };

  let studentDoc = await db.students.findOne({
    _id: getId(params.studentId),
  });

  let appearanceValue = 0;

  switch (params.seatStatus) {
    case 1:
    case 2:
      appearanceValue = 1;
      break;
    case 3:
      appearanceValue = 0;
      break;
  }

  let firstActivePackage = studentDoc.packagesList.filter(
    (package) => package.status !== 2
  )[0];
  let firstEmptySeat = firstActivePackage.seats.filter(
    (seat) => seat.status === 0
  )[0];
  let isAddNewPackge = false;

  const { seatPackage, seatFound } = getSeatPackage(
    studentDoc,
    params.lectureId
  );

  if (seatPackage && seatFound) {
    firstActivePackage = seatPackage;
    firstEmptySeat = seatFound;
  } else {
    firstEmptySeat.status = params.seatStatus;
  }

  studentDoc.packagesList = studentDoc.packagesList.map((currentPackage) => {
    if (currentPackage.id === firstActivePackage.id) {
      currentPackage.appearanceCount =
        currentPackage.appearanceCount + appearanceValue;
      currentPackage.seats = firstActivePackage.seats.map((seat) => {
        if (
          seat.id === firstEmptySeat.id ||
          seat.lectureDate === firstEmptySeat.lectureId
        ) {
          return {
            ...seat,
            status: params.seatStatus,
            lectureDate: params.lectureDate,
            lectureId: params.lectureId,
          };
        } else {
          return seat;
        }
      });
      const packageStatus = getPackageStatus(currentPackage);
      currentPackage.status = packageStatus;
      78;
      if (packageStatus === 2 && !seatFound) {
        isAddNewPackge = true;
      }
      return currentPackage;
    } else {
      return currentPackage;
    }
  });

  if (isAddNewPackge) {
    const newPackage = {
      id: uuid.v4(),
      createdDate: new Date(),
      status: 0,
      lecturesCount: 5,
      price: 0,
      paymentsList: [],
      seats: [],
    };
    for (var i = 0; i < 5; i++) {
      newPackage.seats.push({
        status: 0,
        lectureDate: null,
        id: uuid.v4(),
      });
    }
    studentDoc.packagesList.push(newPackage);
  }

  const id = studentDoc._id;
  delete studentDoc._id;
  await db.students.updateOne(
    { _id: getId(id) },
    { $set: studentDoc },
    { multi: false }
  );

  const studentsList = await db.students.find().toArray();
  res.status(200).json(studentsList);
});

router.post("/api/admin/students/generateReceipt", async (req, res) => {
  // JSON data
  const jsonData = { title: "title1", price: 200 };
  // Create a new PDF document
  const doc = new PDFDocument();

  const buffers = [];
  doc.on("data", (buffer) => buffers.push(buffer));
  doc.on("end", () => {
    const pdfData = Buffer.concat(buffers);

    // Configure the email options
    const mailOptions = {
      from: "germathics.dev@gmail.com",
      to: "sari.qashuw@gmail.com, gires419@gmail.com",
      subject: "Receipt",
      text: "Please find the receipt attached.",
      attachments: [
        {
          filename: "receipt.pdf",
          content: pdfData,
        },
      ],
    };

    // Send the email
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log("Error sending email:", error);
        res.status(500).send("Error sending email");
      } else {
        console.log("Email sent:", info.response);
        res.send("Email sent successfully");
      }
    });
  });

  // Set the response headers
  // res.setHeader('Content-Type', 'application/pdf');
  // res.setHeader('Content-Disposition', 'attachment; filename="receipt.pdf"');

  // Pipe the PDF document to the response stream
  // doc.pipe(res);
  const dataUriName = await textToImage.generate(`שם: ${req.body.name}`, {
    maxWidth: 200,
    textAlign: "right",
  });
  const dataUriDate = await textToImage.generate(
    `תאריך: ${moment(req.body.createdDate).format("DD/MM/YYYY")}`,
    {
      maxWidth: 200,
      textAlign: "right",
    }
  );
  const dataUriPhone = await textToImage.generate(
    `מספר טלפון: ${req.body.phone}`,
    {
      maxWidth: 300,
      textAlign: "right",
    }
  );
  const dataUriRecipetNumber = await textToImage.generate(
    `מספר חשבונית: ${200}`,
    {
      maxWidth: 200,
      textAlign: "right",
    }
  );
  const dataUriCompanyId = await textToImage.generate(
    `עוסק מורשה: ${318621299}`,
    {
      maxWidth: 300,
      textAlign: "right",
    }
  );
  const dataUriPrice = await textToImage.generate(`מחיר: ${req.body.amount}`, {
    maxWidth: 200,
    textAlign: "right",
  });
  const dataUriPaymentMethod = await textToImage.generate(
    `שיטת תשלום: ${req.body.paymentMethod}`,
    {
      maxWidth: 200,
      textAlign: "right",
    }
  );
  const dataUriConfirmationNumber = await textToImage.generate(
    `מספר אישור: ${req.body.confirmationNumber}`,
    {
      maxWidth: 200,
      textAlign: "right",
    }
  );

  doc.image(__dirname + "/germathics-logo.png", 225, 0, { width: 200 });

  doc.image(dataUriName, 400, 200, { width: 200 });
  doc.image(dataUriDate, 400, 250, { width: 200 });
  doc.image(dataUriPhone, 300, 300, { width: 300 });
  doc.image(dataUriRecipetNumber, 400, 350, { width: 200 });
  doc.image(dataUriCompanyId, 300, 400, { width: 300 });
  doc.image(dataUriPrice, 400, 450, { width: 200 });
  doc.image(dataUriPaymentMethod, 400, 500, { width: 200 });
  doc.image(dataUriConfirmationNumber, 400, 550, { width: 200 });

  doc.end();
});

router.post("/api/admin/students/paymentByMonth", async (req, res, next) => {
  const db = req.app.db;
  let paymentList = [];
  let studentsList = [];
  studentsList = await db.students.find().toArray();
  studentsList.forEach((student) => {
    student.packagesList?.forEach((packageItem) => {
      packageItem.paymentsList?.forEach((payment) => {
        const paymentMonth = new Date(payment.createdDate).getMonth();
        const paymentYear = new Date(payment.createdDate).getFullYear();
        if (
          paymentMonth + 1 == req.body.month &&
          paymentYear == req.body.year
        ) {
          paymentList.push({ studentName: student.name, ...payment });
        }
      });
    });
  });
  sendPaymentsAsExcel(paymentList);
  res.status(200).json(paymentList);
});

const sendPaymentsAsExcel = (paymentList) => {
  // Calculate the sum of the "amount" column
  const amountSum = paymentList.reduce(
    (sum, entry) => sum + parseFloat(entry.amount),
    0
  );

  paymentList = paymentList.map((payment) => {
    return {
      "תאריך תשלום": moment(payment.createdDate).format("DD/MM/YYYY"),
      שם: payment.studentName,
      "אמצעי תשלום": PaymentMethods[payment.paymentMethod],
      "מספר אישור": payment.confirmationNumber,
      "סה״כ": payment.amount,
    };
  });

  // Add a sum row to the data array
  const sumRow = {
    "סה״כ": amountSum.toString(),
  };
  paymentList.push(sumRow);

  // Convert data to worksheet
  const worksheet = XLSX.utils.json_to_sheet(paymentList);

  // Create workbook and add the worksheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  // Generate buffer
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  // Save the buffer to a file
  const filePath = "output.xlsx";
  fs.writeFileSync(filePath, buffer);

  // Define the email options
  const mailOptions = {
    from: "germathics.dev@gmail.com",
    to: "sari.qashuw@gmail.com, gires419@gmail.com",
    subject: "Excel File",
    text: "Please find the attached Excel file",
    attachments: [
      {
        filename: "output.xlsx",
        path: filePath,
      },
    ],
  };

  // Send the email
  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log("Error:", error);
    } else {
      console.log("Email sent:", info.response);
    }

    // Delete the file after sending the email
    fs.unlinkSync(filePath);
  });
};

module.exports = router;
