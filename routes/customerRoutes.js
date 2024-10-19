const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const multer = require('multer');
const sql = require('mssql');
const sqlConfig = require('../config/dbConfig');  // Adjust the path if needed
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const config = require('../config/dbConfig'); // Ensure this path is correct


router.post('/update-slider', async (req, res) => {
    const { customerId, field, value } = req.body;

    try {
        let pool = await sql.connect(sqlConfig);  // Connect to the database

        const newValue = value ? 1 : 0;  // 1 for Activated, 0 for Inactive (bit value)

        await pool.request()
            .input('customerId', sql.Int, customerId)
            .input('value', sql.Bit, newValue)  // Use sql.Bit to store the value
            .query(`UPDATE Customers SET ${field} = @value WHERE customerId = @customerId`);

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating slider:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, error: 'Server error' });
    }
});


// Set up multer for file upload
const upload = multer({ dest: 'uploads/' });  // Files will be stored in 'uploads/' directory

// Route to get the customer page and show the list of customers
router.get('/customers', customerController.getAllCustomers);

// Route to handle the file upload
router.post('/upload-customers', upload.single('fileUpload'), customerController.uploadCustomers);

// Route to edit a specific customer by ID
router.post('/customers/edit/:id', customerController.editCustomer);

// Route to delete a specific customer by ID
router.post('/customers/delete/:id', customerController.deleteCustomer);

// Edit Customer
router.post('/customers/edit', async (req, res) => {
    const {
        customerId,
        customerName,
        companyName,
        tradingAs,
        physicalAddress,
        postalAddress,
        telephoneNumber,
        faxNumber,
        financeContact,
        financeEmail,
        buyerName,
        buyerEmail,
        companyCC,
        vatNumber,
        paymentMethod,
        bankName,
        branchName,
        branchCode,
        bankAccount,
        internalAccount,
        repName
    } = req.body;

    try {
        let pool = await sql.connect(sqlConfig);
        await pool.request()
            .input('customerId', sql.Int, customerId)
            .input('customerName', sql.VarChar, customerName)
            .input('companyName', sql.VarChar, companyName)
            .input('tradingAs', sql.VarChar, tradingAs)
            .input('physicalAddress', sql.VarChar, physicalAddress)
            .input('postalAddress', sql.VarChar, postalAddress)
            .input('telephoneNumber', sql.VarChar, telephoneNumber)
            .input('faxNumber', sql.VarChar, faxNumber)
            .input('financeContact', sql.VarChar, financeContact)
            .input('financeEmail', sql.VarChar, financeEmail)
            .input('buyerName', sql.VarChar, buyerName)
            .input('buyerEmail', sql.VarChar, buyerEmail)
            .input('companyCC', sql.VarChar, companyCC)
            .input('vatNumber', sql.VarChar, vatNumber)
            .input('paymentMethod', sql.VarChar, paymentMethod)
            .input('bankName', sql.VarChar, bankName)
            .input('branchName', sql.VarChar, branchName)
            .input('branchCode', sql.VarChar, branchCode)
            .input('bankAccount', sql.VarChar, bankAccount)
            .input('internalAccount', sql.VarChar, internalAccount)
            .input('repName', sql.VarChar, repName)
            .query(`
                UPDATE Customers SET 
                    customerName = @customerName,
                    companyName = @companyName,
                    tradingAs = @tradingAs,
                    physicalAddress = @physicalAddress,
                    postalAddress = @postalAddress,
                    telephoneNumber = @telephoneNumber,
                    faxNumber = @faxNumber,
                    financeContact = @financeContact,
                    financeEmail = @financeEmail,
                    buyerName = @buyerName,
                    buyerEmail = @buyerEmail,
                    companyCC = @companyCC,
                    vatNumber = @vatNumber,
                    paymentMethod = @paymentMethod,
                    bankName = @bankName,
                    branchName = @branchName,
                    branchCode = @branchCode,
                    bankAccount = @bankAccount,
                    internalAccount = @internalAccount,
                    repName = @repName
                WHERE customerId = @customerId
            `);

        res.redirect('/customers'); // Redirect back to the customers list
    } catch (err) {
        console.error('Error updating customer:', err);
        res.status(INTERNAL_SERVER_ERROR).send('Server Error');
    }
});

