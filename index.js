const dotenv = require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const apiRouter = require('./routes/index');

const port = process.env.PORT || 3000;
const app = express();

app.use(express.json());
app.use(cors());
app.use('/mediaFiles', express.static(__dirname + '/mediaFiles'));
app.use('/dashboard', express.static(__dirname + '/public/dashboard'));
app.use(apiRouter);

const server = http.Server(app);

server.listen(port, ()=> {
    console.log(`Servidor listo en el puerto ${port}`);
})
