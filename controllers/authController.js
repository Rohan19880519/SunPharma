// controllers/authController.js
const { sql, poolPromise } = require('../config/dbConfig'); // Import poolPromise for efficient connection reuse
const bcrypt = require('bcryptjs');

// Login function
exports.login = async (req, res) => {
    // Extract form data (username & password) from the request body
    const { username, password } = req.body;

    try {
        const pool = await poolPromise;
        
        // Query the database for the user with the specified username
        const result = await pool.request()
            .input('username', sql.VarChar, username)  // This is where the variable is used
            .query('SELECT * FROM Users WHERE username = @username');

        // Check if the user exists
        if (result.recordset.length === 0) {
            console.log('Login failed: User not found');
            return res.status(404).send('User not found');
        }

        const user = result.recordset[0];

        // Check if the user's account is approved
        if (!user.approved) {
            console.log('Login failed: Account is pending approval');
            return res.status(403).send('Your account is pending approval. Please contact the administrator.');
        }

        // Compare the provided password with the hashed password stored in the database
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            console.log('Login failed: Invalid password');
            return res.status(401).send('Invalid password');
        }

        // Store user information in the session, but avoid storing sensitive data
        req.session.user = {
            userId: user.userId,
            username: user.username,
            email: user.email
        };

        console.log('Login successful:', user.username);
        res.redirect('/home'); // Redirect to the home page after successful login
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).send('Server error during login');
    }
};


// Register function
exports.register = async (req, res) => {
    const { username, email, password } = req.body;  // Removed repName since it's not in the table

    try {
        // Hash the user's password before storing it in the database
        const hashedPassword = await bcrypt.hash(password, 10);
        const pool = await poolPromise;

        // Insert the new user into the database
        await pool.request()
            .input('username', sql.VarChar, username)
            .input('password', sql.VarChar, hashedPassword)
            .input('email', sql.VarChar, email)
            .input('approved', sql.Bit, 0)  // Set approved to 0 (pending approval)
            .query('INSERT INTO Users (username, password, email, approved) VALUES (@username, @password, @email, @approved)');

        console.log('User registered successfully:', username);
        res.status(201).send('User registered successfully. Please wait for account approval.');
    } catch (err) {
        console.error('Error during registration:', err);
        res.status(500).send('Server error during registration');
    }
};

// Password reset function
exports.resetPassword = async (req, res) => {
    const { email, newPassword } = req.body;

    try {
        const pool = await poolPromise;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        const result = await pool.request()
            .input('email', sql.VarChar, email)
            .input('password', sql.VarChar, hashedPassword)
            .query('UPDATE Users SET password = @password WHERE email = @email');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).send('No user found with that email address.');
        }

        res.status(200).send('Password reset successful.');
    } catch (err) {
        console.error('Error during password reset:', err);
        res.status(500).send('Server error during password reset.');
    }
};

// Logout function
exports.logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error during logout:', err);
            return res.status(500).send('Error during logout');
        }
        res.clearCookie('connect.sid'); // Clear the session cookie
        console.log('User logged out successfully');
        res.redirect('/auth/login'); // Redirect to the login page after logout
    });
};
