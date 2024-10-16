const express = require('express');
const sql = require('mssql');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');

// Import your existing dbconfig from the config folder
const dbConfig = require('../config/dbconfig');

// Middleware to handle form-data for file uploads
const upload = multer({ dest: 'uploads/' });

// Function to ensure the Products table exists
async function ensureProductsTable() {
    try {
        const pool = await sql.connect(dbConfig);
        const tableCheckQuery = `
            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Products')
            BEGIN
                CREATE TABLE Products (
                    ProductID INT IDENTITY(1,1) PRIMARY KEY,
                    ProductName NVARCHAR(255) NOT NULL,
                    NappiCode NVARCHAR(50) NOT NULL UNIQUE,
                    PriceExclVAT DECIMAL(10, 2) NOT NULL,
                    IsRanbaxyProduct BIT NOT NULL,
                    IsSunPharmaProduct BIT NOT NULL,
                    Basket NVARCHAR(10) NOT NULL
                );
            END
        `;
        await pool.request().query(tableCheckQuery);
        console.log('Checked and ensured Products table exists.');
    } catch (error) {
        console.error('Error ensuring Products table:', error);
    }
}

// Helper function to execute a database query
async function dbQuery(query, params = []) {
    try {
        const pool = await sql.connect(dbConfig);
        const request = pool.request();
        params.forEach(param => request.input(param.name, param.type, param.value));
        const result = await request.query(query);
        return result;
    } catch (err) {
        throw err;
    }
}

// Fetch products from the SQL database and render the page
router.get('/products', async (req, res) => {
    try {
        await ensureProductsTable();  // Ensure table exists before fetching data
        const result = await dbQuery('SELECT * FROM Products');
        res.render('products', { products: result.recordset });  // Pass the products to the EJS template
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).send('Error fetching products');
    }
});

// Add a new product to the database
router.post('/products/add', async (req, res) => {
    const { productName, nappiCode, priceExclVAT, isRanbaxy, isSunPharma, basket } = req.body;

    try {
        await dbQuery(`
            INSERT INTO Products (ProductName, NappiCode, PriceExclVAT, IsRanbaxyProduct, IsSunPharmaProduct, Basket)
            VALUES (@productName, @nappiCode, @priceExclVAT, @isRanbaxy, @isSunPharma, @basket)`,
            [
                { name: 'productName', type: sql.NVarChar, value: productName },
                { name: 'nappiCode', type: sql.NVarChar, value: nappiCode },
                { name: 'priceExclVAT', type: sql.Decimal(10, 2), value: priceExclVAT },
                { name: 'isRanbaxy', type: sql.Bit, value: isRanbaxy ? 1 : 0 },
                { name: 'isSunPharma', type: sql.Bit, value: isSunPharma ? 1 : 0 },
                { name: 'basket', type: sql.NVarChar, value: basket }
            ]
        );
        res.redirect('/sales/products');  // Redirect to fetch and display updated list
    } catch (err) {
        console.error('Error adding product:', err);
        res.status(500).send('Error adding product');
    }
});

// Delete a product from the database
router.post('/products/delete/:id', async (req, res) => {
    const productId = req.params.id;

    try {
        await dbQuery('DELETE FROM Products WHERE ProductID = @productId', [
            { name: 'productId', type: sql.Int, value: productId }
        ]);
        res.redirect('/sales/products');  // Redirect to refresh the product list
    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(500).send('Error deleting product');
    }
});


// Upload and update products from an XLSX file
router.post('/products/upload', upload.single('xlsxFile'), async (req, res) => {
    const filePath = req.file.path;

    try {
        const workbook = xlsx.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const products = xlsx.utils.sheet_to_json(sheet);

        for (const product of products) {
            const { ProductName, NappiCode, PriceExclVAT, IsRanbaxyProduct, IsSunPharmaProduct, Basket } = product;

            // Validate that required fields are present
            if (!NappiCode || !ProductName || !PriceExclVAT || !Basket) {
                console.error(`Skipping product due to missing fields: ${JSON.stringify(product)}`);
                continue;  // Skip this row if any required fields are missing
            }

            try {
                await dbQuery(`
                    IF NOT EXISTS (SELECT 1 FROM Products WHERE NappiCode = @nappiCode)
                    BEGIN
                        INSERT INTO Products (ProductName, NappiCode, PriceExclVAT, IsRanbaxyProduct, IsSunPharmaProduct, Basket)
                        VALUES (@productName, @nappiCode, @priceExclVAT, @isRanbaxy, @isSunPharma, @basket)
                    END`,
                    [
                        { name: 'productName', type: sql.NVarChar, value: ProductName },
                        { name: 'nappiCode', type: sql.NVarChar, value: NappiCode },
                        { name: 'priceExclVAT', type: sql.Decimal(10, 2), value: PriceExclVAT },
                        { name: 'isRanbaxy', type: sql.Bit, value: IsRanbaxyProduct ? 1 : 0 },
                        { name: 'isSunPharma', type: sql.Bit, value: IsSunPharmaProduct ? 1 : 0 },
                        { name: 'basket', type: sql.NVarChar, value: Basket }
                    ]
                );
            } catch (err) {
                console.error(`Skipping product ${NappiCode}: already exists.`);
            }
        }

        res.redirect('/sales/products');
    } catch (err) {
        console.error('Error processing XLSX file:', err);
        res.status(500).send('Error processing XLSX file');
    }
});


// Handle product checkbox and basket updates
router.post('/products/update/:id', async (req, res) => {
    const productId = req.params.id;
    const { isRanbaxy, isSunPharma, basket } = req.body;

    try {
        // Convert checkbox values to bit (1 or 0)
        const ranbaxyValue = isRanbaxy ? 1 : 0;
        const sunPharmaValue = isSunPharma ? 1 : 0;

        await dbQuery(`
            UPDATE Products
            SET IsRanbaxyProduct = @isRanbaxy, 
                IsSunPharmaProduct = @isSunPharma,
                Basket = @basket
            WHERE ProductID = @productId
        `, [
            { name: 'isRanbaxy', type: sql.Bit, value: ranbaxyValue },
            { name: 'isSunPharma', type: sql.Bit, value: sunPharmaValue },
            { name: 'basket', type: sql.NVarChar, value: basket },  // Update basket value as well
            { name: 'productId', type: sql.Int, value: productId }
        ]);

        res.redirect('/sales/products');  // Redirect back to the product list
    } catch (err) {
        console.error('Error updating product:', err);
        res.status(500).send('Error updating product');
    }
});

module.exports = router;

