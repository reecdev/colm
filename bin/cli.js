const { startServer } = require('../index');

const PORT = parseInt(process.env.PORT, 10) || 15050;
startServer(PORT);
