const sql = require('mssql');
const bcrypt = require('bcryptjs');
const sqlConfig = require('../config/dbConfig');  // Adjust path if needed

// Register a new user and set "approved" to 0 by default (pending approval)
exports.registerUser = async (username, plainPassword) => {
    try {
        // Hash the password before storing it
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        
        // Connect to the SQL Server
        let pool = await sql.connect(sqlConfig);

        // Insert the new user into the database with approved set to 0 (pending)
        await pool.request()
            .input('username', sql.VarChar, username)
            .input('password', sql.VarChar, hashedPassword)
            .input('approved', sql.Bit, 0)  // Set "approved" to 0 (not approved yet)
            .query('INSERT INTO Users (username, password, approved) VALUES (@username, @password, @approved)');

        console.log(`User ${username} registered successfully, pending approval.`);
    } catch (err) {
        console.error('Error registering user:', err);
    }
};
