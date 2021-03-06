/*jshint node:true, laxcomma:true */

var util = require('util')
    , dgram = require('dgram')
    , logger = require('../lib/logger')
    , Pool = require('generic-pool').Pool
    , net = require('net');


var l;
var debug;
var instance;

function logerror(err) {
    if (err && debug) {
        l.log(err);
    }
}

var sendMatching = function (packet, regexps, sendFunction) {
    var lines = packet.toString().split("\n");
    if (regexps && regexps.length > 0) {
        for (var j = 0; j < lines.length; j++) {
            var line = lines[j];
            for (var r = 0; r < regexps.length; r++) {
                var reg = regexps[r];
                if (line.match(reg)) {
                    if (debug) {
                        l.log('line matched: ' + line + ' regexp:' + reg);
                    }
                    var buffer = new Buffer(line + '\n');
                    sendFunction(buffer);
                }
            }
        }
    }
};

function UDPRepeaterBackend(startupTime, config, emitter) {
    var self = this;
    this.config = config.repeater || [];
    this.sock = (config.repeaterProtocol == 'udp6') ?
        dgram.createSocket('udp6') :
        dgram.createSocket('udp4');

    // Attach DNS error handler
    this.sock.on('error', function (err) {
        if (debug) {
            l.log('Repeater error: ' + err);
        }
    });

    // attach
    emitter.on('packet', function (packet, rinfo) {
        self.process(packet, rinfo);
    });
}


UDPRepeaterBackend.prototype.process = function (packet, rinfo) {
    var self = this;
    var hosts = self.config;
    for (var i = 0; i < hosts.length; i++) {
        var h = hosts[i];
        sendMatching(packet, h.regexp, function (data) {
            self.sock.send(data, 0, data.length, h.port, h.host, logerror);
        });
    }
};

UDPRepeaterBackend.prototype.stop = function (cb) {
    this.sock.close();
    cb();
};


var TCPRepeaterBackend = function (startupTime, config, emitter) {
    this.config = config;
    this.pools = [];

    var targets = this.config.repeater || [];
    for (var i = 0; i < targets.length; i++) {
        this.pools.push(this.createPool(targets[i]));
    }

    var self = this;
    emitter.on('packet', function (packet, rinfo) {
        self.process(packet, rinfo);
    });
};


TCPRepeaterBackend.prototype.createPool = function (server) {
    return Pool({
        name: server.host + ':' + server.port,

        create: function (cb) {
            var client = net.connect(server.port, server.host);

            function connectError(err) {
                cb(err, null);
            }

            client.on('connect', function () {
                client.removeListener('error', connectError);
                cb(null, client);
            });

            client.on('error', connectError);
        },

        destroy: function (client) {
            client.end();
        },

        max: 5
    });
};

TCPRepeaterBackend.prototype.process = function (packet, rinfo) {
    function send(buf, pool) {
        pool.acquire(function (err, client) {
            if (err) {
                logerror(err);
            } else {
                client.write(buf, function () {
                    pool.release(client);
                });
            }
        });
    }

    var hosts = this.config.repeater;
    var that = this;
    for (var i = 0; i < hosts.length; i++) {
        var h = hosts[i];
        sendMatching(packet, h.regexp, function (data) {
            send(data, that.pools[i]);
        });
    }
};


TCPRepeaterBackend.prototype.stop = function (cb) {
    var self = this;

    function drain_pool(i) {
        if (i == self.pools.length) {
            cb();
            return;
        }

        self.pools[i].drain(function () {
            self.pools[i].destroyAllNow(function () {
                drain_pool(i + 1);
            });
        });
    }

    drain_pool(0);
};


exports.init = function (startupTime, config, emitter, logger) {
    debug = config.debug;
    l = logger;

    var proto = config.repeaterProtocol;
    if (proto == 'tcp') {
        instance = new TCPRepeaterBackend(startupTime, config, emitter);
    } else {
        instance = new UDPRepeaterBackend(startupTime, config, emitter);
    }

    return true;
};


exports.stop = function (cb) {
    if (instance) {
        instance.stop(cb);
        instance = null;
    }
};
