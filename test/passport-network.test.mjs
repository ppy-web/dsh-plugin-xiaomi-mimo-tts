import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule } from './helpers/client-modules.mjs'

const { passportAddresses } = await loadClientModule('src/passport/network.ts')
const ipv4 = (address, internal = false) => ({ address, internal, family: 'IPv4', netmask: '255.255.255.0', cidr: `${address}/24`, mac: '00:11:22:33:44:55' })

test('device connection addresses include Windows mobile hotspots alongside ordinary LAN adapters', () => {
  for (const name of ['本地连接* 2', 'Local Area Connection* 2']) {
    const addresses = passportAddresses({
      Ethernet: [ipv4('192.168.121.120')],
      [name]: [ipv4('192.168.137.1')],
    })
    assert.ok(addresses.some(item => item.name === name && item.address === '192.168.137.1'), 'hotspot devices need the host address on their own network')
    assert.ok(addresses.some(item => item.address === '192.168.121.120'))
  }
})

test('connection address discovery omits loopback, public, IPv6 and unrelated VM adapters', () => {
  const addresses = passportAddresses({
    Ethernet: [ipv4('10.0.0.10'), ipv4('198.51.100.10'), ipv4('127.0.0.1', true), { ...ipv4('fe80::1'), family: 'IPv6' }],
    'vEthernet (Default Switch)': [ipv4('172.20.0.1')],
    'VMware Network Adapter': [ipv4('192.168.80.1')],
    'VirtualBox Host-Only': [ipv4('192.168.56.1')],
    Offline: undefined,
  })
  assert.ok(addresses.some(item => item.address === '10.0.0.10'))
  for (const address of ['198.51.100.10', '127.0.0.1', 'fe80::1', '172.20.0.1', '192.168.80.1', '192.168.56.1']) {
    assert.ok(!addresses.some(item => item.address === address))
  }
})
