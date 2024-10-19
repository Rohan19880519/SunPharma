const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const { sql, poolPromise } = require('../config/dbconfig');
const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Load environment variables

// Middleware for parsing form data
router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json());

// Nodemailer setup with environment variables for security
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Helper function to get the table name and columns from environment variables
function getQueryConfig() {
    const tableName = process.env.DB_TABLE_NAME || 'RBARequestRecords';
    const schema = process.env.DB_TABLE_SCHEMA || 'dbo';
    const columns = process.env.DB_COLUMNS ? process.env.DB_COLUMNS.split(',') : [
        'RequestId', 'PSRManagerName', 'BrandManager', 'Brands',
        'CustomerInformation', 'CustomerName', 'RequestDate',
        'AmountRequested', 'DetailsOfRequest', 'CardInformation',
        'ManagerApprovalStatus', 'BrandManagerApprovalStatus',
        'MarketingHeadApprovalStatus', 'HeadOfSalesApprovalStatus',
        'CreatedAt'
    ];
    return { tableName, schema, columns };
}

// Function to ensure the table exists or create it if it doesn't
async function ensureTableExists() {
    const { tableName, schema } = getQueryConfig();
    const createTableQuery = `
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${tableName}')
        BEGIN
            CREATE TABLE [${schema}].[${tableName}] (
                RequestId INT IDENTITY(1,1) PRIMARY KEY,
                PSRManagerName NVARCHAR(255),
                BrandManager NVARCHAR(255),
                Brands NVARCHAR(255),
                CustomerInformation NVARCHAR(255),
                CustomerName NVARCHAR(255),
                RequestDate DATE,
                AmountRequested NVARCHAR(255),
                DetailsOfRequest NVARCHAR(MAX),
                CardInformation NVARCHAR(255),
                ManagerApprovalStatus NVARCHAR(50),
                BrandManagerApprovalStatus NVARCHAR(50),
                MarketingHeadApprovalStatus NVARCHAR(50),
                HeadOfSalesApprovalStatus NVARCHAR(50),
                PDFData VARBINARY(MAX),
                CreatedAt DATETIME DEFAULT GETDATE()
            );
        END;
    `;

    try {
        const pool = await poolPromise;
        await pool.request().query(createTableQuery);
        console.log(`Table '${tableName}' verified or created successfully.`);
    } catch (error) {
        console.error('Error ensuring table exists:', error.message);
    }
}

// Call the ensureTableExists function when the application starts
ensureTableExists();

// Helper function to get the email of the approver based on their role
async function getApproverEmail(role) {
    const defaultApprovers = {
        'Manager': process.env.MANAGER_EMAIL || 'manager@example.com',
        'BrandManager': process.env.BRAND_MANAGER_EMAIL || 'brandmanager@example.com',
        'MarketingHead': process.env.MARKETING_HEAD_EMAIL || 'marketinghead@example.com',
        'HeadOfSales': process.env.HEAD_OF_SALES_EMAIL || 'headofsales@example.com'
    };

    // If environment variable lookup fails, try fetching from the database
    const email = defaultApprovers[role];
    if (email && email !== 'default@example.com') {
        return email;
    }

    // Fallback: Query the database for the approver email if not found in environment variables
    try {
        const pool = await poolPromise;
        const query = `
            SELECT email FROM Approvers WHERE role = @role
        `;
        const result = await pool.request()
            .input('role', sql.NVarChar, role)
            .query(query);

        if (result.recordset.length > 0) {
            return result.recordset[0].email;
        } else {
            console.warn(`No email found in the database for role: ${role}`);
            return 'default@example.com';
        }
    } catch (error) {
        console.error('Error fetching approver email from database:', error);
        return 'default@example.com';
    }
}

// Helper function to determine the next role in the approval process
function getNextRole(currentRole) {
    const approvalOrder = ['Manager', 'BrandManager', 'MarketingHead', 'HeadOfSales'];
    const currentIndex = approvalOrder.indexOf(currentRole);
    return currentIndex >= 0 && currentIndex < approvalOrder.length - 1
        ? approvalOrder[currentIndex + 1]
        : null;
}

