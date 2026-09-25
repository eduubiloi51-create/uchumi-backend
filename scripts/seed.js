require('dotenv').config();
const { initSchema } = require('../db/init');

initSchema()
  .then(() => {
    console.log('Database ready.');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
