import * as getRawBody from 'raw-body';
import * as Koa from 'koa';
import * as Router from 'koa-router';
import * as queryString from 'querystring';
import { request } from 'https';

interface AlgorandServiceConfig {
  algod: string;
  port: number;
  sidetreeTransactionPrefix: string;
  mongoDbConnectionString: string;
  databaseName: string | undefined;
  transactionFetchPageSize: number;
  requestTimeoutInMilliseconds: number | undefined;
  requestMaxRetries: number | undefined;
  transactionPollPeriodInSeconds: number | undefined;
}

const configFilePath =
  process.env.SIDETREE_ALGORAND_CONFIG_FILE_PATH ||
  '../json/algorand-config.json';
const config: AlgorandServiceConfig = require(configFilePath);
const app = new Koa();

// Raw body parser
app.use(async (ctx, next) => {
  ctx.body = await getRawBody(ctx.req);
  await next();
});

const router = new Router();

router.get('/transactions', async (ctx, _next) => {
  const params = queryString.parse(ctx.querystring);

  let requestHandler;
  if ('since' in params && 'transaction-time-hash' in params) {
    const since = Number(params['since']);
    const transactionTimeHash = String(params['transaction-time-hash']);
    requestHandler = () =>
      blockchainService.transactions(since, transactionTimeHash);
  } else {
    requestHandler = () => blockchainService.transactions();
  }

  await handleRequestAndSetKoaResponse(requestHandler, ctx.response);
});

router.post('/transactions', async (ctx, _next) => {
  const writeRequest = JSON.parse(ctx.body);
  const requestHandler = () =>
    blockchainService.writeTransaction(writeRequest.anchorFileHash);
  await handleRequestAndSetKoaResponse(requestHandler, ctx.response);
});

router.post('/transactions/firstValid', async (ctx, _next) => {
  const transactionsObject = JSON.parse(ctx.body);
  const requestHandler = () =>
    blockchainService.firstValidTransaction(transactionsObject.transactions);
  await handleRequestAndSetKoaResponse(requestHandler, ctx.response);
});

router.get('/time', async (ctx, _next) => {
  const requestHandler = () => blockchainService.time();
  await handleRequestAndSetKoaResponse(requestHandler, ctx.response);
});

router.get('/time/:hash', async (ctx, _next) => {
  const requestHandler = () => blockchainService.time(ctx.params.hash);
  await handleRequestAndSetKoaResponse(requestHandler, ctx.response);
});

app.use(router.routes()).use(router.allowedMethods());

// Handler to return bad request for unhandled paths
app.use((ctx, _next) => {
  ctx.response.status = 400;
});

const port = process.env.SIDETREE_ALGORAND_PORT || config.port;

// Initialize the blockchain service
let server: any;
let blockchainService: any; // TODO: update to SidetreeAlgorandProcessor
/*
try {
  blockchainService = new SidetreeBitcoinProcessor(config);

  // SIDETREE_TEST_MODE enables unit testing of this file by bypassing blockchain service initialization.
  if (process.env.SIDETREE_TEST_MODE === 'true') {
    server = app.listen(port);
  } else {
    blockchainService.initialize()
    .then(() => {
      server = app.listen(port, () => {
        console.log(`Sidetree-Bitcoin node running on port: ${port}`);
      });
    })
    .catch((error) => {
      console.error(`Sidetree-Bitcoin node initialization failed with error: ${error}`);
      process.exit(1);
    });
  }
} catch (error) {
  console.log('Is bitcoinWalletImportString valid? Consider using testnet key generated below:');
  console.log(SidetreeBitcoinProcessor.generatePrivateKey('testnet'));
  process.exit(1);
}
*/
console.info('Sidetree-algorand service configuration:');
console.info(config);

/**
 * Handles the request using the given request handler then assigns the returned value as the body
 * @param requestHandler Request handler function
 * @param koaResponse Response object to update
 */
async function handleRequestAndSetKoaResponse(
  requestHandler: () => Promise<any>,
  koaResponse: Koa.Response
) {
  try {
    const responseBody = await requestHandler();
    koaResponse.status = 200;
    koaResponse.set('Content-Type', 'application/json');

    if (responseBody) {
      koaResponse.body = JSON.stringify(responseBody);
    } else {
      koaResponse.body = '';
    }
  } catch (error) {
    console.error(error);
    if (error.status) {
      koaResponse.status = error.status;
    }

    if (error.code) {
      koaResponse.body = JSON.stringify({
        code: error.code
      });
    }
  }
}

export { server, blockchainService };
