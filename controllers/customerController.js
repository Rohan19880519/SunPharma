const sql = require('mssql');
const sqlConfig = require('../config/dbConfig');
const xlsx = require('xlsx');
const fs = require('fs');

// Get all customers
exports.getAllCustomers = async (req, res) => {
    try {
        let pool = await sql.connect(sqlConfig);
        let result = await pool.request().query('SELECT * FROM Customers');
        res.render('customers', { customers: result.recordset });
    } catch (err) {
        console.error('Error fetching customers:', err);
        res.status(500).send('Server Error');
    }
};

// Utility function to sanitize telephone numbers and other strings
const sanitizeNumber = (number) => {
    return number && typeof number === 'string' ? number.replace(/[^\d]/g, '') : null;
};

const sanitizeString = (input) => {
    return input && typeof input === 'string' ? input.trim() : null;
};

// Upload customers from the frontend (Excel upload)
exports.uploadCustomers = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded');
        }

        // Read the uploaded Excel file
        const filePath = req.file.path;
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const customers = xlsx.utils.sheet_to_json(worksheet);

        let pool = await sql.connect(sqlConfig);

        for (const customer of customers) {
            // Sanitize all inputs
            const vatNumber = sanitizeString(customer['VAT Number']);
            const telephoneNumber = sanitizeNumber(customer['TelephoneNumber']);
            const faxNumber = sanitizeNumber(customer['FaxNumber']);
            const branchCode = sanitizeNumber(customer['Branch Code']);
            const bankAccount = sanitizeNumber(customer['Bank Account Number']);
            const companyCC = sanitizeString(customer['Company CC/ Number']); // Important fix

            // Check for valid telephoneNumber and bankAccount, log and skip invalid records
            if (!telephoneNumber || !bankAccount) {
                console.error('Invalid telephone number or bank account:', telephoneNumber, bankAccount);
                continue;
            }

            await pool.request()
                .input('customerName', sql.VarChar, sanitizeString(customer['Customer Name']) || '')
                .input('companyName', sql.VarChar, sanitizeString(customer['Registered Company Name']) || '')
                .input('tradingAs', sql.VarChar, sanitizeString(customer['Trading As']) || '')
                .input('physicalAddress', sql.VarChar, sanitizeString(customer['Physical Address']) || '')
                .input('postalAddress', sql.VarChar, sanitizeString(customer['Postal Address']) || '')
                .input('telephoneNumber', sql.VarChar, telephoneNumber)
                .input('faxNumber', sql.VarChar, faxNumber)
                .input('financeContact', sql.VarChar, sanitizeString(customer['Finance Contact Person']) || '')
                .input('financeEmail', sql.VarChar, sanitizeString(customer['Finance Email Address']) || '')
                .input('buyerName', sql.VarChar, sanitizeString(customer['Buyer Name']) || '')
                .input('buyerEmail', sql.VarChar, sanitizeString(customer['Buyer Email Address']) || '')
                .input('companyCC', sql.VarChar, companyCC)  // Sanitize companyCC field
                .input('vatNumber', sql.VarChar, vatNumber)
                .input('paymentMethod', sql.VarChar, sanitizeString(customer['Payment Method']) || '')
                .input('bankName', sql.VarChar, sanitizeString(customer['Bank Name']) || '')
                .input('branchName', sql.VarChar, sanitizeString(customer['Branch Name']) || '')
                .input('branchCode', sql.VarChar, branchCode)
                .input('bankAccount', sql.VarChar, bankAccount)
                .input('internalAccount', sql.VarChar, sanitizeString(customer['Internal Account Number']) || '')
                .input('repName', sql.VarChar, sanitizeString(customer['Rep Name']) || '')
                .input('targetBased', sql.Bit, customer['Target Based'] === 'Yes' ? 1 : 0)
                .input('tierBased', sql.Bit, customer['Tier Based'] === 'Yes' ? 1 : 0)
                .input('adhocBased', sql.Bit, customer['Adhoc Based'] === 'Yes' ? 1 : 0)
				.input('groupYesNo', sql.VarChar, sanitizeString(customer['Group Yes or No']) || '')
                .query(`
                    INSERT INTO Customers (
                        customerName, companyName, tradingAs, physicalAddress, postalAddress, telephoneNumber, faxNumber, 
                        financeContact, financeEmail, buyerName, buyerEmail, companyCC, vatNumber, paymentMethod, bankName, branchName, 
                        branchCode, bankAccount, internalAccount, repName, targetBased, tierBased, adhocBased
                    )
                    VALUES (
                        @customerName, @companyName, @tradingAs, @physicalAddress, @postalAddress, @telephoneNumber, @faxNumber, 
                        @financeContact, @financeEmail, @buyerName, @buyerEmail, @companyCC, @vatNumber, @paymentMethod, @bankName, @branchName, 
                        @branchCode, @bankAccount, @internalAccount, @repName, @targetBased, @tierBased, @adhocBased
                    )
                `);
        }

        // After processing, delete the uploaded file
        fs.unlinkSync(filePath);
        res.redirect('/customers');
    } catch (err) {
        console.error('Error uploading customers:', err);
        res.status(500).send('Error processing file');
    }
};

// Edit customer
exports.editCustomer = async (req, res) => {
    // Edit customer logic
};

// Delete customer
exports.deleteCustomer = async (req, res) => {
    const customerId = req.params.id;

    try {
        let pool = await sql.connect(sqlConfig);
        await pool.request()
            .input('customerId', sql.Int, customerId)
            .query('DELETE FROM Customers WHERE customerId = @customerId');

        res.redirect('/customers');
    } catch (err) {
        console.error('Error deleting customer:', err);
        res.status(500).send('Server Error');
    }
};

// In customerController.js
exports.getSubCustomers = async (req, res) => {
    const parentCustomerId = req.params.id;

    try {
        let pool = await sql.connect(sqlConfig);
        let result = await pool.request()
            .input('parentCustomerId', sql.Int, parentCustomerId)
            .query(`
                SELECT c.* 
                FROM Customers c
                JOIN CustomerSubCustomers sc ON c.customerId = sc.subCustomerId
                WHERE sc.parentCustomerId = @parentCustomerId
            `);

        res.json({ subCustomers: result.recordset });
    } catch (err) {
        console.error('Error fetching sub-customers:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
