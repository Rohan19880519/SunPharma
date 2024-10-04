const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');  // Ensure correct path

// Route for user login
router.post('/login', authController.login);  // Ensure `login` is defined in authController

module.exports = router;
