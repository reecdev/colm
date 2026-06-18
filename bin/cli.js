const { startServer } = require('../index');

const PORT = parseInt(process.env.PORT, 10) || 5050;
startServer(PORT);