// Route for uploading associated pharmacies (sub-customers)
router.post('/upload-associated-stores', upload.single('associatedStoresFile'), async (req, res) => {
    const customerId = req.body.customerId;
    const file = req.file;

    if (!customerId) {
        return res.status(BAD_REQUEST).json({ success: false, message: 'customerId is required.' });
    }

    if (!file) {
        return res.status(BAD_REQUEST).json({ success: false, message: 'No file uploaded' });
    }

    try {
        let pool = await sql.connect(sqlConfig);
        const workbook = xlsx.readFile(file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const storesData = xlsx.utils.sheet_to_json(sheet);

        for (const store of storesData) {
            const storeName = store['Associate Customers'];

            if (!storeName) {
                console.error('Store name is missing for:', store);
                continue;
            }

            await pool.request()
                .input('parentCustomerId', sql.Int, customerId)
                .input('subCustomerId', sql.VarChar, storeName)
                .query(`INSERT INTO CustomerSubCustomers (parentCustomerId, subCustomerId) VALUES (@parentCustomerId, @subCustomerId)`);
        }

        fs.unlinkSync(file.path);
        res.json({ success: true });
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error processing file' });
    }
});



// Route to fetch associated sub-customers for a given customerId
router.get('/customers/:customerId/sub-customers', async (req, res) => {
    const customerId = req.params.customerId;

    try {
        let pool = await sql.connect(sqlConfig);
        const result = await pool.request()
            .input('parentCustomerId', sql.Int, customerId)
            .query(`SELECT subCustomerId FROM CustomerSubCustomers WHERE parentCustomerId = @parentCustomerId`);

        const associatedCustomers = result.recordset.map(record => ({ name: record.subCustomerId }));

        res.json({ subCustomers: associatedCustomers });
    } catch (error) {
        console.error('Error fetching sub-customers:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error fetching sub-customers' });
    }
});

