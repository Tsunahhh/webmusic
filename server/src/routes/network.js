import os from 'node:os';
import { Router } from 'express';

export const networkRouter = Router();

// Interfaces that exist on a normal desktop but lead nowhere useful for a
// guest: container/VM bridges, VPN and tunnel devices. Their addresses are
// real and routable *for this machine*, so there's no way to tell them apart
// from the actual LAN by address alone — the name is the only signal. They're
// still returned (a name-based guess shouldn't be able to hide the one
// address that happens to work), just sorted last.
const UNLIKELY_INTERFACE = /^(docker|br-|virbr|veth|tun|tap|zt|wg|vmnet|utun)/i;

// Lists the URLs this server can be reached at from other devices, so joining
// is "scan the code on screen" instead of reading an IP out loud across a
// room (see JoinQr.jsx).
//
// The port comes from the socket the request actually arrived on, not from a
// second read of process.env.PORT and not from the client's own
// window.location: in dev the client is served by Vite on :5173 and proxies
// /api here, so the client's port is the wrong number to hand a guest, while
// this socket is always the real server one.
networkRouter.get('/network', (req, res) => {
  const port = req.socket.localPort;
  const addresses = [];

  for (const [name, infos] of Object.entries(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      // IPv4 only. A link-local IPv6 address carries a zone index (%wlan0)
      // that is meaningless on the guest's device, and neither a phone camera
      // nor a browser would make a working URL out of it.
      const isV4 = info.family === 'IPv4' || info.family === 4;
      if (!isV4 || info.internal) continue;
      addresses.push({ name, address: info.address, url: `http://${info.address}:${port}` });
    }
  }

  addresses.sort((a, b) => UNLIKELY_INTERFACE.test(a.name) - UNLIKELY_INTERFACE.test(b.name));
  res.json({ port, addresses });
});
