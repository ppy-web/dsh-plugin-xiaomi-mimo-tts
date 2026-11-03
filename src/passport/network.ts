import { networkInterfaces } from 'node:os'
import { isPassportLanAddress } from '../types/passport.js'

export function passportAddresses(interfaces = networkInterfaces()): Array<{ name: string; address: string }> {
  return Object.entries(interfaces).flatMap(([name, addresses]) =>
    /^(?:vEthernet|VMware|VirtualBox)/iu.test(name) ? []
      : (addresses ?? []).filter(item => item.family === 'IPv4' && !item.internal && isPassportLanAddress(item.address))
        .map(item => ({ name, address: item.address })))
}
