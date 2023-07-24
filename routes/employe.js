const express = require("express");
const router = express.Router();
const { getId } = require("../lib/common");
const uuid = require("uuid");
const PDFDocument = require('pdfkit');
const textToImage = require("text-to-image");
const fs = require('fs');
const nodemailer = require('nodemailer');
const XLSX = require('xlsx');
const moment = require("moment");


const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'germathics.dev@gmail.com',
       pass: 'iioxheozbhqwuhoh'
      // pass: 'bgxhkditradxebev'
    }
  });


router.post("/api/admin/employe/add", async (req, res, next) => {
  const db = req.app.db;

  const doc = {
    ...req.body,
    createdDate: new Date()
  };

  const createdEmploye = await db.employes.insertOne(doc);

  res.status(200).json(createdEmploye);
});
router.post("/api/admin/employes/update", async (req, res, next) => {
  const db = req.app.db;
  const id = req.body._id;
  delete req.body._id;
  const student = {
    ...req.body,
    updatedDate: new Date()
  };

  let oldStudent = await db.employes.findOne({
    _id: getId(student.id),
  });

  await db.employes.updateOne(
    { _id: getId(id) },
    { $set: student },
    { multi: false }
  );

  res.status(200).json({});
});



router.post("/api/admin/employes", async (req, res, next) => {
  const db = req.app.db;
  let employesList = [];
  if (req.body.ids && req.body.ids.length > 0) {
    const ids = req.body.ids.map((id) => getId(id));
    employesList = await db.employes.find({ _id: { $in: ids } }).toArray();
  } else {
    if (req.body.ids == undefined) {
      employesList = await db.employes.find().toArray();
    }
  }

  res.status(200).json(employesList);
});

const getPackageStatus = (packageData) => {
  const emptySeats = packageData.seats.filter((seat) => seat.status === 0);
  if (emptySeats.length === 0) {
    return 2;
  } else {
    return 1;
  }
};

router.post("/api/admin/employes/reportByMonth", async (req, res, next) => {
    const db = req.app.db;
    let attendnceList = [];
    let employesList = [];
    employesList = await db.employes.find().toArray();
    employesList.forEach((employe)=>{
      employe.attendanceList.forEach((attendanceItem)=>{
          const attendanceMonth = new Date(attendanceItem.attendanceDate).getMonth();
          const attendanceYear = new Date(attendanceItem.attendanceDate).getFullYear();
          if(attendanceMonth + 1 == req.body.month && attendanceYear == req.body.year){
            attendnceList.push({employeName: employe.name, ...attendanceItem});
          }
      })
    })
    sendPaymentsAsExcel(attendnceList);
    res.status(200).json(attendnceList);
  });
  
  const sendPaymentsAsExcel = (attendnceList)=>{
    const amountSum = attendnceList.reduce((sum, entry) => sum + parseFloat((entry.lectureHoursCount * entry.lectureHoursPrice) + (entry.generalHoursCount * entry.generalHoursPrice)), 0);

    attendnceList = attendnceList.map((attendnce)=>{
      return{
        "שם": attendnce.employeName,
        "שעות הוראה": attendnce.lectureHoursCount,
        "סכום הוראה": attendnce.lectureHoursPrice,
        "שעות כלליות": attendnce.generalHoursCount,
        "סכום כלליות": attendnce.generalHoursPrice,
        "תאריך": moment(attendnce.attendanceDate).format("DD/MM/YYYY"),
        "סה״כ": parseFloat((attendnce.lectureHoursCount * attendnce.lectureHoursPrice) + (attendnce.generalHoursCount * attendnce.generalHoursPrice))
      }
    })
  
  // Calculate the sum of the "amount" column
  
  // Add a sum row to the data array
  const sumRow = {
    // "employeName": "Total",
    "סה״כ": amountSum.toString()
  };
  attendnceList.push(sumRow);
  
  // Convert data to worksheet
  const worksheet = XLSX.utils.json_to_sheet(attendnceList);
  
  // Create workbook and add the worksheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  
  // Generate buffer
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  
  // Save the buffer to a file
  const filePath = 'output.xlsx';
  fs.writeFileSync(filePath, buffer);
  
  
  // Define the email options
  const mailOptions = {
    from: 'germathics.dev@gmail.com',
    to: 'sari.qashuw@gmail.com',
    subject: 'Excel File',
    text: 'Please find the attached Excel file',
    attachments: [
      {
        filename: 'output.xlsx',
        path: filePath
      }
    ]
  };
  
  // Send the email
  transporter.sendMail(mailOptions, function(error, info) {
    if (error) {
      console.log('Error:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  
    // Delete the file after sending the email
    fs.unlinkSync(filePath);
  });
  }




module.exports = router;
