const {parseAor} = require('./utils');
const {SipError, parseUri} = require('drachtio-srf');

const registrar = process.env.NODE_ENV === 'test' ?
  require('./plugins/registrar-test') :
  require('./plugins/registrar');

module.exports = function(opts) {
  const logger = opts.logger;
  const db = opts.db;

  return (req, res) => {
    const srf = req.srf;
    const aor = parseAor(req.uri);
    const toUser = parseUri(req.uri).user;
    registrar(aor, req)
      .then((contact) => {
        const uri = `sip:${toUser}@${contact}`;
        logger.debug(`aor: ${aor} uri: ${uri}`);
        return srf.request(uri, {
          method: req.method,
          body: req.body,
          headers: {
            'From': req.get('From'),
            'To': req.get('To'),
            'Content-Type': req.get('Content-Type'),
          }
        });
      })
      .then((reqSent) => {
        return new Promise((resolve, reject) => {
          reqSent.on('response', (response) => {
            if (response.status === 200 || response.status === 202) {
              res.send(response.status);
              resolve();
            }
            reject(new SipError(response.status));
          });
        });
      })
      .catch((err) => {
        if (err instanceof SipError) {
          logger.info(`message failed sending ${aor}: ${err}, fall back to store and forward`);
        }
        else if (err.message.includes('unregistered user')) {
          logger.info(`message destined for offline aor ${aor}, fall back to store and forward`);
        }
        else {
          logger.error(`Error finding contact for ${aor}: ${err}, fall back to store and forward`);
        }

        const contentType = req.get('Content-Type');
        if (contentType.includes('im-iscomposing')) {
          logger.debug('discarding im-composing message because target is offline');
          res.send(202);
          return;
        }
        logger.debug(`saving message type: ${req.get('Content-Type')}: body: ${JSON.stringify(req.payload)}`);

        const fromUri = req.getParsedHeader('From').uri;
        const from = parseAor(fromUri);

        return db.saveMessage(from, aor, contentType, req.body, req.get('From'), req.get('To'), toUser);
      })
      .then((obj) => {
        if (obj) {
          logger.info(`successfully saved message for sending later to ${aor}`);
          res.send(202);
        }
        return;
      })
      .catch((err) => {
        res.send(500);
      });
  };
};
