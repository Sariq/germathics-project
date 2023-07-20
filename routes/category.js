const express = require('express');
const router = express.Router();
const {
    paginateData
} = require('../lib/paginate');
const {
  getId,
} = require("../lib/common");

updateStudentAppearnceCount = async function (req,studentsList, currentStudentsList) {
  const db = req.app.db;


  studentsList.forEach(async (student, index) => {
    console.log("student",student)
    console.log("currentStudentsList[index]",currentStudentsList[index])
    switch(true){
      case student.isAppeard && !currentStudentsList[index].isAppeard:
        await db.students.updateOne(
          { _id: getId(student.studentId)},
          {$inc: {'apperanceCount': 1}},
          { multi: false }
        );
        break;
        case !student.isAppeard && currentStudentsList[index].isAppeard:
          await db.students.updateOne(
            { _id: getId(student.studentId)},
            {$inc: {'apperanceCount': -1}},
            { multi: false }
          );
          break;
          default:
            break;
    }
  });
};

router.get("/api/admin/categories/:page?", async (req, res, next) => {
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
    res.status(200).json(categories.data);
});

router.post("/api/admin/categories/add", async (req, res, next) => {
  const db = req.app.db;

  const doc = {
    name: req.body.name,
    studentsList: [],
  };

  let lectures = [];

  doc.lectures = lectures;
  await db.categories.insertOne(doc);
  const categoriesRes =   await db.categories.find().toArray();
  res.status(200).json(categoriesRes);
});

router.post("/api/admin/categories/update", async (req, res, next) => {

  const db = req.app.db;
  const id = req.body._id;
  delete req.body._id;;
  const doc = {
    ...req.body,
  };

  await db.categories.updateOne(
    { _id: getId(id) },
    { $set: doc },
    { multi: false }
  );  

  const categoriesRes =   await db.categories.find().toArray();
  res.status(200).json(categoriesRes);
});

router.get("/admin/categories/:page?", async (req, res, next) => {
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
  
  res.status(200).json(categories.data);
});
router.get("/admin/categories/:categoryId/lectures/:number?", async (req, res, next) => {
  const db = req.app.db;

  let lectureNumber = req.params.number;
  let categoryId = req.params.categoryId;

  const category = await db.categories.findOne({
    _id: getId(categoryId),
  });

  const lecture = category.lectures[lectureNumber];
  
  res.status(200).json(lecture);
});


router.post("/api/admin/categories/lecture/apperance", async (req, res, next) => {
  const db = req.app.db;

  const params = {
    categoryId: req.body.categoryId,
    lectureId: req.body.lectureId,
    studentId: req.body.studentId,
    isAppeard: req.body.isAppeard,
  };

  const category = await db.categories.findOne({
    _id: getId(params.categoryId),
  });

  const currentStudentsList = category.lectures[params.lectureId].studentsList;
  category.lectures[params.lectureId].studentsList = category.lectures[params.lectureId].studentsList.map((student)=>{
    if(student.studentId.equals(params.studentId)){
      return {
        ...student,
        isAppeard: params.isAppeard
      }
    }
    return student;
  });

  await db.categories.updateOne(
    { _id: getId(params.categoryId) },
    { $set: category },
    { multi: false }
  );

  const studentDoc = await db.students.findOne({
    _id: getId(params.studentId),
  });

  await db.students.updateOne(
    { _id: getId(studentDoc._id)},
    {$inc: {'apperanceCount': params.isAppeard ? 1 : -1}},
    { multi: false }
  );

  // updateStudentAppearnceCount(req, params.studentsList, currentStudentsList);
  const updatedCategories = await db.categories.find().toArray();
  res.status(200).json(updatedCategories);
});

module.exports = router;


