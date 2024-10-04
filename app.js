const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');

// Import routes
const authRoutes = require('./routes/authRoutes');
const homeRoutes = require('./routes/homeRoutes');
const customerRoutes = require('./routes/customerRoutes');
const salesRoutes = require('./routes/salesRoutes'); 
const taxInvoiceRoutes = require('./routes/taxInvoiceRoutes');


const app = express();

// Middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Set the view engine to EJS
app.set('view engine', 'ejs');

// Set the views folder (where EJS templates are stored)
app.set('views', path.join(__dirname, 'views'));

// Middleware for parsing request bodies
app.use(express.urlencoded({ extended: true }));

// Middleware for serving static files (CSS, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Middleware to handle sessions
app.use(session({
    secret: 'yourSecretKey',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Register routes
app.use(authRoutes);
app.use(homeRoutes);
app.use(customerRoutes);
app.use('/customers', customerRoutes);
app.use('/sales', salesRoutes);  // Correctly register the sales route
app.use('/financials/tax-invoices', taxInvoiceRoutes);


// Serve static files
app.use('/assets', express.static('assets'));

// Root Route - Redirect to login (Keep only one root route)
app.get('/', (req, res) => {
    res.redirect('/login');  // Redirect root to login first
});

// Route to serve login page
app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/views/login.html');
});

// Serve the home page after successful login
app.get('/home', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(__dirname + '/views/home.html');
});

// Start the server
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
