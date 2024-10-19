const sql = require('mssql');

const sqlConfig = {
  user: 'RohanGreySQL',              // SQL Server login name
  password: 'Ben2021and1988@12',           // Password for SQL Server login
  database: 'SunPharma',
  server: 'CEN-FCKJW93',            // Assuming your database is running locally
  options: {
    encrypt: true,
    trustServerCertificate: true  // Set to true for local development without SSL
  },
  port: 1433                      // Make sure this matches the configured SQL Server port
};



const poolPromise = sql.connect(sqlConfig)
  .then(pool => {
    console.log('Connected to SQL Server');
    return pool;
  })
  .catch(err => {
    console.error('Database Connection Error:', err);
  });

module.exports = { sql, poolPromise };


// User registration
exports.register = async (req, res) => {
  const { username, password } = req.body;

  try {
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const pool = await poolPromise;
    await pool.request()
      .input('username', sql.VarChar, username)
      .input('password', sql.VarChar, hashedPassword)
      .input('approved', sql.Bit, 1) // Automatically approve the user or use 0 for manual approval
      .query(`INSERT INTO Users (username, password, approved) VALUES (@username, @password, @approved)`);

    res.status(CREATED).send('User registered successfully');
  } catch (err) {
    console.error('Error registering user:', err);
    res.status(INTERNAL_SERVER_ERROR).send('Server error');
  }
};