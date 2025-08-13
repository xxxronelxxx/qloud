const adminOnly = (req, res, next) => {
  const token = req.cookies && req.cookies.token;
  if (token === 'qloud_admin') return next();
  return res.redirect('/auth');
}

module.exports = adminOnly;

