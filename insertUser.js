const sql = require('mssql');
const bcrypt = require('bcryptjs');
const sqlConfig = require('./config/dbConfig');

// Get username and password from the command line arguments
const username = process.argv[2];
const plainPassword = process.argv[3];

if (!username || !plainPassword) {
    console.error('Please provide both a username and password.');
    process.exit(1);
}

// Hash the password
bcrypt.hash(plainPassword, 10, async (err, hashedPassword) => {
    if (err) {
        console.error('Error hashing password:', err);
        return;
    }

    try {
        // Connect to SQL Server
        let pool = await sql.connect(sqlConfig);

        // Insert the new user with hashed password
        await pool.request()
            .input('username', sql.VarChar, username)
            .input('password', sql.VarChar, hashedPassword)
            .query('INSERT INTO [SunPharma].[dbo].[Users] ([username], [password]) VALUES (@username, @password)');

        console.log(`User ${username} inserted successfully!`);
    } catch (err) {
        console.error('Error inserting user:', err);
    }
});
