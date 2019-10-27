import { IAlgorandConfig } from './IAlgorandConfig';
const algosdk = require('algosdk');
import TransactionModel from '@decentralized-identity/sidetree/dist/lib/common/models/TransactionModel';
import TransactionStore from './TransactionStore';
import TransactionNumber from './TransactionNumber';
import * as request from 'request';

export interface IBlockchainTime {
  time: number;
  hash: string;
}

export interface IBlockInfo {
  height: number;
  hash: string;
}

export interface AlgorandAccount {
  sk: Uint8Array;
  addr: string;
}

export default class AlgorandProcessor {
  // Token for algorand REST API
  private readonly algodToken: string;

  // URL for Algorand REST API
  public readonly algodServer: string;

  // Port for Algorand REST API
  public readonly algodPort: string;

  // Algod client
  private algodClient: any;

  // Algo Round Hash Mapper Service URL
  public readonly algoRoundHashMapperURL: string;

  // Prefix used to identify sidetree-algorand transactions in Algorand's blockchain
  public readonly sidetreePrefix: string;

  // The first sidetree-algorand block in Algorand's blockchain
  public readonly genesisBlockNumber: number;

  // Store for state of sidetree-algorand transactions
  private readonly transactionStore: TransactionStore;

  // Algorand Account
  private readonly algorandAccount: AlgorandAccount;

  // Number of items to return per page
  public pageSize: number;

  // Request timeout in ms
  public requestTimeout: number;

  // max number of request retries
  public maxRetries: number;

  // number of seconds between transaction queries
  public pollPeriod: number;

  // last seen block
  private lastSeenBlock: IBlockInfo | undefined;

  // poll timeout ID
  private pollTimeoutId: number | undefined;

  public constructor(config: IAlgorandConfig) {
    this.algodToken = config.algodToken;
    this.algodServer = config.algodServer;
    this.algodPort = config.algodPort;
    this.algodClient = new algosdk.Algod(
      this.algodToken,
      this.algodServer,
      this.algodPort
    );
    this.algoRoundHashMapperURL = config.algoRoundHashMapperURL;
    this.sidetreePrefix = config.sidetreeTransactionPrefix;
    this.genesisBlockNumber = config.genesisBlockNumber;
    this.transactionStore = new TransactionStore(
      config.mongoDbConnectionString,
      config.databaseName
    );
    this.algorandAccount = <AlgorandAccount>(
      algosdk.mnemonicToSecretKey(config.algorandMnemonic)
    );
    this.pageSize = config.transactionFetchPageSize;
    this.requestTimeout = config.requestTimeoutInMilliseconds || 300;
    this.maxRetries = config.requestMaxRetries || 3;
    this.pollPeriod = config.transactionPollPeriodInSeconds || 60;
  }

  /**
   * Generates an Algorand account and returns the secret key
   */
  public static generatePrivateKey(): Uint8Array {
    // FIXME: might not work
    return (<AlgorandAccount>algosdk.generateAccount()).sk;
  }

  public async initialize() {
    console.debug('Initializing ITransactionStore');
    await this.transactionStore.initialize();
    const address = this.algorandAccount.addr;
    console.debug(`Checking if algorand contains a account for ${address}`);
    if (!(await this.accountExists(address))) {
      throw new Error('Algorand account does not exist');
    } else {
      console.debug('Account found');
    }
    console.debug('Synchronizing blocks for sidetree transactions...');
    const lastKnownTransaction = await this.transactionStore.getLastTransaction();
    if (lastKnownTransaction) {
      console.info(
        `Last known block ${lastKnownTransaction.transactionTime} (${lastKnownTransaction.transactionTimeHash})`
      );
      this.lastSeenBlock = {
        height: lastKnownTransaction.transactionTime,
        hash: lastKnownTransaction.transactionTimeHash
      };
      this.lastSeenBlock = await this.processTransactions(this.lastSeenBlock);
    } else {
      this.lastSeenBlock = await this.processTransactions();
    }

    // disabling floating promise lint since periodicPoll should just float in the background event loop
    /* tslint:disable-next-line:no-floating-promises */
    this.periodicPoll();
  }

  /**
   * Gets the blockchain time of the given time hash
   * If hash is not given, gets the latest logical blockchain time
   * @param hash blockchain time hash
   * @returns the current or associated blockchain time of the given hash
   */
  public async time(hash?: string): Promise<IBlockchainTime> {
    console.info(`Getting time ${hash ? 'of time hash' + hash : ''}`);
    if (!hash) {
      const blockHeight = await this.getCurrentBlockHeight();
      hash = await this.getBlockHash(blockHeight);
      return {
        time: blockHeight,
        hash
      };
    }

    const blockHeight = await this.getBlockHeight(hash);
    if (blockHeight === -1) throw new Error('Unable to get block height');
    const response = await this.algodClient.block(blockHeight);
    return {
      hash: response.hash,
      time: response.round
    };
  }

