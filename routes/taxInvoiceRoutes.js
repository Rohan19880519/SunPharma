const express = require('express');
const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const { sql, poolPromise } = require('../config/dbconfig');  // Adjust the path as needed
const AdmZip = require('adm-zip');
const ejs = require('ejs');
const path = require('path');
const router = express.Router();
const fs = require('fs');  // File system to save PDFs

// Fetch and render tax invoices
router.get('/', async (req, res) => {
    try {
        const pool = await poolPromise;

        // Fetch invoices
        const invoicesResult = await pool.request().query(`
            SELECT TOP (1000) 
                [InvoiceId], [InvoiceNumber], [CustomerName], [InvoiceDate], 
                [TotalAmount], [RepName], [PDFData]
            FROM [SunPharma].[dbo].[InvoiceRecords]
        `);

        const invoices = invoicesResult.recordset || [];

        // Fetch customers
        const customersResult = await pool.request().query(`
            SELECT customerId, customerName 
            FROM [SunPharma].[dbo].[Customers]
        `);

        const customers = customersResult.recordset || [];

        // Render the EJS page, passing both invoices and customers to the view
        res.render('tax-invoices', { invoices, customers });
    } catch (err) {
        console.error('Error fetching data:', err);
        res.status(INTERNAL_SERVER_ERROR).send('Error fetching invoices or customers.');
    }
});

