const express = require('express');
const router = express.Router();

// Home page route (GET /home)
router.get('/home', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');  // Redirect to login if the user isn't authenticated
    }

    // Render the "home.ejs" view from the "views" folder
    res.render('home');  // Make sure the file "views/home.ejs" exists
});

module.exports = router;
