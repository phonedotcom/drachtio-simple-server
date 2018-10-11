const parseUri = require('drachtio-srf').parseUri;
const config = require('config');
const uuid = require('short-uuid')('123456789');
const _ = require('lodash');
const registrar = process.env.NODE_ENV === 'test' ?
  require('./plugins/registrar-test') :
  require('./plugins/registrar');
const async = require('async');
const debug = require('debug')('drachtio:simple-server');

const obj = module.exports = {};

obj.parseAor = function(u) {
  const uri = parseUri(u);
  let domain = uri.host.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/);
  if (domain && config.has('domain')) domain = config.get('domain');
  else if (!domain) domain = uri.host;

  return `${uri.user || 'undefined'}@${domain}`;
};

obj.generateETag = function() {
  return uuid.new();
};

obj.parseEventHeader = function(event) {
  const obj = {};
  const arr = /^(.*);(.*)$/.exec(event);
  if (!arr) {
    //Event: foo
    obj.event = event;
  }
  else {
    obj.event = arr[1].trim();
    const idMatch = /id=([^//s;]*)/.exec(arr[2]);
    if (idMatch) obj.id = idMatch[1];
  }
  debug(`parseEventHeader: Event header ${event} parsed as ${JSON.stringify(obj)}`);

  return obj;
};

obj.getDefaultSubscriptionExpiry = function(package) {
  if (!config.has('methods.subscribe.expire.default')) return 3600;
  const obj = _.find(config.get('methods.subscribe.expire.default'), (o, k) => {return k === package;});
  if (!obj) return 3600;
  return obj.expires;
};

obj.forwardStoredMsgs = function(srf, aor, db) {
  return db.retrieveMessages(aor)
    .then((msgs) => {
      return new Promise((resolve) => {
        setTimeout(() => resolve(msgs), 3000);
      });
    })
    .then((msgs) => {
      return new Promise((resolve, reject) => {
        async.eachSeries(msgs, (msg, callback) => {
          registrar(msg.to).then((contact) => {
            const uri = `sip:${msg.toUser}@${contact}`;
            debug(`sending saved message to ${uri}: ${msg.content}`);
            srf.request(uri, {
              method: 'MESSAGE',
              body: msg.content,
              headers: {
                'From': msg.fromHdr,
                'To': msg.toHdr,
                'Content-Type': msg.type,
              }
            }, (err, req) => {
              callback(err);
            });
          }, (err) => {
            if (err) reject(err);
            resolve();
          })
            .catch((err) => {
              reject(err);
            });
        });
      });
    });
};
