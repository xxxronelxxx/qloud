const authVerify = (req,res,next) => {
    const t = req.cookies.token;
    (t === 'qloud_admin' || t === 'qloud_guest') ? next() : res.redirect('/auth');
}

module.exports = authVerify;