# Sidetree Algorand

`sidetree-algorand` is a public Decentralized Identifier (DID) network that implements the `sidetree` protocol on top of Algorand. This project is inspired from `sidetree-bitcoin` and `ion`.

This project is meant to be used with `sidetree-core` and `sidetree-ipfs`

### NOTE:

- Algorand SDK client/algod.js needs to be updated manually for now as github and npm are out of sync
- Create DIDs by POSTing to /
- Resolve DIDs by GETing to /{did}
