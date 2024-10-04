const sql = require('mssql');
const bcrypt = require('bcryptjs');
const sqlConfig = require('../config/dbConfig');

// Login function
exports.login = async (req, res) => {
    const { username, password } = req.body;  // Extract form data (username & password)
    
    try {
        // Connect to SQL Server using sqlConfig
        let pool = await sql.connect(sqlConfig);
        
        // Query user by username
        let result = await pool.request()
            .input('username', sql.VarChar, username)
            .query('SELECT * FROM Users WHERE username = @username');
        
        // Check if user exists
        if (result.recordset.length === 0) {
            console.log('User not found');  // Log error
            return res.status(400).send('User not found');
        }

        const user = result.recordset[0];

        // Check if the user's account is approved
        if (!user.approved) {
            console.log('Account is pending approval');  // Log error
            return res.status(403).send('Your account is pending approval. Please contact the administrator.');
        }

        // Compare hashed password using bcrypt
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            console.log('Invalid password');  // Log error
            return res.status(400).send('Invalid password');
        }

        // On successful login, store user in session
        req.session.user = user;

        // Redirect to home page after successful login
        res.redirect('/home');
    } catch (err) {
        // Handle and log any errors during the process
        console.error('Error during login:', err);
        res.status(500).send('Server error');
    }
};
