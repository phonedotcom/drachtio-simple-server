const config = require('config');
const mysql      = require('mysql');
const pool = mysql.createPool(config.get('sql.freeswitch'));
const query = 'SELECT network_ip, network_port FROM sip_registrations WHERE sip_username = ? ' +
'AND sip_realm = ?';

module.exports = function(aor, req) {
  return new Promise((resolve, reject) => {
    const arr = /^(.*)@(.*)$/.exec(aor);
    if (!arr) return reject(new Error('invalid aor'));
    pool.getConnection((err, connection) => {
      const user = arr[1];
      const realm = arr[2];
      connection.query(query, [user, realm], (err, results, fields) => {
        connection.release();

        if (err) return reject(err);

        if (0 === results.length) return reject(new Error(`unregistered user ${aor}`));

        resolve(`${results[0].network_ip}:${results[0].network_port}`);
      });
    });
  });
};