  /**
   * fetches sidetree transactions in chronological order from since or genesis
   * @param since a transaction number
   * @param hash the associated transaction time hash
   * @returns transactions since given transaction number
   */
  public async transactions(
    since?: number,
    hash?: string
  ): Promise<{
    transactions: TransactionModel[];
    moreTransactions: boolean;
  }> {
    if ((since && !hash) || (!since && hash)) {
      throw new Error('Bad Request');
    } else if (since && hash) {
      if (
        !(await this.verifyBlock(TransactionNumber.getBlockNumber(since), hash))
      ) {
        console.info('Requested transactions hash mismatched blockchain');
        throw new Error('Bad Request');
      }
    }

    console.info(
      `Returning transactions since ${
        since ? 'block' + TransactionNumber.getBlockNumber(since) : 'beginning'
      }...`
    );
    let transactions = await this.transactionStore.getTransactionsLaterThan(
      since,
      this.pageSize
    );

    transactions = transactions.map(transaction => {
      return {
        transactionNumber: transaction.transactionNumber,
        transactionTime: transaction.transactionTime,
        transactionTimeHash: transaction.transactionTimeHash,
        anchorString: transaction.anchorString
      };
    });

    return {
      transactions,
      moreTransactions: transactions.length === this.pageSize
    };
  }

  /**
   * given an ordered list of sidetree transactions, returns the first transaction in the list that is valid
   * @param transactions list of transactions to check
   * @returns the first valid transaction, or undefined if none are valid
   */
  public async firstValidTransaction(
    transactions: TransactionModel[]
  ): Promise<TransactionModel | undefined> {
    for (let index = 0; index < transactions.length; index++) {
      const transaction = transactions[index];
      const height = transaction.transactionTime;
      const hash = transaction.transactionTimeHash;

      if (await this.verifyBlock(height, hash)) {
        return transaction;
      }
    }
    return;
  }

  /**
   * writes a sidetree transaction to the underlying Algorand's blockchain
   * @param anchorString the string to be written as part of the transaction
   */
  public async writeTransaction(anchorString: string) {
    console.info(`Anchoring string ${anchorString}`);
    const sidetreeTransactionString = `${this.sidetreePrefix}${anchorString}`;

    const address = this.algorandAccount.addr;
    const accountInformation = await this.algodClient.accountInformation(
      address
    );
    const params = await this.algodClient.getTransactionParams();

    if (params.fee >= accountInformation.amount) {
      throw new Error(
        `Not enough algos to broadcast. Failed to broadcast anchor string ${anchorString}`
      );
    }

    const txn = {
      from: address,
      to: address,
      fee: params.fee,
      amount: 0,
      firstRound: params.lastRound,
      lastRound: params.lastRound + 1000,
      genesisID: params.genesisID,
      genesisHash: params.genesishashb64,
      note: algosdk.encodeObj(sidetreeTransactionString)
    };

    const signedTxn = await algosdk.signTransaction(
      txn,
      this.algorandAccount.sk
    );

    if (!(await this.broadcastTransaction(signedTxn.blob))) {
      throw new Error(`Could not broadcast transaction ${JSON.stringify(txn)}`);
    }
    console.info(`Successfully submitted transaction ${JSON.stringify(txn)}`);
  }

  private async getBlockHash(round: number): Promise<string> {
    console.info(`Getting hash for block ${round}`);
    const block = await this.algodClient.block(round);
    return block.hash;
  }

  private async getBlockHeight(hash: string): Promise<number> {
    console.info(`Getting height for block hash ${hash}`);
    request.get(
      `${this.algoRoundHashMapperURL}/${hash}`,
      { json: true },
      (err, _res, body) => {
        if (err) return console.error(err);
        return body.round;
      }
    );
    return -1;
  }

  /**
   * Broadcasts a transaction to the algorand network
   * @param transaction transaction to broadcast
   */
  private async broadcastTransaction(
    transaction: any /* AlgorandTransaction */
  ): Promise<boolean> {
    const rawTransaction = transaction.blob;
    const response = await this.algodClient.sendRawTransaction(rawTransaction);
    return response.length > 0;
  }

  /**
   * will process transactions every interval seconds
   * @param interval number of seconds between each query
   */
  private async periodicPoll(interval: number = this.pollPeriod) {
    if (this.pollTimeoutId) {
      clearTimeout(this.pollTimeoutId);
    }

    try {
      const syncedTo = await this.processTransactions(this.lastSeenBlock);
      this.lastSeenBlock = syncedTo;
    } catch (error) {
      console.error(error);
    } finally {
      this.pollTimeoutId = setTimeout(
        this.periodicPoll.bind(this),
        1000 * interval,
        interval
      );
    }
  }

