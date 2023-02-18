const fs = require("fs");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const etc = require("../config/etc");
const { host } = require("../config/config");

function flush(last = false) {
  if (last) {
    return `systemctl -q is-active suricata && systemctl restart idps-iptables || true`;
  }

  return `alias iptables="iptables -w"
          iptables -F
          ${host.virtual} && iptables -A INPUT -i bond0 -p tcp --dport 22 -j ACCEPT || true
          ${host.virtual} && iptables -A INPUT -i bond0 -p tcp --dport 80 -j ACCEPT || true
          iptables -A INPUT -i bond0 -p udp --dport 1194 -j ACCEPT
          iptables -A INPUT -i bond0 -m state --state RELATED,ESTABLISHED -j ACCEPT
          iptables -A INPUT -i bond0 -j DROP
          iptables -t nat -F
          iptables -t nat -A POSTROUTING -o bond0 -j MASQUERADE
          systemctl -q is-active openvpn-server@server && systemctl restart openvpn-iptables || true`;
}

function device(data) {
  if (data.deleted) {
    return `iptables -A FORWARD -m mac --mac-source ${data.mac} -j DROP`;
  }

  return `iptables -A FORWARD -m mac --mac-source ${data.mac} -j DROP
          iptables -A INPUT -m mac --mac-source ${data.mac} -j DROP`;
}

function firewall(data) {
  return (
    `iptables -A FORWARD ` +
    `-p ${data.protocol} ` +
    `${data.srcIp !== "*" ? `-s ${data.srcIp}` : ""} ` +
    `${data.srcPort !== "*" ? `--sport ${data.srcPort}` : ""} ` +
    `${data.destIp !== "*" ? `-d ${data.destIp}` : ""} ` +
    `${data.destPort !== "*" ? `--dport ${data.destPort}` : ""} ` +
    `-j ${data.target} ` +
    `${data.target === "REJECT" && data.protocol === "tcp" ? "--reject-with tcp-rst" : ""}`
  );
}

function port(data) {
  return `iptables -t nat -A PREROUTING -i bond0 -p ${data.protocol} --dport ${data.outPort} -j DNAT --to ${data.ip}:${data.inPort}
          iptables -A FORWARD -d ${data.ip} -p ${data.protocol} --dport ${data.inPort} -j ACCEPT`;
}

function site(data) {
  const records = data.records
    .map((record) => `iptables -A FORWARD ${data.ip ? `-s ${data.ip}` : ""} -d ${record} -j DROP`)
    .join("\n");

  return `iptables -A FORWARD ${data.ip ? `-s ${data.ip}` : ""} -m string --string ${data.url} -j DROP --algo bm
          ${records}`;
}

function time(data) {
  const params = `-s ${data.ip} -m time --kerneltz --timestart ${data.startHour} --timestop ${data.stopHour} --weekdays ${data.days} -j DROP`;
  return `iptables -A FORWARD ${params}
          iptables -A INPUT ${params}`;
}

function save() {
  return `netfilter-persistent save`;
}

function proxy(data) {
  const deny = etc.deny(data);
  fs.writeFileSync(deny.path, deny.content);

  return `systemctl -q is-active squid && systemctl reload squid || true`;
}

function leases(datas) {
  const file = "/var/lib/dhcp/dhcpd.leases";
  const greps = datas.map((data) => `grep -q "hardware ethernet ${data.mac.toLowerCase()}" ${file}`).join(" || ");
  const awks = datas
    .map(
      (data) =>
        `awk '/^lease / {f=1} f {s=s?s"\\n"$0:$0;if ($0~/${data.mac.toLowerCase()}/) f=s=0} /^}$/ && f {print s;f=s=0}' ${file} > ${file}.tmp
        truncate -s 0 ${file}
        cat ${file}.tmp >> ${file}`
    )
    .join("\n");
  return `if ${greps}
          then
            systemctl stop isc-dhcp-server
            ${awks}
            systemctl restart isc-dhcp-server
          fi`;
}

const run = (data) => {
  const commands = [];

  commands.push(flush());

  data.devices.forEach((item) => {
    commands.push(device(item));
  });

  data.firewalls.forEach((item) => {
    commands.push(firewall(item));
  });

  data.ports.forEach((item) => {
    commands.push(port(item));
  });

  data.sites.forEach((item) => {
    commands.push(site(item));
  });

  data.times.forEach((item) => {
    commands.push(time(item));
  });

  commands.push(flush(true));

  commands.push(save());

  commands.push(proxy(data.sites));

  const deleted = data.devices.filter((x) => x.deleted);
  if (deleted.length) {
    commands.push(leases(deleted));
  }

  const script = commands.join("\n").replace(/^\s+/gm, "");
  console.log(script);
  return exec(script);
};

module.exports = {
  run,
};
