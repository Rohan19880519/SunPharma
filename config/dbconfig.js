const sqlConfig = {
  user: 'Rohan_Liligen',         // Your SQL Server username
  password: 'Columbus@12',       // Your SQL Server password
  database: 'SunPharma',         // Your database name
  server: 'localhost',           // Server name (or IP address, e.g., 'localhost' for local server)
  options: {
    encrypt: true,               // For Azure SQL or if you are using SSL/TLS encryption
    trustServerCertificate: true // Set to true if using self-signed certificates or localhost
  }
};

module.exports = sqlConfig;
