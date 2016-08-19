# statsd-regexp-repeater
This is backend, that was copied from standart repeater backend with added filtering functionality
In the ./etc/config path you can find sample config that consists of
* udp-front.js - statsd frontend, that accepts metrics via udp and repeats all metrics to the local tcp socket to the second statsd
* histogram-service.js - listens for metrics via tcp, and uses regexp-repeater to repeat matching metrics to the third backend
* main-graphite.js - servers as service, that will accept matching metrics

# statsd is very unstable and the whole chain crashes in tcp mode if one of services will close connection. so consider to use [monit](https://en.wikipedia.org/wiki/Monit) or some other supervision tool to rerun failed statsd processes
