import * as getRawBody from 'raw-body';
import * as Koa from 'koa';
import * as Router from 'koa-router';

import {
  SidetreeIpfsService,
  SidetreeResponse,
  SidetreeResponseModel,
  SidetreeCore
} from '@decentralized-identity/sidetree';
import { request } from 'http';
import { ResponseStatus } from '@decentralized-identity/sidetree/dist/lib/common/Response';

interface IPFSConfig {
  port: number;
  fetchTimeoutInSeconds: number;
}

const config: IPFSConfig = require('../json/ipfs-config.json');
const requestHandler = new SidetreeIpfsService(config.fetchTimeoutInSeconds);
const app = new Koa();

// Raw body parser.
app.use(async (ctx, next) => {
  ctx.body = await getRawBody(ctx.req);
  await next();
});

const router = new Router();

router.get('/:hash', async (ctx, _next) => {
  const response = await requestHandler.handleFetchRequest(
    ctx.params.hash,
    ctx.query['max-size']
  );
  setKoaResponse(response, ctx.response, 'application-octet/stream');
});

router.post('/', async (ctx, _next) => {
  const response = await requestHandler.handleWriteRequest(ctx.body);
  setKoaResponse(response, ctx.response);
});

app.use(router.routes()).use(router.allowedMethods());

// Handler to return bad requests for unhandled paths
app.use((ctx, _next) => {
  ctx.response.status = 400;
});

const port = config.port;

const server = app
  .listen(port, () => {
    console.log(`Sidetree-algorand-IPFS node running on port: ${port}`);
  })
  .on('error', error => {
    console.error(
      `${error.message} on starting Sidetree-algorand-IPFS service`
    );
  });

// Graceful
process.on('SIGTERM', () => {
  requestHandler.ipfsStorage.stop();
  process.exit();
});
process.on('SIGINT', () => {
  requestHandler.ipfsStorage.stop();
  process.exit();
});
process.on('SIGHUP', () => {
  requestHandler.ipfsStorage.stop();
  process.exit();
});
process.on('uncaughtException', () => {
  requestHandler.ipfsStorage.stop();
  process.exit();
});

/**
 * Sets the koa response according to the Sidetree response object given.
 * @param response Response object fetched from request handler.
 * @param koaResponse Koa Response object to be filled
 * @param contentType Content type to be set for response, defaults to application/json
 */
function setKoaResponse(
  response: SidetreeResponseModel,
  koaResponse: Koa.Response,
  contentType?: string
) {
  koaResponse.status = SidetreeResponse.toHttpStatus(response.status);
  if (contentType) {
    koaResponse.set('Content-Type', contentType);
  } else {
    koaResponse.set('Content-Type', 'application/json');
  }

  if (response.body) {
    koaResponse.body = response.body;
  } else {
    // Need to set this explciitly
    koaResponse.body = '';
  }
}

module.exports = server;
