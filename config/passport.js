const passport = require('passport');
const LocalStrategy = require('passport-local');


passport.use(new LocalStrategy({
  usernameField: 'user[phone]',
  passwordField: 'user[password]',
}, (phone, password, done) => {
  const db = req.app.db;
  db.customers.findOne({ phone })
    .then((user) => {
      if(!user || !user.validatePassword(password)) {
        return done(null, false, { errors: { 'phone or password': 'is invalid' } });
      }

      return done(null, user);
    }).catch(done);
}));