const sql = require('mssql');

// Fetch customer data from the database
async function getCustomerData(customerId) {
    const pool = await sql.connect();  // Ensure pool is connected
    const query = `SELECT * FROM Customers WHERE customerId = @customerId`;
    const result = await pool.request()
        .input('customerId', sql.Int, customerId)
        .query(query);
    return result.recordset[0];
}

// Fetch sales data for a customer within the date range
async function getSalesData(customerId, startDate, endDate) {
    const pool = await sql.connect();  // Ensure pool is connected
    const query = `SELECT * FROM Sales WHERE customer_name = (SELECT customerName FROM Customers WHERE customerId = @customerId) AND transaction_date BETWEEN @startDate AND @endDate`;
    const result = await pool.request()
        .input('customerId', sql.Int, customerId)
        .input('startDate', sql.Date, startDate)
        .input('endDate', sql.Date, endDate)
        .query(query);
    return result.recordset;
}

// Fetch target-based data for a customer
async function getTargetData(customerId) {
    const pool = await sql.connect();  // Ensure pool is connected
    const query = `SELECT * FROM Targets WHERE customer_name = (SELECT customerName FROM Customers WHERE customerId = @customerId)`;
    const result = await pool.request()
        .input('customerId', sql.Int, customerId)
        .query(query);
    return result.recordset[0];
}


// Fetch tier-based data for the customer
// Fetch tier-based data for the customer
async function getTierData(totalSales) {
    const pool = await sql.connect();  // Ensure pool is connected
    const query = `
        SELECT TOP 1 * 
        FROM Tiers 
        WHERE @totalSales >= [Minimum Purchase] 
        ORDER BY [Minimum Purchase] DESC
    `;
    const result = await pool.request()
        .input('totalSales', sql.Decimal(18, 2), totalSales)
        .query(query);
    return result.recordset[0];
}


// Fetch adhoc fees for the customer
async function getAdhocFeesData(customerId) {
    const pool = await sql.connect();  // Ensure pool is connected
    const query = `SELECT * FROM AdhocFees WHERE customerId = @customerId`;
    const result = await pool.request()
        .input('customerId', sql.Int, customerId)
        .query(query);
    return result.recordset;
}

// Save the generated invoice in the database
async function saveInvoice(invoiceDetails) {
    const pool = await sql.connect();  // Ensure pool is connected
    const query = `
        INSERT INTO Invoices (CustomerId, InvoiceDate, TotalAmount, VATAmount, TotalWithVAT, RepName)
        VALUES (@customerId, GETDATE(), @totalAmount, @vatAmount, @totalWithVAT, @repName);
        SELECT SCOPE_IDENTITY() AS InvoiceId;
    `;
    const result = await pool.request()
        .input('customerId', sql.Int, invoiceDetails.customerId)
        .input('totalAmount', sql.Decimal(18, 2), invoiceDetails.totalAmount)
        .input('vatAmount', sql.Decimal(18, 2), invoiceDetails.vatAmount)
        .input('totalWithVAT', sql.Decimal(18, 2), invoiceDetails.totalWithVAT)
        .input('repName', sql.NVarChar, invoiceDetails.repName)
        .query(query);
    return result.recordset[0].InvoiceId;
}

// Consolidate and export all the service functions
module.exports = {
    getCustomerData,
    getSalesData,
    getTargetData,
    getTierData,
    getAdhocFeesData,
    saveInvoice
};
