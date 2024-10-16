const express = require('express');
const multer = require('multer');
const sql = require('mssql');
const sqlConfig = require('../config/dbConfig');
const xlsx = require('xlsx');
const fs = require('fs');
const router = express.Router();



// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Helper function to convert Excel serial date to JavaScript date
function excelDateToJSDate(serial) {
    const utc_days = Math.floor(serial - 25569); // 25569 is the offset for Excel dates starting from 1900
    const utc_value = utc_days * 86400; // 86400 seconds in a day
    const date_info = new Date(utc_value * 1000); // Convert to milliseconds
    return new Date(date_info.getUTCFullYear(), date_info.getUTCMonth(), date_info.getUTCDate());
}

// Helper function to format dates to YYYY-MM-DD for SQL Server
function formatDate(dateStr) {
    if (typeof dateStr === 'number') {
        // Handle Excel serial dates
        return excelDateToJSDate(dateStr).toISOString().split('T')[0];  // Returns YYYY-MM-DD
    } else {
        // Handle regular date strings
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];  // Returns YYYY-MM-DD
        }
    }
    return null;
}

// Helper function to sanitize and validate the invoice number
function sanitizeInvoiceNumber(invoiceNumber) {
    // Ensure the value is a string and sanitize it
    if (typeof invoiceNumber !== 'string') {
        return String(invoiceNumber).trim();  // Convert to string and trim spaces
    }
    return invoiceNumber.trim();
}

