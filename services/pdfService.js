const PDFDocument = require('pdfkit');
const sql = require('mssql');

// Fetch customer data from the database
async function getCustomerData(customerId) {
    const pool = await sql.connect();  // Ensure pool is connected
    const query = `
        SELECT customerId, customerName, repName, companyName, tradingAs, vatNumber, paymentMethod 
        FROM SunPharma.dbo.Customers 
        WHERE customerId = @customerId
    `;
    const result = await pool.request()
        .input('customerId', sql.Int, customerId)
        .query(query);

    if (!result.recordset || result.recordset.length === 0) {
        throw new Error(`Customer with ID ${customerId} not found`);
    }

    return result.recordset[0];  // This should include repName
}


// Fetch sales data for a customer within the date range
async function getSalesData(customerId, startDate, endDate) {
    const pool = await sql.connect();  // Ensure pool is connected
    const query = `
        SELECT * FROM Sales 
        WHERE customer_name IN (
            SELECT customerName FROM Customers WHERE customerId = @customerId
            UNION
            SELECT subCustomerId FROM CustomerSubCustomers WHERE parentCustomerId = @customerId
        )
        AND transaction_date BETWEEN @startDate AND @endDate;
    `;
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
    const query = `
        SELECT t.* 
        FROM Targets t 
        JOIN Customers c ON t.customer_name = c.customerName 
        WHERE c.customerId = @customerId
    `;
    const result = await pool.request()
        .input('customerId', sql.Int, customerId)
        .query(query);
    return result.recordset[0];
}

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

// Save the generated invoice in the database
async function saveInvoice(invoiceDetails) {
    if (!invoiceDetails || !invoiceDetails.repName) {
        throw new Error('repName is missing in invoice details');
    }

    const pool = await sql.connect();  // Ensure pool is connected
    const query = `
        INSERT INTO Invoices (CustomerId, InvoiceDate, TotalAmount, VATAmount, TotalWithVAT, RepName)
        VALUES (@customerId, GETDATE(), @totalAmount, @vatAmount, @totalWithVAT, @repName);
        SELECT SCOPE_IDENTITY() AS InvoiceId;
    `;
    const result = await pool.request()
        .input('customerId', sql.Int, invoiceDetails.customerId)
        .input('totalAmount', sql.Decimal, invoiceDetails.totalAmount)
        .input('vatAmount', sql.Decimal, invoiceDetails.vatAmount)
        .input('totalWithVAT', sql.Decimal, invoiceDetails.totalWithVAT)
        .input('repName', sql.NVarChar, invoiceDetails.repName || 'Unknown')  // Provide default value
        .query(query);
    return result.recordset[0].InvoiceId;
}

// Generate PDF for the tax invoice
async function generateInvoicePDF(customer, invoiceDetails) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument();
            const buffers = [];
    
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });
    
            // Page 1 - Customer Details and Fee Breakdown
            doc.text(`Invoice for ${customer.customerName}`);
            doc.text(`Invoice Date: ${new Date().toLocaleDateString()}`);
            doc.text(`Total Amount: ${invoiceDetails.totalAmount}`);
            doc.text(`VAT: ${invoiceDetails.vatAmount}`);
            doc.text(`Total (Incl. VAT): ${invoiceDetails.totalWithVAT}`);
    
            // Page 2 - Sales Breakdown
            doc.addPage();
            doc.text('Sales Breakdown');
            invoiceDetails.sales.forEach(sale => {
                doc.text(`Date: ${sale.transactionDate}, Product: ${sale.product}, Qty: ${sale.deliveredQty}, Total: ${sale.lineTotal}`);
            });
    
            // Page 3 - Product Summary
            doc.addPage();
            doc.text('Product Summary');
            const productSummary = summarizeProducts(invoiceDetails.sales);
            productSummary.forEach(product => {
                doc.text(`Product: ${product.name}, Total Qty: ${product.totalQty}, Total Value: ${product.totalValue}`);
            });
    
            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

// Helper function to summarize product data
function summarizeProducts(sales) {
    const summary = {};
    sales.forEach(sale => {
        if (!summary[sale.product]) {
            summary[sale.product] = { name: sale.product, totalQty: 0, totalValue: 0 };
        }
        summary[sale.product].totalQty += sale.deliveredQty;
        summary[sale.product].totalValue += sale.lineTotal;
    });
    return Object.values(summary);
}

module.exports = {
    getCustomerData,
    getSalesData,
    getTargetData,
    getTierData,
    saveInvoice,
    generateInvoicePDF,
    summarizeProducts
};
