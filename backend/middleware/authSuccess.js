const authSuccess = (req,res,next) => {
    const t = req.cookies.token;
    (t === 'qloud_admin') ? res.redirect('/') : next();
}

module.exports = authSuccess;