router.post('/customers/update-associates', async (req, res) => {
    const { customers } = req.body;

    try {
        // Loop through the customers and update them in the database
        for (let customer of customers) {
            await db.query(
                'UPDATE customers SET customerName = ? WHERE customerId = ?',
                [customer.name, customer.id]
            );
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating customers:', error);
        res.json({ success: false, message: 'Failed to update customers' });
    }
});

router.delete('/customers/delete/:id', async (req, res) => {
    const customerId = req.params.id;

    try {
        await db.query('DELETE FROM customers WHERE customerId = ?', [customerId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting customer:', error);
        res.json({ success: false, message: 'Failed to delete customer' });
    }
});

router.post('/customers/add', async (req, res) => {
    const { customerName, groupId } = req.body; // Assuming you also need a group ID or some context

    try {
        await db.query('INSERT INTO customers (customerName, groupId) VALUES (?, ?)', [customerName, groupId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error adding new customer:', error);
        res.json({ success: false, message: 'Failed to add new customer' });
    }
});


// Route to fetch customer groups
router.get('/groups', async (req, res) => {
    try {
        let pool = await sql.connect(sqlConfig);
        
        // Fetch the customer groups and sub-customers
        const groupsResult = await pool.request().query(`
            SELECT cs.parentCustomerId, cs.subCustomerId, c.customerName AS ParentCustomerName
            FROM CustomerSubCustomers cs
            JOIN Customers c ON cs.parentCustomerId = c.customerId
        `);

        // Fetch the detailed info for all customers
        const customersResult = await pool.request().query(`
            SELECT *
            FROM Customers
        `);

        // Send data to the frontend (grouping information)
        res.render('customerGroups', { 
            customerGroups: groupsResult.recordset, 
            customers: customersResult.recordset 
        });
    } catch (error) {
        console.error('Error fetching customer groups:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error fetching customer groups' });
    }
});

// Route to delete a sub-customer
router.post('/groups/delete', async (req, res) => {
    const { parentCustomerId, subCustomerId } = req.body;
    try {
        let pool = await sql.connect(sqlConfig);
        
        await pool.request()
            .input('parentCustomerId', sql.Int, parentCustomerId)
            .input('subCustomerId', sql.NVarChar, subCustomerId)
            .query(`
                DELETE FROM CustomerSubCustomers
                WHERE parentCustomerId = @parentCustomerId AND subCustomerId = @subCustomerId
            `);
        
        res.json({ success: true, message: 'Sub-customer deleted successfully' });
    } catch (error) {
        console.error('Error deleting sub-customer:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error deleting sub-customer' });
    }
});

// Route to edit customer details
router.post('/customers/groups/edit', async (req, res) => {
    const { parentCustomerId, subCustomerIdOld, subCustomerIdNew } = req.body;

    try {
        let pool = await sql.connect(sqlConfig);

        // Correctly update using 'subCustomerIdOld' and 'subCustomerIdNew'
        await pool.request()
            .input('parentCustomerId', sql.Int, parentCustomerId)
            .input('oldSubCustomerId', sql.NVarChar, subCustomerIdOld)
            .input('newSubCustomerId', sql.NVarChar, subCustomerIdNew)
            .query(`
                UPDATE CustomerSubCustomers
                SET subCustomerId = @newSubCustomerId
                WHERE parentCustomerId = @parentCustomerId AND subCustomerId = @oldSubCustomerId
            `);

        res.json({ success: true, message: 'Sub-customer updated successfully' });
    } catch (error) {
        console.error('Error updating sub-customer:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error updating sub-customer' });
    }
});




router.get('/edit/:customerName', async (req, res) => {
    const { customerName } = req.params;  // Get the customerName from the URL as a string
    
    try {
        let pool = await sql.connect(sqlConfig);

        // Use customerName (or any other unique string column) in the SQL query
        const result = await pool.request()
            .input('customerName', sql.NVarChar, customerName)  // Treat customerName as NVarChar
            .query(`
                SELECT *
                FROM Customers
                WHERE customerName = @customerName
            `);
        
        const customer = result.recordset[0];

        if (!customer) {
            return res.status(NOT_FOUND).send('Customer not found');
        }

        // Render the edit form and pass the customer data to the view
        res.render('editCustomer', { customer });

    } catch (error) {
        console.error('Error fetching customer details:', error);
        res.status(INTERNAL_SERVER_ERROR).send('Server error');
    }
});



router.post('/edit/:customerName', async (req, res) => {
    const { customerName } = req.params;  // Get customerName from the URL
    const { companyName, tradingAs, physicalAddress } = req.body;  // Form values
    
    try {
        let pool = await sql.connect(sqlConfig);

        // Update the customer details based on customerName (string identifier)
        await pool.request()
            .input('customerName', sql.NVarChar, customerName)
            .input('companyName', sql.NVarChar, companyName)
            .input('tradingAs', sql.NVarChar, tradingAs)
            .input('physicalAddress', sql.NVarChar, physicalAddress)
            .query(`
                UPDATE Customers
                SET 
                    companyName = @companyName,
                    tradingAs = @tradingAs,
                    physicalAddress = @physicalAddress
                WHERE customerName = @customerName
            `);

        // Redirect to customer groups page after editing
        res.redirect('/customers/groups');

    } catch (error) {
        console.error('Error updating customer details:', error);
        res.status(INTERNAL_SERVER_ERROR).send('Server error');
    }
});

router.get('/edit/sub-customer/:subCustomerId', async (req, res) => {
    const { subCustomerId } = req.params;  // Get the subCustomerId from the URL
    
    try {
        let pool = await sql.connect(sqlConfig);

        // Use subCustomerId (which is a string with a pharmacy name and ID) in the SQL query
        const result = await pool.request()
            .input('subCustomerId', sql.NVarChar, decodeURIComponent(subCustomerId))  // Decode URL-encoded subCustomerId
            .query(`
                SELECT * 
                FROM CustomerSubCustomers 
                WHERE subCustomerId = @subCustomerId
            `);
        
        const customer = result.recordset[0];

        if (!customer) {
            return res.status(NOT_FOUND).send('Customer not found');
        }

        // Render the edit form and pass the customer data to the view
        res.render('editCustomer', { customer });

    } catch (error) {
        console.error('Error fetching customer details:', error);
        res.status(INTERNAL_SERVER_ERROR).send('Server error');
    }
});

router.get('/edit/main-customer/:customerName', async (req, res) => {
    const { customerName } = req.params;  // Get the customerName from the URL as a string
    
    try {
        let pool = await sql.connect(sqlConfig);

        // Use customerName (or any other unique string column) in the SQL query
        const result = await pool.request()
            .input('customerName', sql.NVarChar, customerName)  // Treat customerName as NVarChar
            .query(`
                SELECT *
                FROM Customers
                WHERE customerName = @customerName
            `);
        
        const customer = result.recordset[0];

        if (!customer) {
            return res.status(NOT_FOUND).send('Customer not found');
        }

        // Render the edit form and pass the customer data to the view
        res.render('editCustomer', { customer });

    } catch (error) {
        console.error('Error fetching customer details:', error);
        res.status(INTERNAL_SERVER_ERROR).send('Server error');
    }
});

// Route to update sub-customer details
router.post('/customers/updateSubCustomer', async (req, res) => {
    const { parentCustomerId, subCustomerId, newSubCustomerId } = req.body;

    try {
        let pool = await sql.connect(sqlConfig);

        // Validate that all inputs are present
        if (!parentCustomerId || !subCustomerId || !newSubCustomerId) {
            return res.status(BAD_REQUEST).json({ success: false, message: 'Invalid data provided.' });
        }

        // Update the subCustomerId for the specified parentCustomerId
        await pool.request()
            .input('parentCustomerId', sql.Int, parentCustomerId)  // parentCustomerId is an integer
            .input('oldSubCustomerId', sql.NVarChar, subCustomerId)  // old subCustomerId (string)
            .input('newSubCustomerId', sql.NVarChar, newSubCustomerId)  // new subCustomerId (string)
            .query(`
                UPDATE CustomerSubCustomers
                SET subCustomerId = @newSubCustomerId
                WHERE parentCustomerId = @parentCustomerId AND subCustomerId = @oldSubCustomerId
            `);

        res.json({ success: true, message: 'Sub-customer updated successfully' });
    } catch (error) {
        console.error('Error updating sub-customer:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error updating sub-customer' });
    }
});



module.exports = router;


router.get('/customers/wholesalers', async (req, res) => {
    try {
        let pool = await sql.connect(sqlConfig);
        const result = await pool.request().query('SELECT * FROM Wholesalers');
        
        // Ensure the data is sent correctly
        console.log('Wholesalers Data:', result.recordset);

        res.render('customerWholesaler', { wholesalers: result.recordset });
    } catch (error) {
        console.error('Error fetching wholesalers:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error fetching wholesalers' });
    }
});



