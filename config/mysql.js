const mysql = require('mysql2');

const {
    MYSQL_HOST,
    MYSQL_PORT,
    MYSQL_USER,
    MYSQL_PASSWORD,
    MYSQL_DATABASE
} = process.env;

const hasMysqlConfig = MYSQL_HOST && MYSQL_USER && MYSQL_DATABASE;

if(!hasMysqlConfig){
    console.log('MySQL no configurado. El bot funcionara sin guardar clientes.');
    module.exports = null;
} else {
    const connection = mysql.createConnection({
        host: MYSQL_HOST,
        port: MYSQL_PORT || 3306,
        user: MYSQL_USER,
        password: MYSQL_PASSWORD || '',
        database: MYSQL_DATABASE
    });

    connection.connect(err => {
        if(err){
            console.log('Error de conexion con la base de datos', err);
            return;
        }
        console.log('Conectado con la base de datos');
    });

    module.exports = connection;
}
