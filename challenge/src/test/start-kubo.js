// Script to start IPFS (Kubo) for testing mintpass challenge
// Based on https://github.com/plebbit/plebbit-react-hooks/blob/master/test/test-server/start-ipfs.js
// Configured for local-only testing without external network dependencies

import {exec, execSync} from 'child_process';
import {temporaryDirectory as getTmpFolderPath} from 'tempy';
import {path as ipfsPath} from 'kubo';
import assert from 'assert';

const startIpfs = ({apiPort = 5001, gatewayPort = 8080, args = '--enable-pubsub-experiment --enable-namesys-pubsub'} = {}) => {
  assert.equal(typeof apiPort, 'number')
  assert.equal(typeof gatewayPort, 'number')

  const ipfsDataPath = getTmpFolderPath()
  console.log(`Starting IPFS with data path: ${ipfsDataPath}`)
  
  // init ipfs binary
  try {
    execSync(`IPFS_PATH="${ipfsDataPath}" "${ipfsPath()}" init`, {stdio: 'inherit'})
  } catch (e) {
    console.log('IPFS already initialized or error during init:', e.message)
  }

  // allow * origin on ipfs api to bypass cors browser error
  // very insecure do not do this in production
  execSync(`IPFS_PATH="${ipfsDataPath}" "${ipfsPath()}" config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'`, {stdio: 'inherit'})

  // needed for ipns if-none-match
  execSync(`IPFS_PATH="${ipfsDataPath}" "${ipfsPath()}" config --json Gateway.HTTPHeaders.Access-Control-Allow-Headers '["*"]'`, {stdio: 'inherit'})

  // disable subdomain gateway
  execSync(
    `IPFS_PATH="${ipfsDataPath}" "${ipfsPath()}" config --json Gateway.PublicGateways '${JSON.stringify({'127.0.0.1': {Paths: ['/ipfs', '/ipns'], UseSubdomains: false}})}'`,
    {stdio: 'inherit'}
  )

  // set ports
  execSync(`IPFS_PATH="${ipfsDataPath}" "${ipfsPath()}" config Addresses.API /ip4/127.0.0.1/tcp/${apiPort}`, {stdio: 'inherit'})
  execSync(`IPFS_PATH="${ipfsDataPath}" "${ipfsPath()}" config Addresses.Gateway /ip4/127.0.0.1/tcp/${gatewayPort}`, {stdio: 'inherit'})

  // Enable Routing.Type none for isolated testing (keeps tests fast and reliable)
  execSync(`IPFS_PATH="${ipfsDataPath}" "${ipfsPath()}" config Routing.Type none`, {stdio: 'inherit'})
  console.log('✅ Set Routing.Type to none for isolated local testing')

  // add hello for monitoring
  try {
    execSync(`echo "hello" | IPFS_PATH="${ipfsDataPath}" "${ipfsPath()}" add -`, {stdio: 'inherit'})
  } catch (e) {
    console.log('Error adding hello file:', e.message)
  }

  // start ipfs daemon
  const ipfsProcess = exec(`IPFS_PATH="${ipfsDataPath}" "${ipfsPath()}" daemon ${args}`)
  console.log(`IPFS daemon started with pid ${ipfsProcess.pid}`)
  console.log(`API: http://127.0.0.1:${apiPort}`)
  console.log(`Gateway: http://127.0.0.1:${gatewayPort}`)
  console.log(`🔧 Local-only mode: Routing.Type = none (no external peers)`)
  
  ipfsProcess.stderr.on('data', (data) => {
    console.error('IPFS stderr:', data.toString())
  })
  ipfsProcess.stdout.on('data', (data) => {
    console.log('IPFS stdout:', data.toString())
  })
  ipfsProcess.on('error', console.error)
  ipfsProcess.on('exit', (code) => {
    console.error(`IPFS process with pid ${ipfsProcess.pid} exited with code ${code}`)
    process.exit(code || 1)
  })
  
  // Cleanup on exit
  process.on('exit', () => {
    try {
      execSync(`kill ${ipfsProcess.pid}`)
    } catch (e) {
      // Process might already be dead
    }
  })
  process.on('SIGINT', () => {
    console.log('\nShutting down IPFS...')
    try {
      execSync(`kill ${ipfsProcess.pid}`)
    } catch (e) {
      // Process might already be dead
    }
    process.exit(0)
  })

  const ipfsDaemonIsReady = () =>
    new Promise((resolve) => {
      ipfsProcess.stdout.on('data', (data) => {
        if (data.toString().match('Daemon is ready')) {
          console.log('✅ IPFS daemon is ready for local testing!')
          resolve()
        }
      })
    })

  return {
    ipfsDaemonIsReady,
    process: ipfsProcess,
    dataPath: ipfsDataPath
  }
}

// If run directly, start IPFS and keep it running
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Starting IPFS daemon for mintpass automated testing...')
  console.log('🔧 Using Routing.Type=none for isolated local testing')
  const ipfsInstance = startIpfs()
  ipfsInstance.ipfsDaemonIsReady().then(() => {
    console.log('IPFS is ready for automated testing.')
    console.log('This IPFS instance runs in local-only mode with no external peer discovery.')
  }).catch(console.error)
}

export default startIpfs 