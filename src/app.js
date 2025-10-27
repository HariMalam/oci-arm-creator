const express = require('express');
const mainRouter = require('./routes');

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use('/', mainRouter);

module.exports = app;