  /**
   * processes transactions from startBlock (or genesis) to endBlockHeight (or tip)
   * @param startBlock the block to begin from (inclusive)
   * @param endBlockHeight the block height to stop on (inclusive)
   * @returns the block height and hash it processed
   */
  private async processTransactions(
    startBlock?: IBlockInfo,
    endBlockHeight?: number
  ): Promise<IBlockInfo> {
    let startBlockHeight: number;

    if (startBlock) {
      const startValid = await this.verifyBlock(
        startBlock.height,
        startBlock.hash
      );
      startBlockHeight = startBlock.height;
      if (!startValid) {
        startBlockHeight = await this.revertBlockchainCache();
      }
    } else {
      startBlockHeight = this.genesisBlockNumber;
    }

    if (!endBlockHeight) {
      endBlockHeight = await this.getCurrentBlockHeight();
    }

    if (
      startBlockHeight < this.genesisBlockNumber ||
      endBlockHeight < this.genesisBlockNumber
    ) {
      throw new Error('Cannot process Transactions before genesis');
    }

    console.info(
      `Processing transactions from ${startBlockHeight} to ${endBlockHeight}`
    );

    for (
      let blockHeight = startBlockHeight;
      blockHeight < endBlockHeight;
      blockHeight++
    ) {
      await this.processBlock(blockHeight);
    }

    const hash = await this.processBlock(endBlockHeight);
    console.info(
      `Finished processing blocks ${startBlockHeight} to ${endBlockHeight}`
    );
    return {
      hash,
      height: endBlockHeight
    };
  }

  /**
   * Begins to revert the blockchain cache until consistent
   * @returns last valid block height before the fork
   */
  private async revertBlockchainCache(): Promise<number> {
    console.info('Reverting transactions');

    // Keep reverting until a valid tx is found
    while ((await this.transactionStore.getTransactionsCount()) > 0) {
      const exponentiallySpacedTransactions = await this.transactionStore.getExponentiallySpacedTransactions();

      const firstValidTransaction = await this.firstValidTransaction(
        exponentiallySpacedTransactions
      );

      let revertToTransactionNumber: number;

      if (firstValidTransaction) {
        revertToTransactionNumber =
          TransactionNumber.construct(
            firstValidTransaction.transactionTime + 1,
            0
          ) - 1;
      } else {
        const lowestHeight =
          exponentiallySpacedTransactions[
            exponentiallySpacedTransactions.length - 1
          ].transactionTime;
        revertToTransactionNumber = TransactionNumber.construct(
          lowestHeight,
          0
        );
      }

      console.debug(
        `Removing transactions since ${TransactionNumber.getBlockNumber(
          revertToTransactionNumber
        )}`
      );
      await this.transactionStore.removeTransactionsLaterThan(
        revertToTransactionNumber
      );

      if (firstValidTransaction) {
        console.info(
          `Reverted transactions to block ${firstValidTransaction.transactionTime}`
        );
        return firstValidTransaction.transactionTime;
      }
    }

    console.info(`Reverted all known transactions`);
    return this.genesisBlockNumber;
  }

  /**
   * Gets the current Algorand block height
   * @returns the latest block number
   */
  private async getCurrentBlockHeight(): Promise<number> {
    console.info('Getting current block height...');
    let lastRound = (await this.algodClient.status()).lastRound;
    return lastRound;
  }

  /**
   * Given an Algorand block height and hash, verifies against the chain
   * @param height block height to verify
   * @param hash block hash to verify
   * @returns true if valid, false otherwise
   */
  private async verifyBlock(height: number, hash: string): Promise<boolean> {
    console.info(`Verifying block ${height} (${hash})`);
    const responseData = await this.getBlockHash(height);

    console.debug(`Retrieved block ${height} (${responseData})`);
    return hash === responseData;
  }

  /**
   * Given an Algorand block height, processes that block for sidetree transactions
   * @param height block height to process
   * @returns the block hash processed
   */
  private async processBlock(height: number): Promise<string> {
    console.info(`Processing block ${height}`);

    function sleep(ms: number) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    await sleep(250);
    const responseData = await this.algodClient.block(height);

    const transactions = (responseData.txns.transactions as Array<any>) || [];
    const blockHash = responseData.hash;

    console.debug(
      `Block ${height} contains ${transactions.length} transactions`
    );

    for (
      let transactionIndex = 0;
      transactionIndex < transactions.length;
      transactionIndex++
    ) {
      let transaction = transactions[transactionIndex];
      if (!transaction.noteb64) {
        // Doesn't have a note field, we can skip
        continue;
      }

      const data = JSON.stringify(algosdk.decodeObj(transaction.noteb64));
      if (data.startsWith(this.sidetreePrefix)) {
        // We have found a sidetree transaction
        const sidetreeTransaction: TransactionModel = {
          transactionNumber: TransactionNumber.construct(
            height,
            transactionIndex
          ),
          transactionTime: height,
          transactionTimeHash: blockHash,
          anchorString: data.slice(this.sidetreePrefix.length)
        };

        console.debug(
          `Sidetree transaction found; adding ${JSON.stringify(
            sidetreeTransaction
          )}`
        );
        await this.transactionStore.addTransaction(sidetreeTransaction);
        // Stop processing future anchor strings. Protocol defines only the first should be considered.
        break;
      }
    }
    return blockHash;
  }

  /**
   * checks if the algorand peer has a account open for a given address
   * @param address the algorand address to check
   * @returns true if a account exists, false otherwise
   */
  private async accountExists(address: string) {
    const response = await this.algodClient.accountInformation(address);
    return response.address === address;
  }
}