// Route to edit a wholesaler's information
router.post('/wholesalers/edit', async (req, res) => {
    const { wholesalerId, newWholesalerName, newFeesStatus } = req.body;

    try {
        let pool = await sql.connect(sqlConfig);

        await pool.request()
            .input('wholesalerId', sql.Int, wholesalerId)
            .input('newWholesalerName', sql.VarChar, newWholesalerName)
            .input('newFeesStatus', sql.VarChar, newFeesStatus)
            .query(`
                UPDATE Wholesalers 
                SET wholesalerName = @newWholesalerName, feesStatus = @newFeesStatus 
                WHERE wholesalerId = @wholesalerId
            `);

        res.json({ success: true, message: 'Wholesaler updated successfully!' });
    } catch (error) {
        console.error('Error updating wholesaler:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error updating wholesaler' });
    }
});

// Route to delete a wholesaler
router.post('/wholesalers/delete', async (req, res) => {
    const { wholesalerId } = req.body;

    try {
        let pool = await sql.connect(sqlConfig);

        await pool.request()
            .input('wholesalerId', sql.Int, wholesalerId)
            .query(`DELETE FROM Wholesalers WHERE wholesalerId = @wholesalerId`);

        res.json({ success: true, message: 'Wholesaler deleted successfully!' });
    } catch (error) {
        console.error('Error deleting wholesaler:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error deleting wholesaler' });
    }
});

// Route to handle XLSX file upload
router.post('/upload-wholesalers', upload.single('file'), async (req, res) => {
    const file = req.file;

    if (!file) {
        return res.status(BAD_REQUEST).json({ success: false, message: 'No file uploaded.' });
    }

    try {
        // Read the uploaded XLSX file
        const workbook = xlsx.readFile(file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        // Log the entire data to ensure it is being read correctly
        console.log('Parsed Data:', data);

        // Insert each wholesaler into the database
        let pool = await sql.connect(sqlConfig);

        for (const wholesaler of data) {
            // Adjust these column names based on your XLSX file
            const supplierName = wholesaler['Supplier'];
            const feesStatus = wholesaler['Fees Status'];  // Ensure these match the exact headers in the XLSX

            if (supplierName && feesStatus) {
                console.log(`Inserting supplier: ${supplierName}, feesStatus: ${feesStatus}`);
                
                await pool.request()
                    .input('wholesalerName', sql.NVarChar, supplierName)
                    .input('feesStatus', sql.NVarChar, feesStatus)
                    .query(`
                        INSERT INTO Wholesalers (wholesalerName, feesStatus)
                        VALUES (@wholesalerName, @feesStatus)
                    `);
            } else {
                console.log('Skipping row with missing data:', wholesaler); // Debug: Skip invalid rows
            }
        }

        // Clean up the uploaded file
        fs.unlinkSync(file.path);

        res.json({ success: true, message: 'Wholesaler data uploaded successfully' });
    } catch (error) {
        console.error('Error processing XLSX file:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error processing file.' });
    }
});

