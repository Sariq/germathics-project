const express = require("express");
const router = express.Router();
const { getId } = require("../lib/common");

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
  category.lectures.forEach((lecture, index) => {
    if (apperanceCount - 1 < index) {
      lecture.studentsList.push({
        studentId: getId(studentId),
        isAppeard: false,
      });
    }
  });


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
    { $set: {categoryIdList: updateCategoriesList }},
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
    return !id.equals(studentId);
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
    categoryIdList : [req.body.categoryId]
  };

  const createdStudent = await db.students.insertOne(doc);
  console.log("createdStudent", doc);
  if(req.body.categoryId !== ""){
    addStudentToCategory(req, req.body.categoryId, createdStudent.insertedId);
  }

  res.status(200).json({});
});
router.post("/api/admin/students/update", async (req, res, next) => {
  const db = req.app.db;

  const student = {
    id: req.body.id,
    name: req.body.name,
    phone: req.body.phone,
    categoryId: req.body.categoryId,
    totalLecturesPaid: req.body.totalLecturesPaid,
    totalPaidPrice: req.body.totalPaidPrice,
    apperanceCount: req.body.apperanceCount,
    status: req.body.status,
  };

  let oldStudent = await db.students.findOne({
    _id: getId(student.id),
  });

  await db.students.updateOne(
    { _id: getId(student.id) },
    { $set: student },
    { multi: false }
  );  

  if(oldStudent.categoryId != student.categoryId ){
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
  console.log("RRR", student);

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
  console.log("req.params.ids",req.body.ids)
    console.log(req.body.ids)
   if (req.body.ids && req.body.ids.length > 0) {
     const ids = req.body.ids.map((id)=>getId(id))
   studentsList = await db.students.find({ _id : { $in : ids } } ).toArray();;
  }else{
    if(req.body.ids == undefined){
      studentsList = await db.students.find().toArray();
    }
  }

  res.status(200).json(studentsList);
});

module.exports = router;