// POST route to handle sales file upload and insert into SQL database
router.post('/upload-sales', upload.single('fileUpload'), async (req, res) => {
    const file = req.file;

    if (!file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    try {
        let pool = await sql.connect(sqlConfig);
        const workbook = xlsx.readFile(file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const salesData = xlsx.utils.sheet_to_json(sheet);

        for (const sale of salesData) {
            const transactionNumber = sale['Transaction_Number'];
            const deliveredQty = sale['Delivered_Qty'];
            const sep = sale['SEP'];
            const transactionDate = formatDate(sale['Transaction_Date']);  // Use the updated formatDate function
            const transactionType = sale['Transaction_Type'] || '';
            let invoiceNumber = sale['Invoice_Number'] || '';
            const customerName = sale['Customer_Name'] || '';
            const product = sale['Product'] || '';
            const ssdSra = sale['SSD_SRA'] || '';
            const supplier = sale['Supplier'] || '';
            const lineTotal = sale['Line_Total'];

            // Sanitize and log invoiceNumber for debugging
            invoiceNumber = sanitizeInvoiceNumber(invoiceNumber);
            console.log('Processing Invoice Number:', invoiceNumber);

            // Skip the sale if the transactionDate is invalid
            if (!transactionDate) {
                console.error(`Invalid transactionDate for Transaction Number: ${transactionNumber}`);
                continue;
            }

            await pool.request()
                .input('transactionNumber', sql.Int, transactionNumber)
                .input('deliveredQty', sql.Int, deliveredQty)
                .input('sep', sql.Decimal(10, 2), sep)
                .input('transactionDate', sql.Date, transactionDate)
                .input('transactionType', sql.NVarChar, transactionType)
                .input('invoiceNumber', sql.NVarChar, invoiceNumber)
                .input('customerName', sql.NVarChar, customerName)
                .input('product', sql.NVarChar, product)
                .input('ssdSra', sql.NVarChar, ssdSra)
                .input('supplier', sql.NVarChar, supplier)
                .input('lineTotal', sql.Decimal(10, 2), lineTotal)
                .query(`
                    INSERT INTO Sales (
                        transaction_number,
                        delivered_qty,
                        sep,
                        transaction_date,
                        transaction_type,
                        invoice_number,
                        customer_name,
                        product,
                        ssd_sra,
                        supplier,
                        line_total
                    ) VALUES (
                        @transactionNumber,
                        @deliveredQty,
                        @sep,
                        @transactionDate,
                        @transactionType,
                        @invoiceNumber,
                        @customerName,
                        @product,
                        @ssdSra,
                        @supplier,
                        @lineTotal
                    )
                `);
        }

        // Remove the uploaded file after processing
        fs.unlinkSync(file.path);
        res.json({ success: true, message: 'Sales data uploaded and inserted successfully' });
    } catch (error) {
        console.error('Error processing file or inserting data:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;


router.get('/load-more', async (req, res) => {  
    const page = parseInt(req.query.page) || 1;  // Default to page 1 if no page is provided
    const pageSize = 20;  // Number of records per page
    const offset = (page - 1) * pageSize;

    try {
        let pool = await sql.connect(sqlConfig);
        const result = await pool.request()
            .query(`
                SELECT 
                    transaction_number AS Transaction_Number,
                    delivered_qty AS Delivered_Qty,
                    sep AS SEP,
                    transaction_date AS Transaction_Date,
                    transaction_type AS Transaction_Type,
                    invoice_number AS Invoice_Number,
                    customer_name AS Customer_Name,
                    product AS Product,
                    ssd_sra AS SSD_SRA,
                    supplier AS Supplier,
                    line_total AS Line_Total
                FROM [SunPharma].[dbo].[sales]
                ORDER BY transaction_number
                OFFSET ${offset} ROWS
                FETCH NEXT ${pageSize} ROWS ONLY
            `);

        const salesData = result.recordset;

        // Log to see if the paginated data is fetched correctly
        console.log(`Fetched sales data for page ${page}:`, salesData);

        res.json({ salesData });  // Return paginated data to the frontend
    } catch (error) {
        console.error('Error fetching sales data:', error);
        res.status(500).json({ success: false, message: 'Error fetching sales data' });
    }
});




module.exports = router;



// Route to fetch sales data with pagination
router.get('/', async (req, res) => {  // Adjusted to root route
    const page = parseInt(req.query.page) || 1;
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    try {
        let pool = await sql.connect(sqlConfig);
        const result = await pool.request()
            .query(`
                SELECT 
                    transaction_number AS Transaction_Number,
                    delivered_qty AS Delivered_Qty,
                    sep AS SEP,
                    transaction_date AS Transaction_Date,
                    transaction_type AS Transaction_Type,
                    invoice_number AS Invoice_Number,
                    customer_name AS Customer_Name,
                    product AS Product,
                    ssd_sra AS SSD_SRA,
                    supplier AS Supplier,
                    line_total AS Line_Total
                FROM [SunPharma].[dbo].[sales]
                ORDER BY transaction_number
                OFFSET ${offset} ROWS
                FETCH NEXT ${pageSize} ROWS ONLY`);

        const salesData = result.recordset;
        res.render('sales', { salesData });
    } catch (error) {
        console.error('Error fetching sales data:', error);
        res.status(500).json({ success: false, message: 'Error fetching sales data' });
    }
});

router.get('/search', async (req, res) => {
    const searchQuery = req.query.query;

    if (!searchQuery) {
        return res.status(400).json({ success: false, message: 'No search query provided' });
    }

    try {
        let pool = await sql.connect(sqlConfig);
        const result = await pool.request()
            .input('searchQuery', sql.NVarChar, `%${searchQuery}%`)
            .query(`
                SELECT 
                    transaction_number AS Transaction_Number,
                    delivered_qty AS Delivered_Qty,
                    sep AS SEP,
                    transaction_date AS Transaction_Date,
                    transaction_type AS Transaction_Type,
                    invoice_number AS Invoice_Number,
                    customer_name AS Customer_Name,
                    product AS Product,
                    ssd_sra AS SSD_SRA,
                    supplier AS Supplier,
                    line_total AS Line_Total
                FROM [SunPharma].[dbo].[sales]
                WHERE 
                    customer_name LIKE @searchQuery OR
                    transaction_number LIKE @searchQuery OR
                    invoice_number LIKE @searchQuery OR
                    product LIKE @searchQuery OR
                    supplier LIKE @searchQuery
                ORDER BY transaction_number
            `);

        const salesData = result.recordset;
        res.json({ salesData });
    } catch (error) {
        console.error('Error fetching search results:', error);
        res.status(500).json({ success: false, message: 'Error fetching search results' });
    }
});


module.exports = router;