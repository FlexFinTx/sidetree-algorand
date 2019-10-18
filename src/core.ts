import * as getRawBody from 'raw-body';
import * as Koa from 'koa';
import * as Router from 'koa-router';
import {
  SidetreeConfig,
  SidetreeCore,
  SidetreeResponse,
  SidetreeResponseModel
} from '@decentralized-identity/sidetree';
import { ProtocolVersionModel } from '@decentralized-identity/sidetree/dist/lib/core/VersionManager';

// Configuration for this server
interface ServerConfig extends SidetreeConfig {
  port: number;
}

const config: ServerConfig = require('../json/core-config.json');
const protocolVersions: ProtocolVersionModel[] = require('../json/core-protocol-versioning.json');

const sidetreeCore = new SidetreeCore(config, protocolVersions);
const app = new Koa();

// Raw body parser.
app.use(async (ctx, next) => {
  ctx.body = await getRawBody(ctx.req);
  await next();
});

const router = new Router();
router.post('/', async (ctx, _next) => {
  const response = await sidetreeCore.handleOperationRequest(ctx.body);
  setKoaResponse(response, ctx.response);
});

router.get('/:didOrDidDocument', async (ctx, _next) => {
  const response = await sidetreeCore.handleResolveRequest(
    ctx.params.didOrDidDocument
  );
  setKoaResponse(response, ctx.response);
});

app.use(router.routes()).use(router.allowedMethods());

// Return bad request for unhandled paths
app.use((ctx, _next) => {
  ctx.response.status = 400;
});

sidetreeCore
  .initialize()
  .then(() => {
    const port = config.port;
    app.listen(port, () => {
      console.log(`Sidetree-algorand noderunning on port: ${port}`);
    });
  })
  .catch((error: Error) => {
    console.error(
      `Sidetree-algorand node initialization failed with error ${error}`
    );
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
