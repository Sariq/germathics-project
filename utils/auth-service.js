
const jwt = require('jsonwebtoken');

generateJWT = async function (user,req) {
    return new Promise(async function (resolve, reject) {
        const db = req.app.db;
        const today = new Date();
        const expirationDate = new Date(today);
        expirationDate.setDate(today.getDate() + 60);

        const token = jwt.sign({
            phone: user.phone,
            id: user._id,
            exp: parseInt(expirationDate.getTime() / 1000, 10),
        }, 'secret');
              await db.customers.updateOne(
          { phone: req.body.phone },
          { $set: { 'token': token } },
          { multi: false }
        );
            resolve(token);
    });
}
const toAuthJSON = async function (user, req) {
    return new Promise(function (resolve, reject) {
        generateJWT(user, req).then((result) => {
            resolve({
                ...user,
                token: result,
            });
        });

    });
};
const refreshToken = function(req, res, next) {
    const db = req.app.db;

    let token = req.headers['x-access-token'] || req.headers['authorization']; // Express headers are auto converted to lowercase test
    if (token.startsWith('Token ')) {
      // Remove Bearer from string
      token = token.slice(6, token.length);
    
      db.customers.findOne({ token: token })
  .then((result) => {
    if (!result) {
        return res.status(422).json({
          errors: {
            email: 'is required',
          },
        });
      }else{
        generateJWT(result).then((result) => {
            res.setHeader('Token', result);
            next();
         });
      }
       
    });
    }
      // user is authenticated
  };
const auth = {
    toAuthJSON: toAuthJSON,
    refreshToken: refreshToken
};
module.exports = auth;