router.post('/customers/wholesalers/update-slider', async (req, res) => {
    const { wholesalerId, feesStatus } = req.body;

    try {
        let pool = await sql.connect(sqlConfig);
        await pool.request()
            .input('wholesalerId', sql.Int, wholesalerId)
            .input('feesStatus', sql.VarChar, feesStatus)
            .query('UPDATE Wholesalers SET feesStatus = @feesStatus WHERE wholesalerId = @wholesalerId');

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating fees status:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error updating fees status.' });
    }
});

module.exports = router;


// GET route to fetch all tiers and render the tiers page
router.get('/financials/tiers', async (req, res) => {
    try {
        let pool = await sql.connect(sqlConfig);
        const result = await pool.request().query(`
            SELECT id, [Tier Name] AS name, [Minimum Purchase] AS minimumPurchase, [Tier Percentage] AS discountPercentage
            FROM Tiers
        `);

        console.log(result.recordset); // Add this to see the data in the server logs

        // Ensure 'tiers' data is passed to the EJS template
        res.render('tiers', { tiers: result.recordset });
    } catch (error) {
        console.error('Error fetching tiers:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error fetching tiers.' });
    }
});





// POST route to add a new tier
router.post('/financials/tiers/add', async (req, res) => {
    const { name, minimumPurchase, discountPercentage } = req.body;

    try {
        let pool = await sql.connect(sqlConfig);
        await pool.request()
            .input('name', sql.NVarChar, name)
            .input('minimumPurchase', sql.Decimal(10, 2), minimumPurchase)  // Adjust precision for purchase value
            .input('discountPercentage', sql.Decimal(5, 2), discountPercentage)
            .query(`
                INSERT INTO Tiers ([Tier Name], [Minimum Purchase], [Tier Percentage], created_at, updated_at) 
                VALUES (@name, @minimumPurchase, @discountPercentage, GETDATE(), GETDATE())
            `);

        res.redirect('/financials/tiers');
    } catch (error) {
        console.error('Error adding new tier:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error adding new tier.' });
    }
});

// POST route to edit/update an existing tier
router.post('/financials/tiers/edit/:id', async (req, res) => {
    const tierId = req.params.id;
    const { name, minimumPurchase, discountPercentage } = req.body;

    try {
        let pool = await sql.connect(sqlConfig);
        await pool.request()
            .input('tierId', sql.Int, tierId)
            .input('name', sql.NVarChar, name)
            .input('minimumPurchase', sql.Decimal(10, 2), minimumPurchase)
            .input('discountPercentage', sql.Decimal(5, 2), discountPercentage)
            .query(`
                UPDATE Tiers 
                SET [Tier Name] = @name, [Minimum Purchase] = @minimumPurchase, [Tier Percentage] = @discountPercentage, updated_at = GETDATE()
                WHERE id = @tierId
            `);

        // Explicitly send a success response
        res.status(SUCCESS).json({ success: true, message: 'Tier updated successfully!' });
    } catch (error) {
        console.error('Error updating tier:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error updating tier.' });
    }
});


// POST route to delete a tier
router.post('/financials/tiers/delete/:id', async (req, res) => {
    const tierId = req.params.id;

    try {
        let pool = await sql.connect(sqlConfig);
        await pool.request()
            .input('tierId', sql.Int, tierId)
            .query('DELETE FROM Tiers WHERE id = @tierId');

        res.redirect('/financials/tiers');
    } catch (error) {
        console.error('Error deleting tier:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error deleting tier.' });
    }
});


// POST route to delete a tier
router.post('/financials/tiers/delete/:id', async (req, res) => {
    const tierId = req.params.id;

    try {
        let pool = await sql.connect(sqlConfig);
        await pool.request()
            .input('tierId', sql.Int, tierId)
            .query('DELETE FROM Tiers WHERE id = @tierId');

        res.json({ success: true, message: 'Tier deleted successfully!' });
    } catch (error) {
        console.error('Error deleting tier:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error deleting tier.' });
    }
});

// POST route to add a new tier
router.post('/financials/tiers/add', async (req, res) => {
    const { name, minimumPurchase, discountPercentage } = req.body;

    try {
        let pool = await sql.connect(sqlConfig);
        await pool.request()
            .input('name', sql.NVarChar, name)
            .input('minimumPurchase', sql.Decimal(10, 2), minimumPurchase)  // Adjust precision for purchase value
            .input('discountPercentage', sql.Decimal(5, 2), discountPercentage)
            .query(`
                INSERT INTO Tiers ([Tier Name], [Minimum Purchase], [Tier Percentage], created_at, updated_at) 
                VALUES (@name, @minimumPurchase, @discountPercentage, GETDATE(), GETDATE())
            `);

        res.json({ success: true, message: 'Tier added successfully!' });
    } catch (error) {
        console.error('Error adding new tier:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error adding new tier.' });
    }
});

