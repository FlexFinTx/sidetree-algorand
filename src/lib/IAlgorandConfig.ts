export interface IAlgorandConfig {
  algodToken: string;
  algodServer: string;
  algodPort: string;
  algoRoundHashMapperURL: string;
  algorandMnemonic: string;
  port: number;
  genesisBlockNumber: number;
  sidetreeTransactionPrefix: string;
  mongoDbConnectionString: string;
  databaseName: string | undefined;
  transactionFetchPageSize: number;
  requestTimeoutInMilliseconds: number | undefined;
  requestMaxRetries: number | undefined;
  transactionPollPeriodInSeconds: number | undefined;
}