// Helper function to send an email for approval request
async function sendApprovalEmail(role, requestId, pdfBuffer) {
    const email = await getApproverEmail(role);

    // Check if email is valid
    if (!email) {
        console.error(`No valid email address found for role: ${role}`);
        return; // Gracefully exit if email is missing
    }

    const approveUrl = `${process.env.SERVER_URL}/representatives/approval/${requestId}/${role}/approve`;
    const rejectUrl = `${process.env.SERVER_URL}/representatives/approval/${requestId}/${role}/reject`;

    // Ensure pdfBuffer is a valid Buffer instance
    if (!Buffer.isBuffer(pdfBuffer)) {
        console.error('Invalid PDF Buffer, expected a Buffer instance.');
        return; // Exit if PDF buffer is not valid
    }

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `Approval Request: ${role}`,
        html: `<p>You have a new request for funds approval.</p>
               <p>Please review the attached PDF and click one of the options below:</p>
               <a href="${approveUrl}">Approve</a> | <a href="${rejectUrl}">Reject</a>`,
        attachments: [{ filename: 'RequestForFunds.pdf', content: pdfBuffer }]
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${email}: ${info.response}`);
    } catch (error) {
        console.error(`Error sending email to ${email}:`, error);
    }
}

// Helper function to send email to Finance
async function sendFinanceEmail(requestId, pdfBuffer) {
    const email = process.env.FINANCE_EMAIL;

    // Check if finance email is defined
    if (!email) {
        console.error('FINANCE_EMAIL is not defined in environment variables.');
        return; // Exit if finance email is missing
    }

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `Funds Request Approved by Head of Sales - Request ID: ${requestId}`,
        html: `<p>The request with ID <strong>${requestId}</strong> has been approved by the Head of Sales.</p>
               <p>Please proceed with the necessary financial processes.</p>
               <p>Attached is the approved request PDF for your records.</p>`,
        attachments: [{ filename: `ApprovedRequestForFunds_${requestId}.pdf`, content: pdfBuffer }]
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`Finance email sent to ${email}: ${info.response}`);
    } catch (error) {
        console.error(`Error sending email to finance (${email}):`, error);
    }
}

// Helper function to fetch the PDF buffer for a specific request
async function fetchPDFBuffer(requestId) {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('RequestId', sql.Int, requestId)
            .query('SELECT PDFData FROM RBARequestRecords WHERE RequestId = @RequestId');

        if (result.recordset.length > 0) {
            return result.recordset[0].PDFData;
        } else {
            console.error(`No PDF data found for Request ID: ${requestId}`);
            return null;
        }
    } catch (error) {
        console.error('Error fetching PDF data:', error);
        throw new Error('Error fetching PDF data');
    }
}

// Route to render the request funds form with approval information
router.get('/representatives/request-funds', async (req, res) => {
    try {
        const { tableName, schema, columns } = getQueryConfig();
        const query = `SELECT ${columns.join(', ')} FROM [${schema}].[${tableName}] ORDER BY [CreatedAt] DESC`;
        const pool = await poolPromise;
        const result = await pool.request().query(query);
        const approvalData = result.recordset || [];
        res.render('request-funds', { approvalData });
    } catch (error) {
        console.error('Error fetching approval data:', error.message);
        res.render('request-funds', { approvalData: [] });
    }
});

// Handle form submission and initiate approval process
router.post('/representatives/request-funds', async (req, res) => {
    try {
        const formData = req.body;
        if (!formData || Object.keys(formData).length === 0) {
            throw new Error('Form data is empty. Please check if the form fields are named correctly.');
        }

        const companyDetails = await getCompanyDetails();
        const pdfBuffer = await generatePDF(formData, companyDetails);
        console.log('Generated PDF Buffer is Buffer:', Buffer.isBuffer(pdfBuffer)); // Should log: true
        const validPdfBuffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);

        const pool = await poolPromise;
        const { tableName, schema } = getQueryConfig();
        const result = await pool.request()
            .input('PSRManagerName', sql.NVarChar, formData.psr_manager_name)
            .input('BrandManager', sql.NVarChar, formData.brand_manager)
            .input('Brands', sql.NVarChar, formData.brands)
            .input('CustomerInformation', sql.NVarChar, formData.customer_information)
            .input('CustomerName', sql.NVarChar, formData.customer_name)
            .input('RequestDate', sql.Date, formData.request_date)
            .input('AmountRequested', sql.NVarChar, formData.amount_requested)
            .input('DetailsOfRequest', sql.NVarChar, formData.details_of_request)
            .input('CardInformation', sql.NVarChar, formData.card_information)
            .input('PDFData', sql.VarBinary(sql.MAX), validPdfBuffer)
            .query(`
                INSERT INTO [${schema}].[${tableName}]
                (PSRManagerName, BrandManager, Brands, CustomerInformation, CustomerName, 
                RequestDate, AmountRequested, DetailsOfRequest, CardInformation, PDFData) 
                VALUES 
                (@PSRManagerName, @BrandManager, @Brands, @CustomerInformation, @CustomerName, 
                @RequestDate, @AmountRequested, @DetailsOfRequest, @CardInformation, @PDFData);
                SELECT SCOPE_IDENTITY() AS RequestId;
            `);

        const requestId = result.recordset[0].RequestId;

        // Await the sendApprovalEmail function
        await sendApprovalEmail('Manager', requestId, validPdfBuffer);

        res.status(SUCCESS).json({ message: 'Request for funds saved successfully!' });
    } catch (err) {
        console.error('Error saving request for funds:', err);
        res.status(INTERNAL_SERVER_ERROR).send('Error saving request for funds');
    }
});

// Approve or Reject a Request for a specific role and regenerate PDF
router.post('/representatives/approval/:requestId/:role/:action', async (req, res) => {
    const { requestId, role, action } = req.params;

    const validRoles = {
        'Manager': 'ManagerApprovalStatus',
        'BrandManager': 'BrandManagerApprovalStatus',
        'MarketingHead': 'MarketingHeadApprovalStatus',
        'HeadOfSales': 'HeadOfSalesApprovalStatus'
    };

    if (!['approve', 'reject'].includes(action) || !validRoles[role]) {
        return res.status(BAD_REQUEST).json({ message: 'Invalid action or role' });
    }

    try {
        const pool = await poolPromise;
        const statusField = validRoles[role];

        // Update the approval status in the database
        await pool.request()
            .input('RequestId', sql.Int, requestId)
            .input('NewStatus', sql.NVarChar, action === 'approve' ? 'Approved' : 'Rejected')
            .query(`
                UPDATE RBARequestRecords
                SET ${statusField} = @NewStatus
                WHERE RequestId = @RequestId
            `);

        // Fetch the complete record from the database to get all original data
        const result = await pool.request()
            .input('RequestId', sql.Int, requestId)
            .query('SELECT * FROM RBARequestRecords WHERE RequestId = @RequestId');

        const updatedRequest = result.recordset[0];
        if (!updatedRequest) {
            throw new Error('No data found for the provided Request ID');
        }

        // Fetch company details to include in the PDF
        const companyDetails = await getCompanyDetails();

        // Create a comprehensive formData object with the complete data
        const formData = {
            psr_manager_name: updatedRequest.PSRManagerName || 'N/A',
            brand_manager: updatedRequest.BrandManager || 'N/A',
            brands: updatedRequest.Brands || 'N/A',
            customer_information: updatedRequest.CustomerInformation || 'N/A',
            customer_name: updatedRequest.CustomerName || 'N/A',
            request_date: updatedRequest.RequestDate ? updatedRequest.RequestDate.toISOString().split('T')[0] : 'N/A',
            amount_requested: updatedRequest.AmountRequested || 'N/A',
            details_of_request: updatedRequest.DetailsOfRequest || 'N/A',
            card_information: updatedRequest.CardInformation || 'N/A'
        };

        // Create the approvalStatuses object with the latest approval statuses
        const approvalStatuses = {
            ManagerApprovalStatus: updatedRequest.ManagerApprovalStatus || 'Pending',
            BrandManagerApprovalStatus: updatedRequest.BrandManagerApprovalStatus || 'Pending',
            MarketingHeadApprovalStatus: updatedRequest.MarketingHeadApprovalStatus || 'Pending',
            HeadOfSalesApprovalStatus: updatedRequest.HeadOfSalesApprovalStatus || 'Pending'
        };

        // Generate the updated PDF with the complete data
        const updatedPdfBuffer = await generatePDF(formData, companyDetails, approvalStatuses);
        console.log('Generated PDF Buffer is Buffer:', Buffer.isBuffer(updatedPdfBuffer)); // Should log: true
        const validPdfBuffer = Buffer.isBuffer(updatedPdfBuffer) ? updatedPdfBuffer : Buffer.from(updatedPdfBuffer);

        // Save the updated PDF back to the database
        await pool.request()
            .input('RequestId', sql.Int, requestId)
            .input('UpdatedPDFData', sql.VarBinary(sql.MAX), validPdfBuffer)
            .query(`
                UPDATE RBARequestRecords
                SET PDFData = @UpdatedPDFData
                WHERE RequestId = @RequestId
            `);

        // Determine if this is the final approval step
        if (role === 'HeadOfSales' && action === 'approve') {
            // Send email to finance
            await sendFinanceEmail(requestId, validPdfBuffer);
        } else {
            // Notify the next approver if applicable
            const nextRole = getNextRole(role);
            if (nextRole) {
                await sendApprovalEmail(nextRole, requestId, validPdfBuffer);
            }
        }

        res.status(SUCCESS).json({ message: `Request ${action}d successfully for ${role}` });
    } catch (error) {
        console.error('Error updating approval status:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Error updating approval status' });
    }
});

// Helper function to convert image to base64
function getImageBase64(imagePath) {
    try {
        const image = fs.readFileSync(path.resolve(__dirname, imagePath));
        return `data:image/png;base64,${image.toString('base64')}`;
    } catch (error) {
        console.error('Error converting image to base64:', error);
        return ''; // Return an empty string if there's an error
    }
}

// Helper function to fetch company details
async function getCompanyDetails() {
    const schema = process.env.COMPANY_SCHEMA || 'dbo';
    const tableName = process.env.COMPANY_TABLE || 'CompanyDetails';

    const pool = await poolPromise;
    const query = `
        SELECT TOP (1) 
            [registered_company_name], [trading_as], [physical_address], 
            [telephone_number], [finance_contact_person], [finance_email_address], 
            [vat_number] FROM [${schema}].[${tableName}]
    `;

    const result = await pool.request().query(query);
    return result.recordset[0];
}

// PDF generation with company logo and details
async function generatePDF(formData, companyDetails, approvalStatuses = {}) {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    const logoBase64 = getImageBase64('../assets/images/logo.png'); // Ensure path is correct

    // Set the content of the page for PDF generation
    await page.setContent(`
        <html>
            <head>
                <style>
                    body { font-family: 'Century Gothic', Arial, sans-serif; color: #333; margin: 20px; }
                    .header { display: flex; align-items: center; border-bottom: 2px solid #7b8b9c; padding-bottom: 10px; margin-bottom: 20px; }
                    .header img { height: 60px; margin-right: 20px; }
                    .company-details { font-size: 14px; line-height: 1.5; }
                    .content h2 { color: #7b8b9c; text-align: center; border-bottom: 2px solid #7b8b9c; padding-bottom: 5px; margin-bottom: 20px; }
                    .content p { font-size: 16px; margin: 5px 0; }
                    .content .section-title { font-weight: bold; margin-top: 20px; color: #e27618; }
                    .approval-section { margin-top: 20px; }
                    .approval-status { font-size: 14px; margin: 5px 0; }
                </style>
            </head>
            <body>
                <div class="header">
                    <img src="${logoBase64}" alt="Company Logo">
                    <div class="company-details">
                        <p><strong>${companyDetails.registered_company_name}</strong></p>
                        <p>Trading As: ${companyDetails.trading_as}</p>
                        <p>Address: ${companyDetails.physical_address}</p>
                        <p>Telephone: ${companyDetails.telephone_number}</p>
                        <p>Finance Contact: ${companyDetails.finance_contact_person} (${companyDetails.finance_email_address})</p>
                        <p>VAT Number: ${companyDetails.vat_number}</p>
                    </div>
                </div>

                <div class="content">
                    <h2>Request for Funds</h2>
                    <p class="section-title">Request Details</p>
                    <p><strong>PSR and Manager's Name:</strong> ${formData.psr_manager_name}</p>
                    <p><strong>Brand Manager:</strong> ${formData.brand_manager}</p>
                    <p><strong>Brand / Brands:</strong> ${formData.brands}</p>
                    <p><strong>Customer Information:</strong> ${formData.customer_information}</p>
                    <p><strong>Customer / Store Name:</strong> ${formData.customer_name}</p>
                    <p><strong>Date of Request:</strong> ${formData.request_date}</p>
                    <p><strong>Amount Requested:</strong> ${formData.amount_requested}</p>
                    <p><strong>Details of Request:</strong> ${formData.details_of_request}</p>
                    <p><strong>Slip Mate Account/Card Information:</strong> ${formData.card_information}</p>

                    <div class="approval-section">
                        <h2>Approval Status</h2>
                        <p class="approval-status"><strong>Manager Approval:</strong> ${approvalStatuses.ManagerApprovalStatus}</p>
                        <p class="approval-status"><strong>Brand Manager Approval:</strong> ${approvalStatuses.BrandManagerApprovalStatus}</p>
                        <p class="approval-status"><strong>Marketing Head Approval:</strong> ${approvalStatuses.MarketingHeadApprovalStatus}</p>
                        <p class="approval-status"><strong>Head of Sales Approval:</strong> ${approvalStatuses.HeadOfSalesApprovalStatus}</p>
                    </div>
                </div>
            </body>
        </html>
    `);

    // Ensure we get a Buffer directly from Puppeteer
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    // Explicitly return a Buffer to avoid issues with Nodemailer attachments
    return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
}

// Endpoint to handle PDF download
router.get('/representatives/download-pdf/:requestId', async (req, res) => {
    const { requestId } = req.params;
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('RequestId', sql.Int, requestId)
            .query('SELECT PDFData FROM RBARequestRecords WHERE RequestId = @RequestId');

        if (result.recordset.length > 0) {
            const pdfData = result.recordset[0].PDFData;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=RequestForFunds_${requestId}.pdf`);
            res.send(pdfData);
        } else {
            res.status(NOT_FOUND).send('PDF not found');
        }
    } catch (error) {
        console.error('Error fetching PDF data:', error);
        res.status(INTERNAL_SERVER_ERROR).send('Error fetching PDF data');
    }
});

module.exports = router;