module.exports = router;

// Fetch all Ad-Hoc Fees
router.get('/financials/adhoc', async (req, res) => {
    try {
        let pool = await sql.connect(sqlConfig);
        const result = await pool.request().query(`
            SELECT id, products_description AS description, quantity_to_qualify AS quantity, data_fee AS fee
            FROM AdhocFees
        `);

        res.render('adhoc', { adhocFees: result.recordset });
    } catch (error) {
        console.error('Error fetching adhoc fees:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error fetching adhoc fees.' });
    }
});

// Add a new Ad-Hoc Fee
router.post('/financials/adhoc/add', async (req, res) => {
    const { productsDescription, quantityToQualify, dataFee } = req.body;

    try {
        const pool = await sql.connect(sqlConfig);

        await pool.request()
            .input('productsDescription', sql.VarChar, productsDescription)
            .input('quantityToQualify', sql.Int, quantityToQualify)
            .input('dataFee', sql.Decimal, dataFee)
            .query(`
                INSERT INTO SunPharma.dbo.AdhocFees (products_description, quantity_to_qualify, data_fee)
                VALUES (@productsDescription, @quantityToQualify, @dataFee)
            `);

        res.json({ success: true, message: 'Ad-Hoc Fee added successfully' });
    } catch (error) {
        console.error('Error adding Ad-Hoc Fee:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to add Ad-Hoc Fee' });
    }
});


// Edit existing Ad-Hoc Fee
router.post('/financials/adhoc/edit/:id', async (req, res) => {
    const { id } = req.params;
    const { name, fee } = req.body;

    try {
        let pool = await sql.connect(sqlConfig);
        await pool.request()
            .input('id', sql.Int, id)
            .input('description', sql.NVarChar, name)
            .input('fee', sql.Decimal(5, 2), fee)
            .query(`
                UPDATE AdhocFees SET products_description = @description, data_fee = @fee, updated_at = GETDATE()
                WHERE id = @id
            `);

        res.json({ success: true });
    } catch (error) {
        console.error('Error editing adhoc fee:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error editing adhoc fee.' });
    }
});

// Delete an Ad-Hoc Fee
router.post('/financials/adhoc/delete/:id', async (req, res) => {
    const { id } = req.params;

    try {
        let pool = await sql.connect(sqlConfig);
        await pool.request()
            .input('id', sql.Int, id)
            .query(`DELETE FROM AdhocFees WHERE id = @id`);

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting adhoc fee:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error deleting adhoc fee.' });
    }
});


// POST route to upload and process XLSX file and insert into SQL Server
router.post('/financials/adhoc/upload', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;

        if (!file) {
            return res.status(BAD_REQUEST).json({ success: false, message: 'No file uploaded' });
        }

        const filePath = file.path;

        try {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

            if (!worksheet || worksheet.length === 0) {
                return res.status(BAD_REQUEST).json({ success: false, message: 'Empty or invalid file format' });
            }

            console.log('Parsed worksheet data:', worksheet);

            // Connect to SQL Server
            const pool = await sql.connect(sqlConfig);

            // Loop through worksheet data and insert into SQL Server
            for (const row of worksheet) {
                const productsDescription = row['Products Description'] || '';
                const quantityToQualify = row['Quantity to Qualify'] || null;
                const dataFee = row['Data Fee'] || null;

                // Skip rows with missing required fields
                if (!productsDescription || quantityToQualify === null || dataFee === null) {
                    console.log('Skipping row due to missing data:', row);
                    continue;
                }

                // Insert into the database
                await pool.request()
                    .input('description', sql.NVarChar, productsDescription)
                    .input('quantity', sql.Int, quantityToQualify)
                    .input('fee', sql.Decimal(5, 2), dataFee)
                    .query(`
                        INSERT INTO SunPharma.dbo.AdhocFees 
                        (products_description, quantity_to_qualify, data_fee, created_at)
                        VALUES (@description, @quantity, @fee, GETDATE())
                    `);
            }

            // Clean up the uploaded file
            fs.unlinkSync(filePath);

            // Success response
            res.json({ success: true, message: 'File uploaded and data inserted successfully!' });

        } catch (error) {
            console.error('Error processing file:', error);
            res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error processing the Excel file.' });
        }

    } catch (error) {
        console.error('Error handling upload:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error handling the upload.' });
    }
});

