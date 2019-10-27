import ITransactionStore from '@decentralized-identity/sidetree/dist/lib/core/interfaces/ITransactionStore';
import TransactionModel from '@decentralized-identity/sidetree/dist/lib/common/models/TransactionModel';
import { Collection, Db, Long, MongoClient } from 'mongodb';

export default class TransactionStore implements ITransactionStore {
  // Default database name if not specified
  public static readonly defaultDatabaseName: string = 'sidetree';
  // Collection name for transactions
  public static readonly transactionCollectionName: string = 'transactions';
  // Database name used by the transaction store
  public readonly databaseName: string;
  // Server URL for Mongo
  private serverUrl: string;

  private db: Db | undefined;
  private transactionCollection: Collection<any> | undefined;

  constructor(serverUrl: string, databaseName?: string) {
    this.serverUrl = serverUrl;
    this.databaseName = databaseName
      ? databaseName
      : TransactionStore.defaultDatabaseName;
  }

  // Initialize the MongoDB transaction store
  public async initialize(): Promise<void> {
    const client = await MongoClient.connect(this.serverUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    this.db = client.db(this.databaseName);
    this.transactionCollection = await TransactionStore.createTransactionCollectionIfNotExist(
      this.db
    );
  }

  private static async createTransactionCollectionIfNotExist(
    db: Db
  ): Promise<Collection<TransactionModel>> {
    const collections = await db.collections();
    const collectionNames = collections.map(
      (collection: Collection<any>) => collection.collectionName
    );

    let transactionCollection;
    if (collectionNames.includes(TransactionStore.transactionCollectionName)) {
      console.info('Transaction collection exists');
      transactionCollection = db.collection(
        TransactionStore.transactionCollectionName
      );
    } else {
      console.info('Transaction collection does not exist, creating...');
      transactionCollection = await db.createCollection(
        TransactionStore.transactionCollectionName
      );

      await transactionCollection.createIndex(
        { transactionNumber: 1 },
        { unique: true }
      );
      console.info('Transaction collection created');
    }

    return transactionCollection;
  }

  public async getTransactionsCount(): Promise<number> {
    const transactionCount = await this.transactionCollection!.count();
    return transactionCount;
  }

  public async getTransaction(
    transactionNumber: number
  ): Promise<TransactionModel | undefined> {
    const transactions = await this.transactionCollection!.find({
      transactionNumber: Long.fromNumber(transactionNumber)
    }).toArray();
    if (transactions.length == 0) {
      return undefined;
    }

    const transaction = transactions[0];
    return transaction;
  }

  public async getTransactionsLaterThan(
    transactionNumber: number | undefined,
    max: number
  ): Promise<TransactionModel[]> {
    let transactions = [];

    try {
      if (!transactionNumber) {
        transactions = await this.transactionCollection!.find()
          .limit(max)
          .sort({ transactionNumber: 1 })
          .toArray();
      } else {
        transactions = await this.transactionCollection!.find({
          transactionNumber: { $gt: Long.fromNumber(transactionNumber) }
        })
          .limit(max)
          .sort({ transactionNumber: 1 })
          .toArray();
      }
    } catch (error) {
      console.error(error);
    }

    return transactions;
  }

  public async clearCollection() {
    await this.transactionCollection!.drop();
    this.transactionCollection = await TransactionStore.createTransactionCollectionIfNotExist(
      this.db!
    );
  }

  async addTransaction(transaction: TransactionModel): Promise<void> {
    try {
      const transactionForDb = {
        anchorString: transaction.anchorString,
        // MUST do this to force Int64 in MongoDB
        transactionNumber: Long.fromNumber(transaction.transactionNumber),
        transactionTime: transaction.transactionTime,
        transactionTimeHash: transaction.transactionTimeHash
      };
      await this.transactionCollection!.insertOne(transactionForDb);
    } catch (error) {
      // Swallow duplicate insert errors as no-op; throw others
      if (error.code !== 11000) {
        throw error;
      }
    }
  }

  async getLastTransaction(): Promise<TransactionModel | undefined> {
    const lastTransactions = await this.transactionCollection!.find()
      .limit(1)
      .sort({ transactionNumber: -1 })
      .toArray();
    if (lastTransactions.length === 0) {
      return undefined;
    }

    const lastProcessedTransaction = lastTransactions[0];
    return lastProcessedTransaction;
  }

  async getExponentiallySpacedTransactions(): Promise<TransactionModel[]> {
    const exponentiallySpacedTransactions: TransactionModel[] = [];
    const allTransactions = await this.transactionCollection!.find()
      .sort({ transactionNumber: 1 })
      .toArray();

    let index = allTransactions.length - 1;
    let distance = 1;
    while (index >= 0) {
      exponentiallySpacedTransactions.push(allTransactions[index]);
      index -= distance;
      distance *= 2;
    }
    return exponentiallySpacedTransactions;
  }

  async removeTransactionsLaterThan(transactionNumber?: number): Promise<void> {
    // If given `undefined`, remove all transactions.
    if (transactionNumber === undefined) {
      await this.clearCollection();
      return;
    }

    await this.transactionCollection!.deleteMany({
      transactionNumber: { $gt: Long.fromNumber(transactionNumber) }
    });
  }

  public async getTransactions(): Promise<TransactionModel[]> {
    const transactions = await this.transactionCollection!.find()
      .sort({ transactionNumber: 1 })
      .toArray();
    return transactions;
  }
}
