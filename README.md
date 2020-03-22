# Sidetree Algorand

`sidetree-algorand` is a public Decentralized Identifier (DID) network that implements the `sidetree` protocol on top of Algorand. This project is inspired from `sidetree-bitcoin` and `ion`.

This project is meant to be used with `sidetree-core` and `sidetree-ipfs`

### NOTE:

- Algorand SDK client/algod.js needs to be updated manually for now as github and npm are out of sync
- Create DIDs by POSTing to /
- Resolve DIDs by GETing to /{did}

### RUN:

NOTE: Algorand Round-Hash Mapper needs to be running

```
git clone https://github.com/FlexFinTx/sidetree-algorand.git
cd sidetree-algorand
npm install
npm run build
sudo docker-compose build
sudo docker-compose up -d
npm run ipfs
npm run algorand
npm run core
```

### TODO:

- Discuss data format for sidetree create operation
- discuss monorepo structure and inclusion in dif sidetree