router.get('/financials/adhoc/list', async (req, res) => {
    try {
        const pool = await sql.connect(sqlConfig);

        const result = await pool.request().query(`
            SELECT id, products_description, quantity_to_qualify, data_fee, created_at
            FROM SunPharma.dbo.AdhocFees
            ORDER BY created_at DESC
        `);

        // Send the fetched data as JSON to the frontend
        res.json({ success: true, data: result.recordset });
    } catch (error) {
        console.error('Error fetching Ad-Hoc Fees:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to fetch Ad-Hoc Fees' });
    }
});

// Update an existing Ad-Hoc Fee
router.put('/financials/adhoc/:id/edit', async (req, res) => {
    const { productsDescription, quantityToQualify, dataFee } = req.body;
    const id = parseInt(req.params.id, 10); // Ensure ID is parsed as an integer

    if (isNaN(id)) {
        return res.status(BAD_REQUEST).json({ success: false, message: 'Invalid ID' });
    }

    try {
        const pool = await sql.connect(sqlConfig);

        await pool.request()
            .input('id', sql.Int, id) // Make sure 'id' is of type 'Int'
            .input('productsDescription', sql.VarChar, productsDescription)
            .input('quantityToQualify', sql.Int, quantityToQualify)
            .input('dataFee', sql.Decimal, dataFee)
            .query(`
                UPDATE SunPharma.dbo.AdhocFees
                SET products_description = @productsDescription,
                    quantity_to_qualify = @quantityToQualify,
                    data_fee = @dataFee
                WHERE id = @id
            `);

        res.json({ success: true, message: 'Ad-Hoc Fee updated successfully' });
    } catch (error) {
        console.error('Error updating Ad-Hoc Fee:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to update Ad-Hoc Fee' });
    }
});


// Delete an Ad-Hoc Fee
router.delete('/financials/adhoc/:id/delete', async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await sql.connect(sqlConfig);

        await pool.request()
            .input('id', sql.Int, id)
            .query(`
                DELETE FROM SunPharma.dbo.AdhocFees
                WHERE id = @id
            `);

        res.json({ success: true, message: 'Ad-Hoc Fee deleted successfully' });
    } catch (error) {
        console.error('Error deleting Ad-Hoc Fee:', error);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to delete Ad-Hoc Fee' });
    }
});

module.exports = router;


// Route to handle file upload and parsing of Excel sheet
router.post('/financials/targets/upload', upload.single('file'), async (req, res) => {
    try {
        const filePath = req.file.path;
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        // Connect to SQL Server
        await sql.connect(config);

        // Insert each row from the Excel sheet into the 'targets' table, including DataFee
        for (let row of sheetData) {
            const customerName = row['Customer_Name'];
            const target = row['Target'];
            const dataFee = row['DataFee']; // Updated to 'DataFee'

            // Insert query into the targets table
            await sql.query`INSERT INTO targets (customer_name, target, DataFee) VALUES (${customerName}, ${target}, ${dataFee})`;
        }

        res.json({ success: true, message: 'File processed and data inserted successfully!' });
    } catch (err) {
        console.error('Error processing file:', err);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to process file' });
    }
});

// Route to fetch all targets from the database
router.get('/financials/targets/list', async (req, res) => {
    try {
        await sql.connect(config);
        const result = await sql.query`SELECT [id], [customer_name], [target], [DataFee] FROM [dbo].[targets]`;

        // Log the fetched results to inspect DataFee values
        console.log(result.recordset);

        if (result.recordset.length > 0) {
            res.json({ success: true, data: result.recordset });
        } else {
            res.json({ success: false, message: 'No targets found' });
        }
    } catch (err) {
        console.error('SQL error', err);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to fetch targets' });
    }
});

// Route to fetch all targets and render them on the frontend
router.get('/financials/targets', async (req, res) => {
    try {
        // Connect to SQL Server
        await sql.connect(config);

        // Query to fetch all targets from the database (no limit), including DataFee
        const result = await sql.query`
            SELECT [id], [customer_name], [target], [DataFee]
            FROM [dbo].[targets]
        `;

        // Check if there are any results
        if (result.recordset.length > 0) {
            // Render the 'targets.ejs' view and pass the fetched data
            res.render('targets', { targets: result.recordset });
        } else {
            // No targets found, render the view with an empty array
            res.render('targets', { targets: [] });
        }
    } catch (err) {
        console.error('SQL error', err);
        res.status(INTERNAL_SERVER_ERROR).send('Failed to fetch targets');
    }
});

