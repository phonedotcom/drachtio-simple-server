const auth = require('drachtio-mw-digest-auth') ;
const config = require('config');
const mysql      = require('mysql');
const pool = mysql.createPool(config.get('sql.unified'));
const authQuery = 'SELECT sip_password FROM voip_device WHERE voip_device_id = ? ' +
'AND status = \'active\' AND sip_password <> \'\'';

module.exports = auth({
  realm: config.get('domain'),
  passwordLookup: (username, realm, callback) => {
    pool.getConnection((err, connection) => {
      connection.query(authQuery, [username], (err, results, fields) => {
        connection.release();

        if (err) return callback(err);

        if (0 === results.length) return callback(new Error(`unknown user ${username}`));

        callback(null, results[0].sip_password);
      });
    });
  }
});
