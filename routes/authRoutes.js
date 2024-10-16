// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');  // Ensure this path is correct

router.post('/login', (req, res, next) => {
    console.log('Login route reached');
    next();  // Pass to the actual login function
}, authController.login);


// Route for user registration
router.post('/register', authController.register);  // POST method for registration

// Route for user logout
router.get('/logout', authController.logout);  // GET method for logout

// Route for password reset
router.post('/reset-password', authController.resetPassword);

module.exports = router;
