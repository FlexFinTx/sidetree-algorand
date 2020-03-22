# Sidetree Algorand

`sidetree-algorand` is a public Decentralized Identifier (DID) network that implements the `sidetree` protocol on top of Algorand. This project is inspired from `sidetree-bitcoin` and `ion`.

This project is meant to be used with `sidetree-core` and `sidetree-ipfs`

### NOTE:

- Algorand SDK client/algod.js needs to be updated manually for now as github and npm are out of sync
- Create DIDs by POSTing to /
- Resolve DIDs by GETing to /{did}
- Create DID example request: https://repl.it/repls/MildCrushingPaint
- Change code in `getFee()` function of `Blockchain.js` in `sidetree/dist/lib/core/Blockchain.js`
- Increase `maxOperationByteSize` in `sidetree/dist/lib/core/versions/0.6.1/protocol-parameters.json` to 10000

```
getFee(transactionTime) {
        return __awaiter(this, void 0, void 0, function* () {
            /*const readUri = `${this.feeUri}/${transactionTime}`;
            const response = yield this.fetch(readUri);
            const responseBodyString = yield ReadableStream_1.default.readAll(response.body);
            const responseBody = JSON.parse(responseBodyString.toString());
            if (response.status === HttpStatus.BAD_REQUEST &&
                responseBody.code === SharedErrorCode_1.default.BlockchainTimeOutOfRange) {
                throw new SidetreeError_1.default(SharedErrorCode_1.default.BlockchainTimeOutOfRange);
            }
            if (response.status !== HttpStatus.OK) {
                console.error(`Blockchain read error response status: ${response.status}`);
                console.error(`Blockchain read error body: ${responseBodyString}`);
                throw new SidetreeError_1.default(CoreErrorCode_1.default.BlockchainGetFeeResponseNotOk);
            }
            return responseBody.normalizedTransactionFee;*/
            return -1;
        });
    }
```

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