// Route to download all invoices in a ZIP folder
router.get('/download-invoices', async (req, res) => {
    const zip = new AdmZip();

    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT InvoiceNumber, RepName, PDFData FROM InvoiceRecords
        `);

        result.recordset.forEach(invoice => {
            const folderName = invoice.RepName || 'UnknownRep';
            const invoiceNumber = invoice.InvoiceNumber;
            const pdfBuffer = invoice.PDFData;

            zip.addFile(`${folderName}/${invoiceNumber}.pdf`, pdfBuffer);
        });

        const zipBuffer = zip.toBuffer();
        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', 'attachment; filename="all_invoices.zip"');
        res.send(zipBuffer);
    } catch (err) {
        console.error('Error fetching invoices:', err);
        res.status(INTERNAL_SERVER_ERROR).send('Error fetching invoices');
    }
});


// Helper function to generate PDF content
async function generatePDFContent(data) {
    const {
        invoiceNumber = 'N/A',
        invoiceDate = new Date().toLocaleDateString(),  // Set default to today's date
        customer_name_invoiced_to = 'N/A',
        customer_contact_person = 'N/A',
        customer_email = 'N/A',
        customer_address = 'N/A',
        customer_phone = 'N/A',
        customer_vat_number = 'N/A',
        customer_trading_name = 'N/A',
        supplier_name_invoiced_from = 'N/A',
        supplier_contact_name = 'N/A',
        supplier_email = 'N/A',
        supplier_phone = 'N/A',
        supplier_address = 'N/A',
        supplier_vat_number = 'N/A',
        supplier_bank_name = 'N/A',
        supplier_branch_code = 'N/A',
        supplier_bank_account = 'N/A',
        paymentMethod = 'N/A',
        totalAmount = 0.00,
        totalFees = 0.00,
        product_price = 'N/A',
        product_rep_name = 'N/A'
    } = data;

    // Calculate VAT and Total Including VAT
    const vatAmount = (totalAmount * 0.15).toFixed(2);
    const totalInclVAT = (totalAmount + parseFloat(vatAmount)).toFixed(2);

    return `
<html>
    <head>
        <title>Tax Invoice ${invoiceNumber}</title>
        <style>
            body {
                font-family: 'Century Gothic', Arial, sans-serif;
                background-color: #f4f4f4;
                margin: 0;
                padding: 10px; /* Reduced padding */
            }

            .invoice-container {
                background-color: #fff;
                padding: 10px; /* Reduced padding for compact display */
                max-width: 800px;
                margin: auto;
                box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
                border-radius: 8px;
                page-break-inside: avoid; /* Prevents page breaks within the container */
            }

            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px; /* Further reduced spacing */
                border-bottom: 2px solid #0066cc;
                padding-bottom: 5px; /* Further reduced padding */
            }

            .header h1 {
                margin: 0;
                font-size: 1.5em; /* Slightly reduced font size */
                color: #333;
            }

            h2 {
                background-color: #0066cc;
                color: #fff;
                padding: 4px; /* Reduced padding for compactness */
                font-size: 1.1em; /* Reduced font size */
                text-align: center;
                margin-top: 8px; /* Reduced margin */
                margin-bottom: 6px; /* Reduced margin */
                border-radius: 4px;
            }

            table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 8px; /* Reduced margin for compactness */
            }

            table th, table td {
                padding: 6px; /* Reduced padding for compactness */
                border: 1px solid #ddd;
                text-align: left;
                font-size: 0.9em; /* Slightly smaller font size */
            }

            table th {
                background-color: #e0e0e0;
                color: #333;
                font-weight: bold;
            }

            table tr:nth-child(even) {
                background-color: #f9f9f9;
            }

            .total-amount, .total-fees, .vat-amount, .total-incl-vat {
                text-align: right;
                font-weight: bold;
                font-size: 1em; /* Reduced font size */
                color: #0066cc;
            }

            .banking-details {
                margin-top: 8px; /* Reduced margin */
                padding: 8px; /* Reduced padding */
                background-color: #f0f0f0;
                border: 1px solid #ddd;
                border-radius: 8px;
                font-size: 0.9em; /* Slightly smaller font size */
            }

            .footer {
                text-align: center;
                font-size: 0.7em; /* Further reduced font size */
                color: #888;
                margin-top: 10px; /* Reduced margin */
            }
        </style>
    </head>
    <body>
        <div class="invoice-container">
            <!-- Header Section -->
            <div class="header">
                <h1>Tax Invoice</h1>
                <div>
                    <strong>Invoice Date:</strong> ${invoiceDate} <br>
                    <strong>Invoice Number:</strong> ${invoiceNumber}
                </div>
            </div>

            <!-- Company Details -->
            <h2>Company Details</h2>
            <table>
                <tr><th>Company Name</th><td>${customer_name_invoiced_to}</td></tr>
                <tr><th>Contact Person</th><td>${customer_contact_person}</td></tr>
                <tr><th>Email</th><td>${customer_email}</td></tr>
                <tr><th>Address</th><td>${customer_address}</td></tr>
                <tr><th>Telephone</th><td>${customer_phone}</td></tr>
                <tr><th>VAT Number</th><td>${customer_vat_number}</td></tr>
                <tr><th>Trading As</th><td>${customer_trading_name}</td></tr>
            </table>

            <!-- Customer Details -->
            <h2>Customer Details</h2>
            <table>
                <tr><th>Company Name</th><td>${supplier_name_invoiced_from}</td></tr>
                <tr><th>Contact Person</th><td>${supplier_contact_name}</td></tr>
                <tr><th>Email</th><td>${supplier_email}</td></tr>
                <tr><th>Address</th><td>${supplier_address}</td></tr>
                <tr><th>Telephone</th><td>${supplier_phone}</td></tr>
                <tr><th>VAT Number</th><td>${supplier_vat_number}</td></tr>
                <tr><th>Rep Name</th><td>${product_rep_name}</td></tr>
            </table>

            <!-- Invoice Information -->
            <h2>Invoice Information</h2>
            <table>
                <tr><th>Total Amount</th><td class="total-amount">${totalAmount.toFixed(2)}</td></tr>
                <tr><th>VAT Amount (15%)</th><td class="vat-amount">${vatAmount}</td></tr>
                <tr><th>Total Incl VAT</th><td class="total-incl-vat">${totalInclVAT}</td></tr>
            </table>

            <!-- Banking Details -->
            <div class="banking-details">
                <h3>Banking Details</h3>
                <p><strong>Bank Name:</strong> ${supplier_bank_name}</p>
                <p><strong>Branch Code:</strong> ${supplier_branch_code}</p>
                <p><strong>Account Number:</strong> ${supplier_bank_account}</p>
                <p><strong>Payment Method:</strong> ${paymentMethod}</p>
            </div>

            <div class="footer">
                <p>Thank you for your business!</p>
            </div>
        </div>

        <!-- Page 2 - Reconciliation Information -->
        <div class="invoice-container" style="page-break-before: always;">
            <h2>Reconciliation</h2>
            <table>
                <tr><th>Price of Product</th><td>${product_price}</td></tr>
            </table>
        </div>
    </body>