// Route to edit an existing target by ID, including DataFee
router.put('/financials/targets/:id/edit', async (req, res) => {
    const { id } = req.params;
    const { customer_name, target, data_fee } = req.body;  // Extracting updated values from the request body

    try {
        // Connect to SQL Server
        await sql.connect(config);

        // Prepare the request and input parameters
        const request = new sql.Request();
        request.input('id', sql.Int, id)
               .input('customer_name', sql.VarChar, customer_name)
               .input('target', sql.VarChar, target)
               .input('data_fee', sql.Decimal(5, 2), data_fee);

        // Update query to modify the existing target in the database
        const updateQuery = `
            UPDATE [dbo].[targets]
            SET customer_name = @customer_name, target = @target, DataFee = @data_fee
            WHERE id = @id
        `;

        await request.query(updateQuery);

        res.json({ success: true, message: 'Target updated successfully!' });
    } catch (err) {
        // Error handling
        console.error('SQL error during update:', err);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to update target' });
    }
});


// Route to delete a target by ID
router.delete('/financials/targets/:id/delete', async (req, res) => {
    const { id } = req.params;

    try {
        // Connect to SQL Server
        await sql.connect(config);

        // Prepare the request and input parameter
        const request = new sql.Request();
        request.input('id', sql.Int, id);

        // Delete query to remove the target from the database
        const deleteQuery = `DELETE FROM [dbo].[targets] WHERE id = @id`;

        const result = await request.query(deleteQuery);

        if (result.rowsAffected[0] > 0) {
            res.json({ success: true, message: 'Target deleted successfully!' });
        } else {
            res.status(NOT_FOUND).json({ success: false, message: 'Target not found' });
        }
    } catch (err) {
        // Error handling
        console.error('SQL error during deletion:', err);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to delete target' });
    }
});


module.exports = router;

// Route to serve the HTML page (company-details.ejs or company-details.html)
router.get('/financials/company-details', (req, res) => {
    // Serve the company-details.ejs file located in the views folder
    res.render('company-details');  // Ensure you have a company-details.ejs in your 'views' folder
});

// API route to fetch company details in JSON format for a specific company
router.get('/api/company-details', async (req, res) => {
    const companyId = req.query.companyId || 1;  // Default to company 1 if no companyId is provided

    try {
        const result = await sql.query`
            SELECT TOP 1 * FROM dbo.CompanyDetails WHERE company_id = ${companyId}
        `;
        if (result.recordset.length > 0) {
            res.json({ success: true, data: result.recordset[0] });
        } else {
            res.json({ success: false, message: 'Company details not found' });
        }
    } catch (err) {
        console.error('SQL error', err);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to fetch company details' });
    }
});



// Route to update company details for a specific company
router.put('/financials/company-details/edit', async (req, res) => {
    const {
        company_id,
        registered_company_name,
        trading_as,
        physical_address,
        telephone_number,
        finance_contact_person,
        finance_email_address,
        vat_number
    } = req.body;

    try {
        await sql.connect(sqlConfig);

        // Check if the company with the provided company_id exists
        const existingCompany = await sql.query`
            SELECT TOP 1 company_id FROM dbo.CompanyDetails WHERE company_id = ${company_id}
        `;

        // If the company exists, update the existing record
        if (existingCompany.recordset.length > 0) {
            await sql.query`
                UPDATE dbo.CompanyDetails
                SET 
                    registered_company_name = ${registered_company_name},
                    trading_as = ${trading_as},
                    physical_address = ${physical_address},
                    telephone_number = ${telephone_number},
                    finance_contact_person = ${finance_contact_person},
                    finance_email_address = ${finance_email_address},
                    vat_number = ${vat_number}
                WHERE company_id = ${company_id}
            `;
            res.json({ success: true, message: `Company ${company_id} details updated successfully!` });
        } 
        // If the company doesn't exist, insert a new record
        else {
            await sql.query`
                INSERT INTO dbo.CompanyDetails 
                (
                    company_id, 
                    registered_company_name, 
                    trading_as, 
                    physical_address, 
                    telephone_number, 
                    finance_contact_person, 
                    finance_email_address, 
                    vat_number
                )
                VALUES 
                (
                    ${company_id}, 
                    ${registered_company_name}, 
                    ${trading_as}, 
                    ${physical_address}, 
                    ${telephone_number}, 
                    ${finance_contact_person}, 
                    ${finance_email_address}, 
                    ${vat_number}
                )
            `;
            res.json({ success: true, message: `Company ${company_id} details inserted successfully!` });
        }
    } catch (err) {
        console.error('SQL error', err);
        res.status(INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to update or insert company details' });
    }
});



module.exports = router;