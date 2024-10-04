const express = require('express');
const router = express.Router();
const sql = require('mssql');
const pdfService = require('../services/pdfService');
const config = require('../config/dbConfig'); // Ensure this path is correct
const multer = require('multer'); // If you need file uploads

const {
    getCustomerData,
    getSalesData,
    getTargetData,
    getTierData,
    saveInvoice
} = require('../services/pdfService');  // Adjust the path if necessary

// Render the tax invoices page
router.get('/', (req, res) => {
    res.render('tax-invoices');  // This renders the 'tax-invoices.ejs' file
});

// Route to fetch the invoice records from the database
router.get('/list', async (req, res) => {
    const { page = 1, size = 10 } = req.query; // Handle pagination
    const offset = (page - 1) * size;

    try {
        const pool = await sql.connect();
        const result = await pool.request()
            .input('size', sql.Int, parseInt(size))
            .input('offset', sql.Int, parseInt(offset))
            .query(`
                SELECT InvoiceId, InvoiceNumber, CustomerName, InvoiceDate, TotalAmount, RepName
                FROM SunPharma.dbo.InvoiceRecords
                ORDER BY InvoiceDate DESC
                OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY;
            `);

        const invoices = result.recordset;

        if (invoices.length > 0) {
            res.json({
                success: true,
                data: invoices
            });
        } else {
            res.json({
                success: true,
                data: [],
                message: "No invoices found."
            });
        }
    } catch (error) {
        console.error('Error fetching invoices:', error);
        res.json({
            success: false,
            message: 'Error fetching invoice records.'
        });
    }
});

// Route to download the PDF invoice by invoiceId
router.get('/download-invoice/:invoiceId', async (req, res) => {
    const { invoiceId } = req.params;

    try {
        const pool = await sql.connect();  // Ensure pool is connected
        const result = await pool.request()
            .input('invoiceId', sql.Int, invoiceId)
            .query('SELECT PDFData FROM SunPharma.dbo.InvoiceRecords WHERE InvoiceId = @invoiceId');

        if (result.recordset.length === 0) {
            return res.status(404).send('Invoice not found');
        }

        const pdfData = result.recordset[0].PDFData;

        // Serve the PDF file as a download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoiceId}.pdf`);
        res.send(pdfData);
    } catch (error) {
        console.error('Error fetching invoice:', error);
        res.status(500).send('Server error while fetching invoice');
    }
});

// Route to generate invoice
router.post('/generate-invoice', async (req, res) => {
    const { customerId, startDate, endDate } = req.body;

    try {
        // Fetch customer data
        const customerData = await getCustomerData(customerId);

        // Validate if customerData exists and repName is present
        if (!customerData.repName) {
            throw new Error(`Rep name missing for customer ID: ${customerId}`);
        }

        const salesData = await getSalesData(customerId, startDate, endDate);

        // Ensure salesData is an array and calculate totalSales if needed
        const totalSales = salesData.reduce((sum, sale) => sum + sale.line_total, 0);

        const targetData = await getTargetData(customerId);
        const tierData = await getTierData(totalSales);

        // Process data and generate invoice
        const invoiceDetails = {
            customerId,
            totalAmount: totalSales,
            vatAmount: totalSales * 0.15, // example VAT calculation
            totalWithVAT: totalSales * 1.15,
            repName: customerData.repName,  // Ensure repName is included here
        };

        const invoiceId = await saveInvoice(invoiceDetails);
        res.status(200).json({ success: true, message: 'Invoice generated', invoiceId });
    } catch (error) {
        console.error('Error generating invoice:', error.message);  // Log the actual error message
        res.status(500).send('Error generating invoice');
    }
});


// Route to fetch customer data by customerId
router.get('/fetch-customer/:customerId', async (req, res) => {
    const { customerId } = req.params;

    try {
        const pool = await sql.connect();  // Assuming SQL connection is properly configured
        const result = await pool.request()
            .input('customerId', sql.Int, customerId)
            .query('SELECT * FROM Customers WHERE customerId = @customerId');

        if (result.recordset.length === 0) {
            return res.status(404).send('Customer not found');
        }

        res.json(result.recordset[0]);
    } catch (error) {
        console.error('Error fetching customer:', error);
        res.status(500).send('Error fetching customer data');
    }
});

module.exports = router;