</html>
`;
}



// Tax Invoice Route - Generate tax invoices for qualified customers within a date range
router.post('/generate-invoice', async (req, res) => { // Make sure the main function is marked as async
    try {
        const { startDate, endDate, customerId } = req.body;

        console.log('Request received for generating invoice with startDate:', startDate, 'endDate:', endDate, 'customerId:', customerId);

        if (!startDate || !endDate || !customerId) {
            return res.status(BAD_REQUEST).json({ message: 'Start date, End date, and Customer ID are required.' });
        }

        const start = new Date(startDate).toISOString();
        const end = new Date(endDate).toISOString();

        const pool = await poolPromise;
        const customersResult = await pool.request()
            .input('CustomerId', sql.Int, customerId)
            .query(`
                SELECT customerId, customerName, groupYesNo, targetBased, tierBased, adhocBased, repName
                FROM [SunPharma].[dbo].[Customers]
                WHERE (targetBased = 1 OR tierBased = 1 OR adhocBased = 1)
                AND customerId = @CustomerId;
            `);

        const customers = customersResult.recordset;

        if (!customers || customers.length === 0) {
            return res.status(NOT_FOUND).json({ message: 'No customers found.' });
        }

        const browser = await puppeteer.launch();
        console.log('Puppeteer browser initialized');

        // Move the loop into an async function to handle await correctly
        await processCustomers(customers, start, end, pool, browser);

        await browser.close();
        res.status(SUCCESS).json({ message: 'Tax Invoices successfully generated.' });
    } catch (err) {
        console.error('Error generating tax invoices:', err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Error generating tax invoices', error: err.message });
    }
});

// Wrap the PDF generation logic in an async function
async function processCustomers(customers, start, end, pool, browser) {
    for (let customer of customers) {
        try {
            const { customerId, customerName, repName } = customer;
            console.log('Processing customer:', customerName);

            const feesResult = await pool.request()
                .input('CustomerName', sql.NVarChar, customerName)
                .input('StartDate', sql.DateTime, start)
                .input('EndDate', sql.DateTime, end)
                .query(`
					-- Step 1: Define ActiveCustomers to include customers eligible for target-based, tier-based, or adhoc-based fees
					WITH ActiveCustomers AS (
						SELECT 
							customerId, 
							customerName, 
							groupYesNo, 
							targetBased, 
							tierBased, 
							adhocBased,
							repName
						FROM [SunPharma].[dbo].[Customers]
						WHERE targetBased = 1 OR tierBased = 1 OR adhocBased = 1
					),

					-- Step 2: Handle Customer Groups
					CustomerGroups AS (
						SELECT 
							parent.customerId AS parentCustomerId, 
							parent.customerName AS parentCustomerName, 
							sub.subCustomerId
						FROM [SunPharma].[dbo].[Customers] parent
						LEFT JOIN [SunPharma].[dbo].[CustomerSubCustomers] sub 
						ON parent.customerId = sub.parentCustomerId
						WHERE parent.groupYesNo = 1
					),

					-- Step 3: Combine sales data from individual customers and customer groups
					CustomerSales AS (
						SELECT 
							s.customer_name, 
							s.product, 
							s.line_total, 
							s.supplier, 
							s.delivered_qty
						FROM [SunPharma].[dbo].[sales] s
						JOIN ActiveCustomers ac 
						ON s.customer_name = ac.customerName

						UNION ALL

						SELECT 
							cg.parentCustomerName AS customer_name, 
							s.product, 
							s.line_total, 
							s.supplier, 
							s.delivered_qty
						FROM [SunPharma].[dbo].[sales] s
						JOIN CustomerGroups cg 
						ON s.customer_name = cg.subCustomerId
					),

					-- Step 4: Exclude sales from wholesalers not activated for fees
					FilteredSales AS (
						SELECT 
							cs.customer_name, 
							cs.product, 
							cs.line_total, 
							cs.delivered_qty, 
							cs.supplier
						FROM CustomerSales cs
						WHERE cs.supplier NOT IN (
							SELECT wholesalerName 
							FROM [SunPharma].[dbo].[Wholesalers] 
							WHERE feesStatus = 'Not Activated'
						)
					),

					-- Step 5: Calculate target-based fees for eligible customers
					TargetBasedFees AS (
						SELECT 
							fs.customer_name,
							SUM(fs.line_total) AS total_sales,
							CASE 
								WHEN ac.targetBased = 1 AND SUM(fs.line_total) >= t.target 
								THEN SUM(fs.line_total) * t.DataFee / 100 
								ELSE 0 
							END AS target_fee
						FROM FilteredSales fs
						JOIN ActiveCustomers ac 
						ON fs.customer_name = ac.customerName
						LEFT JOIN [SunPharma].[dbo].[targets] t 
						ON fs.customer_name = t.customer_name
						GROUP BY fs.customer_name, ac.targetBased, t.target, t.DataFee
					),

					-- Step 6: Precompute Total Sales for use in Tier-based fees
					TotalSales AS (
						SELECT 
							fs.customer_name,
							SUM(fs.line_total) AS total_sales
						FROM FilteredSales fs
						GROUP BY fs.customer_name
					),

					-- Step 7: Calculate tier-based fees for eligible customers using precomputed Total Sales
					TierBasedFees AS (
						SELECT 
							ts.customer_name, 
							MAX(t.[Tier Percentage]) AS highest_tier_percentage,
							ts.total_sales,
							CASE 
								WHEN ac.tierBased = 1 
								THEN MAX(t.[Tier Percentage]) * ts.total_sales / 100 
								ELSE 0 
							END AS tier_fee
						FROM TotalSales ts
						JOIN ActiveCustomers ac 
						ON ts.customer_name = ac.customerName
						LEFT JOIN [SunPharma].[dbo].[Tiers] t 
						ON ts.total_sales >= t.[Minimum Purchase]
						GROUP BY ts.customer_name, ts.total_sales, ac.tierBased
					),

					-- Step 8: Calculate adhoc-based fees for eligible customers based on Total Sales
					AdhocBasedFees AS (
						SELECT 
							fs.customer_name, 
							SUM(fs.delivered_qty) AS total_quantity,  
							SUM(fs.line_total) AS total_value,        
							CASE 
								WHEN ac.adhocBased = 1 
								AND SUM(fs.delivered_qty) >= af.quantity_to_qualify 
								THEN af.data_fee * SUM(fs.line_total) / 100 
								ELSE 0 
							END AS adhoc_fee
						FROM FilteredSales fs
						JOIN ActiveCustomers ac 
						ON fs.customer_name = ac.customerName
						LEFT JOIN [SunPharma].[dbo].[AdhocFees] af 
						ON fs.product = af.products_description
						GROUP BY fs.customer_name, ac.adhocBased, af.quantity_to_qualify, af.data_fee
					),

					-- Step 9: Aggregate Adhoc Fees
					AdhocFeesSummary AS (
						SELECT 
							customer_name, 
							SUM(adhoc_fee) AS total_adhoc_fee
						FROM AdhocBasedFees
						GROUP BY customer_name
					)

					-- Step 10: Final result combining target-based, tier-based, and adhoc-based fees
					SELECT 
						tb.customer_name,
						tb.total_sales,
						tb.target_fee,
						tf.tier_fee,
						afs.total_adhoc_fee AS adhoc_fee,
						(tb.target_fee + tf.tier_fee + afs.total_adhoc_fee) AS total_fees,
						cd.registered_company_name AS supplier_name_invoiced_from,
						cd.trading_as AS supplier_trading_name,
						cd.physical_address AS supplier_address,
						cd.telephone_number AS supplier_phone,
						cd.finance_contact_person AS supplier_contact_name,
						cd.finance_email_address AS supplier_email,
						cd.vat_number AS supplier_vat_number,
						c.customerName AS customer_name_invoiced_to,
						c.tradingAs AS customer_trading_name,
						c.physicalAddress AS customer_address,
						c.telephoneNumber AS customer_phone,
						c.financeContact AS customer_contact_person,
						c.financeEmail AS customer_email,
						c.vatNumber AS customer_vat_number
					FROM TargetBasedFees tb
					LEFT JOIN TierBasedFees tf ON tb.customer_name = tf.customer_name
					LEFT JOIN AdhocFeesSummary afs ON tb.customer_name = afs.customer_name
					LEFT JOIN [SunPharma].[dbo].[CompanyDetails] cd ON 1=1  
					LEFT JOIN [SunPharma].[dbo].[Customers] c ON tb.customer_name = c.customerName
					WHERE (tb.target_fee + tf.tier_fee + afs.total_adhoc_fee) > 0;

                `);

            const fees = feesResult.recordset[0];
            const totalFees = fees ? fees.total_fees : 0;

            if (totalFees > 0) {
                const invoiceNumber = `INV-${customerId}-${Date.now()}`;

                // Ensure this is inside the async function
				const pdfContent = await generatePDFContent({
					invoiceNumber: invoiceNumber,
					customer_name_invoiced_to: fees.customer_name_invoiced_to,
					supplier_name_invoiced_from: fees.supplier_name_invoiced_from,
					supplier_address: fees.supplier_address,
					supplier_phone: fees.supplier_phone,
					supplier_contact_name: fees.supplier_contact_name,
					supplier_email: fees.supplier_email,
					supplier_vat_number: fees.supplier_vat_number,
					supplier_bank_name: fees.supplier_bank_name || ' ',
					supplier_branch_code: fees.supplier_branch_code || ' ',
					supplier_bank_account: fees.supplier_bank_account || ' ',
					paymentMethod: fees.paymentMethod || ' ',
					customer_address: fees.customer_address,
					customer_phone: fees.customer_phone,
					customer_contact_person: fees.customer_contact_person,
					customer_email: fees.customer_email,
					customer_vat_number: fees.customer_vat_number,
					totalAmount: totalFees,
					product_price: ' ',
					product_rep_name: customer.repName || ' ',
				});


                const page = await browser.newPage();
                await page.setContent(pdfContent);

                const pdfBuffer = await page.pdf();
                await page.close();

                const validBuffer = Buffer.from(pdfBuffer);

                console.log(`Generated PDF for customer ${customer.customerName}`);

                await pool.request()
                    .input('CustomerName', sql.NVarChar, customer.customerName)
                    .input('InvoiceNumber', sql.NVarChar, invoiceNumber)
                    .input('InvoiceDate', sql.DateTime, new Date())
                    .input('TotalAmount', sql.Decimal(18, 2), totalFees)
                    .input('PDFData', sql.VarBinary(sql.MAX), validBuffer)
                    .query(`
                        INSERT INTO InvoiceRecords (CustomerName, InvoiceNumber, InvoiceDate, TotalAmount, PDFData)
                        VALUES (@CustomerName, @InvoiceNumber, @InvoiceDate, @TotalAmount, @PDFData);
                    `);

                console.log(`Saved PDF for customer ${customer.customerName} in the database`);
            } else {
                console.log(`No fees found for customer: ${customerName}`);
            }
        } catch (error) {
            console.error(`Error processing customer ${customer.customerName}:`, error);
        }
    }
}


// Route to download a single invoice PDF
router.get('/download-invoice/:invoiceId', async (req, res) => {
    const invoiceId = req.params.invoiceId;  // Fetch the invoiceId from the URL

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('InvoiceId', sql.Int, invoiceId)  // Inject the invoiceId into the SQL query
            .query('SELECT PDFData FROM InvoiceRecords WHERE InvoiceId = @InvoiceId');

        if (result.recordset.length > 0) {
            const pdfBuffer = result.recordset[0].PDFData;  // Fetch the PDF data
            res.contentType('application/pdf');
            res.send(pdfBuffer);  // Send the PDF data as response
        } else {
            res.status(NOT_FOUND).send('Invoice not found');  // Handle case where invoice is not found
        }
    } catch (err) {
        console.error('Error fetching invoice:', err);
        res.status(INTERNAL_SERVER_ERROR).send('Error fetching invoice');
    }
});



module.exports = router;